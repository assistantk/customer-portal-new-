import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { withTransaction, executeQuery } from '../config/database.js';
import { validateGstin } from '../utils/validators.js';
import { env } from '../config/env.js';

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

export const getCustomerGstins = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  if (!customerCode.trim()) {
    throw new AppError('Customer Code is required', 400);
  }

  const rows = await executeQuery<any>(
    `SELECT id, customer_code, state, state_code, gstin_number,
            file_name, file_type, file_path, active, created_at, updated_at
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
        file_name, file_type, file_path, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedCustomerCode,
        payload.state.trim().slice(0, 50),
        payload.stateCode?.trim().slice(0, 2) ?? null,
        normalizedGstinNumber.slice(0, 15),
        payload.fileName?.slice(0, 255) ?? null,
        payload.fileType?.slice(0, 50) ?? null,
        filePath,
        (payload.activeFlag ?? 'Y').toUpperCase(),
      ]
    );

    return { gstinId: (insertResult as any).insertId };
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
      file_name = ?, file_type = ?, file_path = ?,
      active = ?
    WHERE id = ? AND customer_code = ?`,
    [
      payload.state.trim().slice(0, 50),
      payload.stateCode?.slice(0, 2) ?? null,
      normalizedGstinNumber.slice(0, 15),
      payload.fileName?.slice(0, 255) ?? null,
      payload.fileType?.slice(0, 50) ?? null,
      filePath,
      (payload.activeFlag ?? 'Y').toUpperCase(),
      id,
      normalizedCustomerCode,
    ]
  );

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

  const [result] = await (await import('../config/database.js')).getPool().execute(
    `DELETE FROM customer_gstins WHERE id = ? AND customer_code = ?`,
    [id, customerCode.trim().toUpperCase()]
  );

  if (((result as any).affectedRows ?? 0) === 0) {
    throw new AppError('GSTIN not found for this customer', 404);
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
