import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { executeQuery } from '../config/database.js';
import { env } from '../config/env.js';
import { isValidPAN } from '../utils/validators.js';
import { scanDocument } from '../utils/documentScanner.js';
import { sendAuditEmail } from '../utils/email.js';

const paramStr = (val: string | string[] | undefined): string =>
  Array.isArray(val) ? val[0] ?? '' : val ?? '';

const sanitizeSegment = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';

export const uploadPanFile = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode).trim().toUpperCase();
  const file = req.file;

  if (!customerCode) throw new AppError('Customer Code is required', 400);
  if (!file) throw new AppError('PAN PDF file is required', 400);

  const scan = await scanDocument('pan', file.buffer);
  const suppliedPan = String(req.body.panNumber ?? '').trim().toUpperCase();
  if (!scan.pan) throw new AppError('PAN number could not be detected from the uploaded document. Please upload a clearer PAN Card PDF or enter the PAN manually.', 422);
  if (suppliedPan && (!isValidPAN(suppliedPan) || suppliedPan !== scan.pan)) throw new AppError('PAN number does not match the uploaded PAN Card.', 422);

  // Verify customer exists
  const rows = await executeQuery<any>(
    'SELECT customer_code FROM customers WHERE customer_code = ?',
    [customerCode]
  );
  if (!rows.length) throw new AppError('Customer Code not found.', 404);

  // Fetch existing customer record for audit
  const [existingRows] = await executeQuery<any>(
    `SELECT pan_file_name, pan_file_type, pan_file_path, pan_number, pan_verification_status, global_customer_code, handling_agent_code FROM customers WHERE customer_code = ?`,
    [customerCode]
  );
  if (!existingRows.length) throw new AppError('Customer Code not found.', 404);
  const existing = existingRows[0];

  // Save file to disk
  const dir = path.join(env.UPLOAD_DIR, 'pan');
  await fs.mkdir(dir, { recursive: true });
  const safeName = `${sanitizeSegment(customerCode)}_PAN_${Date.now()}.pdf`;
  const filePath = path.join('pan', safeName);
  await fs.writeFile(path.join(env.UPLOAD_DIR, filePath), file.buffer);

  // Update customer record
  await executeQuery(
    `UPDATE customers SET pan_file_name = ?, pan_file_type = ?, pan_file_path = ?, pan_number = COALESCE(?, pan_number), pan_verification_status = 'VERIFIED' WHERE customer_code = ?`,
    [file.originalname, file.mimetype, filePath, scan.pan, customerCode]
  );

  // Prepare audit data after update
  const timestamp = new Date().toISOString();
  const submittedBy = undefined;

  // Fetch customer's global and handling codes for context (we already have from existingRows)
  const globalCode = existing.global_customer_code ?? null;
  const handlingCode = existing.handling_agent_code ?? null;

  // Determine changes (compare existing vs new values)
  const changes: { fieldName: string; oldValue: any; newValue: any }[] = [];
  const fields = [
    { field: 'pan_file_name', existing: existing.pan_file_name, newValue: file.originalname },
    { field: 'pan_file_type', existing: existing.pan_file_type, newValue: file.mimetype },
    { field: 'pan_file_path', existing: existing.pan_file_path, newValue: filePath },
    { field: 'pan_number', existing: existing.pan_number, newValue: scan.pan },
    { field: 'pan_verification_status', existing: existing.pan_verification_status, newValue: 'VERIFIED' },
  ];
  fields.forEach(f => {
    const existingVal = f.existing ?? null;
    const payloadVal = f.newValue ?? null;
    if (JSON.stringify(existingVal) !== JSON.stringify(payloadVal)) {
      changes.push({
        fieldName: f.field,
        oldValue: existingVal,
        newValue: payloadVal,
      });
    }
  });

  // Build executed query string (UPDATE)
  const setClauses = fields.map(f => {
    const val = f.newValue ?? null;
    const sqlVal = val === null ? 'NULL' : typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
    return `${f.field} = ${sqlVal}`;
  }).join(', ');
  const executedQuery = `UPDATE customers SET ${setClauses} WHERE customer_code = '${customerCode}';`;

  // Send audit email
  try {
    await sendAuditEmail({
      page: 'Old User', // Note: This endpoint is used by both Old User and New Entry flows, but we'll label as Old User for simplicity; could improve by detecting page from context.
      operation: 'UPDATE',
      table: 'customers',
      customerCode,
      globalCode,
      handlingAgentCode: handlingCode,
      changes,
      executedQuery,
      timestamp,
      submittedBy,
    });
  } catch (emailError) {
    console.error('[EMAIL AUDIT] Failed to send audit email for uploadPanFile:', emailError);
    // Don't fail the request if email fails
  }

  res.status(200).json({
    success: true,
    message: 'PAN file uploaded successfully',
    data: { fileName: file.originalname, filePath },
  });
});
