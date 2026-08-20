import { Request, Response } from 'express';
import oracledb from 'oracledb';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { withTransaction, executeQuery, getConnection } from '../config/database.js';
import { validateCustomer, validateGstin, CustomerPayload } from '../utils/validators.js';
import { reserveUniqueCode } from '../utils/codeGenerator.js';

/** Safely extract a string route param (Express 5 types it as string | string[]). */
const paramStr = (val: string | string[] | undefined): string =>
  Array.isArray(val) ? val[0] ?? '' : val ?? '';

const mapRowToCustomer = (row: any): any => ({
  customerCode: row.MAVCUSTOMERCODE,
  customerName: row.MAVCUSTOMERNAME,
  address: row.MAVADDRESS,
  city: row.MAVCITY,
  pincode: row.MAVPINCODE,
  pcoCode: row.MAVPCOCODE,
  pan: row.MAVPAN,
  email: row.MAVEMAIL,
  mobile: row.MAVMOBILE,
  globalCustomerCode: row.MAVGLBLCUSTCODE,
  handlingAgentCode: row.MAVHNDGAGNTCODE,
  activeFlag: row.MACACTIVEFLAG,
  createdDate: row.MADCREATEDDATE ? new Date(row.MADCREATEDDATE).toISOString() : null,
  updatedDate: row.MADUPDATEDDATE ? new Date(row.MADUPDATEDDATE).toISOString() : null,
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  if (!customerCode.trim()) {
    throw new AppError('Customer Code is required', 400);
  }

  const sql = `SELECT * FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = :code`;
  const result = await executeQuery<any>(sql, [customerCode.trim().toUpperCase()]);

  if (!result.rows || result.rows.length === 0) {
    throw new AppError('Customer Code not found.', 404, { customerCode });
  }

  res.status(200).json({
    success: true,
    data: mapRowToCustomer(result.rows[0]),
  });
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  // Support both JSON body and multipart form data (when multer is active)
  let rawBody = req.body;
  if (typeof rawBody === 'string') {
    try { rawBody = JSON.parse(rawBody); } catch (_) { /* keep as-is */ }
  }

  // When sent as multipart, 'gstins' may be a JSON string
  if (typeof rawBody.gstins === 'string') {
    try { rawBody.gstins = JSON.parse(rawBody.gstins); } catch (_) { rawBody.gstins = []; }
  }

  const payload: CustomerPayload & { codeType?: 'global' | 'handling'; gstins?: any[] } = rawBody;

  const validationErrors = validateCustomer(payload, true);
  const gstinValidationErrors = [];
  const gstinSet = new Set<string>();
  for (const gstin of Array.isArray(payload.gstins) ? payload.gstins : []) {
    const normalizedGstin = String(gstin.gstinNumber ?? '').trim().toUpperCase();
    if (normalizedGstin) {
      if (gstinSet.has(normalizedGstin)) {
        gstinValidationErrors.push({ field: 'gstinNumber', message: `Duplicate GSTIN ${normalizedGstin} in request` });
      }
      gstinSet.add(normalizedGstin);
    }
    gstinValidationErrors.push(...validateGstin({
      state: gstin.state,
      stateCode: gstin.stateCode,
      gstinNumber: normalizedGstin,
      fileName: gstin.fileName,
      fileType: gstin.fileType,
      activeFlag: 'Y',
    }, true));
  }
  validationErrors.push(...gstinValidationErrors);
  if (validationErrors.length > 0) {
    throw new AppError('Validation failed', 400, { errors: validationErrors });
  }

  const codeType = payload.codeType;
  if (codeType && !['global', 'handling'].includes(codeType)) {
    throw new AppError('codeType must be "global" or "handling"', 400);
  }

  const result = await withTransaction(async (conn) => {
    let globalCode: string | undefined = payload.globalCustomerCode?.trim().toUpperCase();
    let handlingCode: string | undefined = payload.handlingAgentCode?.trim().toUpperCase();

    if (codeType === 'global' && !globalCode) {
      const reserved = await reserveUniqueCode(payload.customerName, 'global');
      globalCode = reserved.code;
    } else if (codeType === 'handling' && !handlingCode) {
      const reserved = await reserveUniqueCode(payload.customerName, 'handling');
      handlingCode = reserved.code;
    }

    if (!globalCode && !handlingCode) {
      throw new AppError('Either Global Code or Handling Agent Code must be provided or generated', 400);
    }

    const customerCode =
      payload.customerCode?.trim().toUpperCase() ||
      `CUST${Date.now().toString().slice(-6)}`;

    const insertSql = `
      INSERT INTO MEMCUSTOMER (
        MAVCUSTOMERCODE, MAVCUSTOMERNAME, MAVADDRESS, MAVCITY, MAVPINCODE, MAVPCOCODE,
        MAVPAN, MAVEMAIL, MAVMOBILE,
        MAVGLBLCUSTCODE, MAVHNDGAGNTCODE,
        MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE
      ) VALUES (
        :customerCode, :customerName, :address, :city, :pincode, :pcoCode,
        :pan, :email, :mobile,
        :globalCode, :handlingCode,
        :activeFlag, SYSDATE, SYSDATE
      )
    `;

    await conn.execute(insertSql, {
      customerCode,
      customerName: payload.customerName.trim().slice(0, 100),
      address: payload.address?.trim().slice(0, 255) ?? null,
      city: payload.city?.trim().slice(0, 50) ?? null,
      pincode: payload.pincode?.trim().slice(0, 10) ?? null,
      pcoCode: payload.pcoCode?.trim().slice(0, 3) ?? null,
      pan: payload.pan?.trim().toUpperCase().slice(0, 10) ?? null,
      email: payload.email?.trim().toLowerCase().slice(0, 100) ?? null,
      mobile: payload.mobile?.trim().slice(0, 15) ?? null,
      globalCode: globalCode ?? null,
      handlingCode: handlingCode ?? null,
      activeFlag: (payload.activeFlag ?? 'Y').toUpperCase(),
    });

    const gstins = Array.isArray(payload.gstins) ? payload.gstins : [];

    for (const gstin of gstins) {
      if (!gstin.gstinNumber?.trim() || !gstin.state?.trim()) continue;
      const gstinIdSql = `SELECT SEQ_MEMCUSTOMERGSTIN_GSTINID.NEXTVAL FROM DUAL`;
      const idRes = await conn.execute<any>(gstinIdSql);
      const gstinId = (idRes.rows?.[0] as any)?.NEXTVAL ?? (idRes.rows as any)?.[0]?.[0];

      const gSql = `
        INSERT INTO MEMCUSTOMERGSTIN (
          GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
          MAVGSTINFILENAME, MAVGSTINFILETYPE, MAVGSTINFILEPATH,
          MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE
        ) VALUES (
          :gstinId, :customerCode, :state, :stateCode, :gstinNumber,
          :fileName, :fileType, :filePath,
          'Y', SYSDATE, SYSDATE
        )
      `;
      await conn.execute(gSql, {
        gstinId,
        customerCode,
        state: gstin.state.trim().slice(0, 50),
        stateCode: gstin.stateCode?.trim().slice(0, 2) ?? null,
        gstinNumber: gstin.gstinNumber.trim().toUpperCase().slice(0, 15),
        fileName: gstin.fileName?.trim().slice(0, 255) ?? null,
        fileType: gstin.fileType?.trim().slice(0, 50) ?? null,
        filePath: gstin.filePath?.trim().slice(0, 500) ?? null,
      });
    }

    return {
      customerCode,
      globalCode,
      handlingCode,
      gstinCount: gstins.length,
    };
  });

  res.status(201).json({
    success: true,
    message: 'Customer registration saved successfully',
    data: result,
  });
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  const payload: CustomerPayload = req.body;

  if (!customerCode.trim()) {
    throw new AppError('Customer Code is required', 400);
  }

  const conn = await getConnection();
  try {
    const existingSql = `SELECT * FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = :code FOR UPDATE`;
    const existingRes = await conn.execute<any>(existingSql, [customerCode.trim().toUpperCase()]);
    const existing = existingRes.rows?.[0];
    if (!existing) {
      throw new AppError('Customer Code not found.', 404, { customerCode });
    }

    const merged: CustomerPayload = {
      customerCode: existing.MAVCUSTOMERCODE,
      customerName: payload.customerName?.trim() ?? existing.MAVCUSTOMERNAME,
      address: payload.address !== undefined ? (payload.address?.trim() ?? null) : existing.MAVADDRESS,
      city: payload.city !== undefined ? (payload.city?.trim() ?? null) : existing.MAVCITY,
      pincode: payload.pincode !== undefined ? (payload.pincode?.trim() ?? null) : existing.MAVPINCODE,
      pcoCode: payload.pcoCode !== undefined ? (payload.pcoCode?.trim() ?? null) : existing.MAVPCOCODE,
      pan: payload.pan !== undefined ? (payload.pan?.trim().toUpperCase() ?? null) : existing.MAVPAN,
      email: payload.email !== undefined ? (payload.email?.trim().toLowerCase() ?? null) : existing.MAVEMAIL,
      mobile: payload.mobile !== undefined ? (payload.mobile?.trim() ?? null) : existing.MAVMOBILE,
      globalCustomerCode:
        payload.globalCustomerCode !== undefined
          ? (payload.globalCustomerCode?.trim().toUpperCase() ?? null)
          : existing.MAVGLBLCUSTCODE,
      handlingAgentCode:
        payload.handlingAgentCode !== undefined
          ? (payload.handlingAgentCode?.trim().toUpperCase() ?? null)
          : existing.MAVHNDGAGNTCODE,
      activeFlag:
        payload.activeFlag !== undefined
          ? payload.activeFlag.toUpperCase()
          : existing.MACACTIVEFLAG,
    };

    const errors = validateCustomer(merged, false);
    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, { errors });
    }

    const updateSql = `
      UPDATE MEMCUSTOMER SET
        MAVCUSTOMERNAME = :customerName,
        MAVADDRESS = :address,
        MAVCITY = :city,
        MAVPINCODE = :pincode,
        MAVPCOCODE = :pcoCode,
        MAVPAN = :pan,
        MAVEMAIL = :email,
        MAVMOBILE = :mobile,
        MAVGLBLCUSTCODE = :globalCode,
        MAVHNDGAGNTCODE = :handlingCode,
        MACACTIVEFLAG = :activeFlag,
        MADUPDATEDDATE = SYSDATE
      WHERE MAVCUSTOMERCODE = :customerCode
    `;

    await conn.execute(updateSql, {
      customerName: merged.customerName.trim().slice(0, 100),
      address: merged.address?.slice(0, 255) ?? null,
      city: merged.city?.slice(0, 50) ?? null,
      pincode: merged.pincode?.slice(0, 10) ?? null,
      pcoCode: merged.pcoCode?.slice(0, 3) ?? null,
      pan: merged.pan?.slice(0, 10) ?? null,
      email: merged.email?.slice(0, 100) ?? null,
      mobile: merged.mobile?.slice(0, 15) ?? null,
      globalCode: merged.globalCustomerCode ?? null,
      handlingCode: merged.handlingAgentCode ?? null,
      activeFlag: (merged.activeFlag ?? 'Y').toUpperCase(),
      customerCode: customerCode.trim().toUpperCase(),
    }, { autoCommit: true });

    const afterSql = `SELECT * FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = :code`;
    const after = await conn.execute<any>(afterSql, [customerCode.trim().toUpperCase()]);

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: mapRowToCustomer(after.rows![0]),
    });
  } finally {
    await conn.close();
  }
});
