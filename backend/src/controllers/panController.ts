import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { executeQuery } from '../config/database.js';
import { env } from '../config/env.js';

const paramStr = (val: string | string[] | undefined): string =>
  Array.isArray(val) ? val[0] ?? '' : val ?? '';

const sanitizeSegment = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'document';

export const uploadPanFile = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode).trim().toUpperCase();
  const file = req.file;

  if (!customerCode) throw new AppError('Customer Code is required', 400);
  if (!file) throw new AppError('PAN PDF file is required', 400);

  // Verify customer exists
  const rows = await executeQuery<any>(
    'SELECT customer_code FROM customers WHERE customer_code = ?',
    [customerCode]
  );
  if (!rows.length) throw new AppError('Customer Code not found.', 404);

  // Save file to disk
  const dir = path.join(env.UPLOAD_DIR, 'pan');
  await fs.mkdir(dir, { recursive: true });
  const safeName = `${sanitizeSegment(customerCode)}_PAN_${Date.now()}.pdf`;
  const filePath = path.join('pan', safeName);
  await fs.writeFile(path.join(env.UPLOAD_DIR, filePath), file.buffer);

  // Update customer record
  await executeQuery(
    `UPDATE customers SET pan_file_name = ?, pan_file_type = ?, pan_file_path = ? WHERE customer_code = ?`,
    [file.originalname, file.mimetype, filePath, customerCode]
  );

  res.status(200).json({
    success: true,
    message: 'PAN file uploaded successfully',
    data: { fileName: file.originalname, filePath },
  });
});
