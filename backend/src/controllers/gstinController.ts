import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { withTransaction, executeQuery } from '../config/database.js';
import { validateGstin } from '../utils/validators.js';
import { env } from '../config/env.js';
import { addressesMatch, scanDocument } from '../utils/documentScanner.js';
import { isValidGSTIN } from '../utils/validators.js';
import { sendAuditEmail } from '../utils/email.js';

/** Safely extract a string route param (Express 5 types it as string | string[]). */
const paramStr = (val: string | string[] | undefined): string =>
  Array.isArray(val) ? val[0] ?? '' : val ?? '';

const sanitizeSegment = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';

const ensureUploadDir = async (subDir: string): Promise<string> => {
  const dir = path.join(env.UPLOAD_DIR, subDir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const verifyGstinFile = async (file: Express.Multer.File, gstin: string, address: string) => {
  const scan = await scanDocument('gstin', file.buffer);
  if (!scan.gstin || !scan.address) throw new AppError('GSTIN or registered address could not be detected. Please upload a clearer GST certificate.', 422);
  if (!isValidGSTIN(scan.gstin) || scan.gstin !== gstin.trim().toUpperCase()) throw new AppError('GSTIN number does not match the uploaded GST certificate.', 422);
  if (!address.trim() || !addressesMatch(address, scan.address)) throw new AppError('Business address does not match the GST certificate.', 422);
  return scan.address;
};

export const getCustomerGstins = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  if (!customerCode.trim()) {
    throw new AppError('Customer Code is required', 400);
  }

  const rows = await executeQuery<any>(
    `SELECT id, customer_code, state, state_code, gstin_number,
            file_name, file_type, file_path, registered_address,
            gstin_verification_status, address_verification_status,
            active, created_at, updated_at
     FROM customer_gstins
     WHERE customer_code = ?
     ORDER BY state_code, state`,
    [customerCode.trim().toUpperCase()]
  );

  const list = rows.map((r: any) => ({
    gstinId: r.id,
    customerCode: r.customer_code,
    state: r.state,
    stateCode: r.state_code,
    gstinNumber: r.gstin_number,
    fileName: r.file_name,
    fileType: r.file_type,
    filePath: r.file_path,
    hasFile: !!r.file_path,
    registeredAddress: r.registered_address,
    gstinStatus: r.gstin_verification_status,
    addressStatus: r.address_verification_status,
    activeFlag: r.active,
    createdDate: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedDate: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  }));

  res.status(200).json({
    success: true,
    data: list,
  });
});

export const createGstin = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  const file = req.file;

  if (!customerCode.trim()) {
    throw new AppError('Customer Code is required', 400);
  }

  const payload = {
    state: req.body.state,
    stateCode: req.body.stateCode,
    gstinNumber: req.body.gstinNumber,
    fileName: file?.originalname ?? req.body.fileName,
    fileType: file?.mimetype ?? req.body.fileType,
    fileBuffer: file?.buffer,
    activeFlag: req.body.activeFlag ?? 'Y',
  };

  const errors = validateGstin(payload, true);
  if (errors.length > 0) {
    throw new AppError('Validation failed', 400, { errors });
  }

  const result = await withTransaction(async (conn) => {
    const normalizedCustomerCode = customerCode.trim().toUpperCase();
    const normalizedGstinNumber = payload.gstinNumber.trim().toUpperCase();

    // Verify customer exists
    const [custRows] = await conn.execute(
      `SELECT customer_code FROM customers WHERE customer_code = ?`,
      [normalizedCustomerCode]
    );
    if (!(custRows as any[]).length) {
      throw new AppError('Customer Code not found.', 404, { customerCode });
    }

    // Check duplicate GSTIN
    const [dupRows] = await conn.execute(
      `SELECT id FROM customer_gstins WHERE customer_code = ? AND gstin_number = ?`,
      [normalizedCustomerCode, normalizedGstinNumber]
    );
    if ((dupRows as any[]).length) {
      throw new AppError('GSTIN already exists for this customer', 409);
    }

    // Save file to disk if provided
    let filePath: string | null = null;
    if (payload.fileBuffer && payload.fileBuffer.length > 0) {
      const dir = await ensureUploadDir('gstin');
      const safeName = `${sanitizeSegment(normalizedCustomerCode)}_${sanitizeSegment(normalizedGstinNumber)}_${Date.now()}.pdf`;
      filePath = path.join('gstin', safeName);
      await fs.writeFile(path.join(env.UPLOAD_DIR, filePath), payload.fileBuffer);
    }

    const [insertResult] = await conn.execute(
      `INSERT INTO customer_gstins (
        customer_code, state, state_code, gstin_number,
        file_name, file_type, file_path, registered_address,
        gstin_verification_status, address_verification_status, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedCustomerCode,
        payload.state.trim().slice(0, 50),
        payload.stateCode?.trim().slice(0, 2) ?? null,
        normalizedGstinNumber.slice(0, 15),
        payload.fileName?.trim().slice(0, 255) ?? null,
        payload.fileType?.trim().slice(0, 50) ?? null,
        filePath,
        file ? await verifyGstinFile(file, normalizedGstinNumber, String(req.body.address ?? '')) : null,
        file ? 'VERIFIED' : 'PENDING',
        file ? 'VERIFIED' : 'PENDING',
        (payload.activeFlag ?? 'Y').toUpperCase(),
      ]
    );

    const gstinId = (insertResult as any).insertId;

    // Prepare audit data
    const timestamp = new Date().toISOString();
    const submittedBy = undefined;

    // Fetch customer's global and handling codes for context
    const [custRowsGlobal] = await conn.execute(
      `SELECT global_customer_code, handling_agent_code FROM customers WHERE customer_code = ?`,
      [normalizedCustomerCode]
    ) as any;
    const globalCode = custRowsGlobal[0]?.global_customer_code ?? null;
    const handlingCode = custRowsGlobal[0]?.handling_agent_code ?? null;

    // Audit changes for GSTIN insert (we'll include key fields)
    const changes = [
      { fieldName: 'state', oldValue: null, newValue: payload.state.trim().slice(0, 50) },
      { fieldName: 'state_code', oldValue: null, newValue: payload.stateCode?.trim().slice(0, 2) ?? null },
      { fieldName: 'gstin_number', oldValue: null, newValue: normalizedGstinNumber.slice(0, 15) },
    ];

    // Build executed query string
    const cols = 'customer_code, state, state_code, gstin_number, file_name, file_type, file_path, registered_address, gstin_verification_status, address_verification_status, active';
    const vals = [
      `'${normalizedCustomerCode}'`,
      `'${payload.state.trim().slice(0, 50)}'`,
      payload.stateCode?.trim().slice(0, 2) ? `'${payload.stateCode.trim().slice(0, 2)}'` : 'NULL',
      `'${normalizedGstinNumber.slice(0, 15)}'`,
      payload.fileName?.trim().slice(0, 255) ? `'${payload.fileName.trim().slice(0, 255).replace(/'/g, "''")}'` : 'NULL',
      payload.fileType?.trim().slice(0, 50) ? `'${payload.fileType.trim().slice(0, 50).replace(/'/g, "''")}'` : 'NULL',
      filePath ? `'${filePath.replace(/'/g, "''")}'` : 'NULL',
      file ? await verifyGstinFile(file, normalizedGstinNumber, String(req.body.address ?? '')) ? `'VERIFIED'` : `'PENDING'` : `'NULL'`,
      file ? 'VERIFIED' : 'PENDING',
      file ? 'VERIFIED' : 'PENDING',
      `(payload.activeFlag ?? 'Y').toUpperCase()`,
    ].map(v => v === null ? 'NULL' : v).join(', ');
    const executedQuery = `INSERT INTO customer_gstins (${cols}) VALUES (${vals});`;

    // Send audit email
    try {
      await sendAuditEmail({
        page: 'Old User',
        operation: 'INSERT',
        table: 'customer_gstins',
        customerCode: normalizedCustomerCode,
        globalCode,
        handlingAgentCode: handlingCode,
        changes,
        executedQuery,
        timestamp,
        submittedBy,
      });
    } catch (emailError) {
      console.error('[EMAIL AUDIT] Failed to send audit email for createGstin:', emailError);
      // Don't fail the request if email fails
    }

    return { gstinId };
  });

  res.status(201).json({
    success: true,
    message: 'GSTIN added successfully',
    data: { gstinId: result.gstinId },
  });
});

export const updateGstin = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  const gstinId = paramStr(req.params.gstinId);
  const file = req.file;
  const id = Number(gstinId);

  if (!customerCode.trim()) throw new AppError('Customer Code is required', 400);
  if (!Number.isFinite(id)) throw new AppError('Valid GSTIN ID is required', 400);

  const normalizedCustomerCode = customerCode.trim().toUpperCase();

  const existingRows = await executeQuery<any>(
    `SELECT * FROM customer_gstins WHERE id = ? AND customer_code = ?`,
    [id, normalizedCustomerCode]
  );

  if (!existingRows.length) {
    throw new AppError('GSTIN not found for this customer', 404);
  }

  const existing = existingRows[0];

  const payload = {
    state: req.body.state ?? existing.state,
    stateCode: req.body.stateCode !== undefined ? req.body.stateCode : existing.state_code,
    gstinNumber: req.body.gstinNumber ?? existing.gstin_number,
    fileName: file?.originalname ?? (req.body.fileName !== undefined ? req.body.fileName : existing.file_name),
    fileType: file?.mimetype ?? (req.body.fileType !== undefined ? req.body.fileType : existing.file_type),
    fileBuffer: file?.buffer,
    activeFlag: req.body.activeFlag ?? existing.active,
  };

  const registeredAddress = file
    ? await verifyGstinFile(file, payload.gstinNumber, String(req.body.address ?? ''))
    : existing.registered_address;

  const errors = validateGstin(payload, false);
  if (errors.length > 0) {
    throw new AppError('Validation failed', 400, { errors });
  }

  const normalizedGstinNumber = payload.gstinNumber.trim().toUpperCase();

  // Check duplicate GSTIN (excluding self)
  const dupRows = await executeQuery<any>(
    `SELECT id FROM customer_gstins WHERE customer_code = ? AND gstin_number = ? AND id <> ?`,
    [normalizedCustomerCode, normalizedGstinNumber, id]
  );
  if (dupRows.length) {
    throw new AppError('GSTIN already exists for this customer', 409);
  }

  // Save file if provided
  let filePath: string | null = existing.file_path;
  if (payload.fileBuffer && payload.fileBuffer.length > 0) {
    const dir = await ensureUploadDir('gstin');
    const safeName = `${sanitizeSegment(normalizedCustomerCode)}_${sanitizeSegment(normalizedGstinNumber)}_${Date.now()}.pdf`;
    filePath = path.join('gstin', safeName);
    await fs.writeFile(path.join(env.UPLOAD_DIR, filePath), payload.fileBuffer);
  }

  await executeQuery(
    `UPDATE customer_gstins SET
      state = ?, state_code = ?, gstin_number = ?,
      file_name = ?, file_type, file_path, registered_address = ?,
      gstin_verification_status = ?, address_verification_status = ?,
      active = ?
    WHERE id = ? AND customer_code = ?`,
    [
      payload.state.trim().slice(0, 50),
      payload.stateCode?.slice(0, 2) ?? null,
      normalizedGstinNumber.slice(0, 15),
      payload.fileName?.slice(0, 255) ?? null,
      payload.fileType?.slice(0, 50) ?? null,
      filePath,
      registeredAddress,
      file ? 'VERIFIED' : existing.gstin_verification_status ?? 'PENDING',
      file ? 'VERIFIED' : existing.address_verification_status ?? 'PENDING',
      (payload.activeFlag ?? 'Y').toUpperCase(),
      id,
      normalizedCustomerCode,
    ]
  );

  // Prepare audit data after update
  const timestamp = new Date().toISOString();
  const submittedBy = undefined;

  // Fetch customer's global and handling codes for context
  const custRows = await executeQuery<any>(
    `SELECT global_customer_code, handling_agent_code FROM customers WHERE customer_code = ?`,
    [normalizedCustomerCode]
  );
  const globalCode = custRows[0]?.global_customer_code ?? null;
  const handlingCode = custRows[0]?.handling_agent_code ?? null;

  // Determine changes (compare existing vs payload)
  const changes: { fieldName: string; oldValue: any; newValue: any }[] = [];
  const fields = [
    { field: 'state', existing: existing.state, payload: payload.state },
    { field: 'state_code', existing: existing.state_code, payload: payload.stateCode },
    { field: 'gstin_number', existing: existing.gstin_number, payload: payload.gstinNumber },
    { field: 'file_name', existing: existing.file_name, payload: payload.fileName },
    { field: 'file_type', existing: existing.file_type, payload: payload.fileType },
    { field: 'registered_address', existing: existing.registered_address, payload: registeredAddress },
    { field: 'gstin_verification_status', existing: existing.gstin_verification_status, payload: file ? 'VERIFIED' : existing.gstin_verification_status },
    { field: 'address_verification_status', existing: existing.address_verification_status, payload: file ? 'VERIFIED' : existing.address_verification_status },
    { field: 'active', existing: existing.active, payload: payload.activeFlag },
  ];
  fields.forEach(f => {
    const existingVal = f.existing ?? null;
    const payloadVal = f.payload ?? null;
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
    const val = f.payload ?? null;
    const sqlVal = val === null ? 'NULL' : typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
    return `${f.field} = ${sqlVal}`;
  }).join(', ');
  const executedQuery = `UPDATE customer_gstins SET ${setClauses} WHERE id = ${id} AND customer_code = '${normalizedCustomerCode}';`;

  // Send audit email
  try {
    await sendAuditEmail({
      page: 'Old User',
      operation: 'UPDATE',
      table: 'customer_gstins',
      customerCode: normalizedCustomerCode,
      globalCode,
      handlingAgentCode: handlingCode,
      changes,
      executedQuery,
      timestamp,
      submittedBy,
    });
  } catch (emailError) {
    console.error('[EMAIL AUDIT] Failed to send audit email for updateGstin:', emailError);
    // Don't fail the request if email fails
  }

  res.status(200).json({
    success: true,
    message: 'GSTIN updated successfully',
    data: { gstinId: id },
  });
});

export const deleteGstin = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  const gstinId = paramStr(req.params.gstinId);
  const id = Number(gstinId);
  if (!Number.isFinite(id)) throw new AppError('Valid GSTIN ID is required', 400);

  const normalizedCustomerCode = customerCode.trim().toUpperCase();

  // Fetch the GSTIN record to be deleted for audit
  const [deletedRows] = await executeQuery<any>(
    `SELECT * FROM customer_gstins WHERE id = ? AND customer_code = ?`,
    [id, normalizedCustomerCode]
  );
  if (!deletedRows.length) {
    throw new AppError('GSTIN not found for this customer', 404);
  }
  const deleted = deletedRows[0];

  // Delete the GSTIN
  await (await import('../config/database.js')).getPool().execute(
    `DELETE FROM customer_gstins WHERE id = ? AND customer_code = ?`,
    [id, normalizedCustomerCode]
  );

  // Prepare audit data after deletion
  const timestamp = new Date().toISOString();
  const submittedBy = undefined;

  // Fetch customer's global and handling codes for context
  const custRows = await executeQuery<any>(
    `SELECT global_customer_code, handling_agent_code FROM customers WHERE customer_code = ?`,
    [normalizedCustomerCode]
  );
  const globalCode = custRows[0]?.global_customer_code ?? null;
  const handlingCode = custRows[0]?.handling_agent_code ?? null;

  // Audit changes for GSTIN delete (show old values, newValue = null)
  const changes: { fieldName: string; oldValue: any; newValue: any }[] = [
    { fieldName: 'state', oldValue: deleted.state, newValue: null },
    { fieldName: 'state_code', oldValue: deleted.state_code, newValue: null },
    { fieldName: 'gstin_number', oldValue: deleted.gstin_number, newValue: null },
    { fieldName: 'file_name', oldValue: deleted.file_name, newValue: null },
    { fieldName: 'file_type', oldValue: deleted.file_type, newValue: null },
    { fieldName: 'file_path', oldValue: deleted.file_path, newValue: null },
    { fieldName: 'registered_address', oldValue: deleted.registered_address, newValue: null },
    { fieldName: 'gstin_verification_status', oldValue: deleted.gstin_verification_status, newValue: null },
    { fieldName: 'address_verification_status', oldValue: deleted.address_verification_status, newValue: null },
    { fieldName: 'active', oldValue: deleted.active, newValue: null },
  ];

  // Build executed query string (DELETE)
  const executedQuery = `DELETE FROM customer_gstins WHERE id = ${id} AND customer_code = '${normalizedCustomerCode}';`;

  // Send audit email
  try {
    await sendAuditEmail({
      page: 'Old User',
      operation: 'DELETE',
      table: 'customer_gstins',
      customerCode: normalizedCustomerCode,
      globalCode,
      handlingAgentCode: handlingCode,
      changes,
      executedQuery,
      timestamp,
      submittedBy,
    });
  } catch (emailError) {
    console.error('[EMAIL AUDIT] Failed to send audit email for deleteGstin:', emailError);
    // Don't fail the request if email fails
  }

  res.status(200).json({
    success: true,
    message: 'GSTIN deleted successfully',
  });
});

export const getGstinFile = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  const gstinId = paramStr(req.params.gstinId);
  const id = Number(gstinId);
  if (!Number.isFinite(id)) throw new AppError('Valid GSTIN ID is required', 400);

  const rows = await executeQuery<any>(
    `SELECT file_name, file_type, file_path FROM customer_gstins WHERE id = ? AND customer_code = ?`,
    [id, customerCode.trim().toUpperCase()]
  );

  const row = rows[0];
  if (!row || !row.file_path) {
    throw new AppError('GSTIN file not found', 404);
  }

  const fileFull = path.join(env.UPLOAD_DIR, row.file_path);
  try {
    const buffer = await fs.readFile(fileFull);
    const fileName = row.file_name ?? `gstin-${id}.pdf`;
    const contentType = row.file_type ?? 'application/pdf';

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(200).send(buffer);
  } catch {
    throw new AppError('GSTIN file not found on disk', 404);
  }
});