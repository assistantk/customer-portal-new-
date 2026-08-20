import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { withTransaction, executeQuery, getConnection } from '../config/database.js';
import { validateGstin } from '../utils/validators.js';
import { downloadGstinPdf, uploadGstinPdf } from '../utils/supabaseStorage.js';

/** Safely extract a string route param (Express 5 types it as string | string[]). */
const paramStr = (val: string | string[] | undefined): string =>
  Array.isArray(val) ? val[0] ?? '' : val ?? '';

const mapRowToGstin = (row: any): any => ({
  gstinId: row.GSTINID,
  customerCode: row.MAVCUSTOMERCODE,
  state: row.MAVSTATE,
  stateCode: row.MAVSTATECODE,
  gstinNumber: row.MAVGSTINNUMBER,
  fileName: row.MAVGSTINFILENAME,
  fileType: row.MAVGSTINFILETYPE,
  filePath: row.MAVGSTINFILEPATH,
  hasFile: !!row.MAVGSTINFILEPATH || !!row.MAVGSTINFILE,
  activeFlag: row.MACACTIVEFLAG,
  createdDate: row.MADCREATEDDATE ? new Date(row.MADCREATEDDATE).toISOString() : null,
  updatedDate: row.MADUPDATEDDATE ? new Date(row.MADUPDATEDDATE).toISOString() : null,
});

export const getCustomerGstins = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  if (!customerCode.trim()) {
    throw new AppError('Customer Code is required', 400);
  }

  const sql = `
    SELECT GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
           MAVGSTINFILENAME, MAVGSTINFILETYPE, MAVGSTINFILEPATH,
           CASE WHEN MAVGSTINFILEPATH IS NOT NULL OR MAVGSTINFILE IS NOT NULL THEN 1 ELSE 0 END AS HASFILE,
           MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE
    FROM MEMCUSTOMERGSTIN
    WHERE MAVCUSTOMERCODE = :code
    ORDER BY MAVSTATECODE, MAVSTATE
  `;

  const result = await executeQuery<any>(sql, [customerCode.trim().toUpperCase()]);

  const list = (result.rows ?? []).map((r: any) => ({
    gstinId: r.GSTINID,
    customerCode: r.MAVCUSTOMERCODE,
    state: r.MAVSTATE,
    stateCode: r.MAVSTATECODE,
    gstinNumber: r.MAVGSTINNUMBER,
    fileName: r.MAVGSTINFILENAME,
    fileType: r.MAVGSTINFILETYPE,
    filePath: r.MAVGSTINFILEPATH,
    hasFile: r.HASFILE === 1,
    activeFlag: r.MACACTIVEFLAG,
    createdDate: r.MADCREATEDDATE ? new Date(r.MADCREATEDDATE).toISOString() : null,
    updatedDate: r.MADUPDATEDDATE ? new Date(r.MADUPDATEDDATE).toISOString() : null,
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
    const custSql = `SELECT MAVCUSTOMERCODE FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = :code`;
    const custRes = await conn.execute<any>(custSql, [normalizedCustomerCode]);
    if (!custRes.rows?.length) {
      throw new AppError('Customer Code not found.', 404, { customerCode });
    }

    const duplicateRes = await conn.execute<any>(
      `SELECT GSTINID FROM MEMCUSTOMERGSTIN WHERE MAVCUSTOMERCODE = :code AND MAVGSTINNUMBER = :gstinNumber`,
      { code: normalizedCustomerCode, gstinNumber: normalizedGstinNumber }
    );
    if (duplicateRes.rows?.length) {
      throw new AppError('GSTIN already exists for this customer', 409);
    }

    const idRes = await conn.execute<any>(`SELECT SEQ_MEMCUSTOMERGSTIN_GSTINID.NEXTVAL FROM DUAL`);
    const gstinId = (idRes.rows?.[0] as any)?.NEXTVAL ?? (idRes.rows as any)?.[0]?.[0];
    const storedDocument = payload.fileBuffer
      ? await uploadGstinPdf({
          customerCode: normalizedCustomerCode,
          gstinNumber: normalizedGstinNumber,
          fileName: payload.fileName ?? `${normalizedGstinNumber}.pdf`,
          fileBuffer: payload.fileBuffer,
        })
      : null;

    if (storedDocument) {
      const insertSql = `
        INSERT INTO MEMCUSTOMERGSTIN (
          GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
          MAVGSTINFILE, MAVGSTINFILENAME, MAVGSTINFILETYPE, MAVGSTINFILEPATH,
          MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE
        ) VALUES (
          :gstinId, :customerCode, :state, :stateCode, :gstinNumber,
          NULL, :fileName, :fileType, :filePath,
          :activeFlag, SYSDATE, SYSDATE
        )
      `;

      await conn.execute(insertSql, {
        gstinId,
        customerCode: normalizedCustomerCode,
        state: payload.state.trim().slice(0, 50),
        stateCode: payload.stateCode?.trim().slice(0, 2) ?? null,
        gstinNumber: normalizedGstinNumber.slice(0, 15),
        fileName: payload.fileName?.slice(0, 255) ?? null,
        fileType: storedDocument.contentType,
        filePath: storedDocument.path.slice(0, 500),
        activeFlag: (payload.activeFlag ?? 'Y').toUpperCase(),
      });

      return { gstinId };
    }

    const insertSql = `
      INSERT INTO MEMCUSTOMERGSTIN (
        GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
        MAVGSTINFILE, MAVGSTINFILENAME, MAVGSTINFILETYPE, MAVGSTINFILEPATH,
        MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE
      ) VALUES (
        :gstinId, :customerCode, :state, :stateCode, :gstinNumber,
        EMPTY_BLOB(), :fileName, :fileType, NULL,
        :activeFlag, SYSDATE, SYSDATE
      )
      RETURNING MAVGSTINFILE INTO :lobOut
    `;

    const lobBind: any = { type: 2007, dir: 3003 };
    const binds: any = {
      gstinId,
      customerCode: normalizedCustomerCode,
      state: payload.state.trim().slice(0, 50),
      stateCode: payload.stateCode?.trim().slice(0, 2) ?? null,
      gstinNumber: normalizedGstinNumber.slice(0, 15),
      fileName: payload.fileName?.slice(0, 255) ?? null,
      fileType: payload.fileType?.slice(0, 50) ?? null,
      activeFlag: (payload.activeFlag ?? 'Y').toUpperCase(),
      lobOut: lobBind,
    };

    const insertResult = await conn.execute<any>(insertSql, binds);

    if (payload.fileBuffer && payload.fileBuffer.length > 0) {
      const lob = (insertResult.outBinds as any)?.lobOut?.[0] ?? (insertResult.outBinds as any)?.lobOut;
      if (lob && typeof lob.write === 'function') {
        await lob.write(1, payload.fileBuffer);
        await lob.close();
      }
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

  const conn = await getConnection();
  try {
    const existingSql = `
      SELECT * FROM MEMCUSTOMERGSTIN
      WHERE GSTINID = :id AND MAVCUSTOMERCODE = :code
      FOR UPDATE
    `;
    const existingRes = await conn.execute<any>(existingSql, { id, code: customerCode.trim().toUpperCase() });
    const existing = existingRes.rows?.[0];
    if (!existing) {
      throw new AppError('GSTIN not found for this customer', 404);
    }

    const normalizedCustomerCode = customerCode.trim().toUpperCase();
    const payload = {
      state: req.body.state ?? existing.MAVSTATE,
      stateCode: req.body.stateCode !== undefined ? req.body.stateCode : existing.MAVSTATECODE,
      gstinNumber: req.body.gstinNumber ?? existing.MAVGSTINNUMBER,
      fileName: file?.originalname ?? (req.body.fileName !== undefined ? req.body.fileName : existing.MAVGSTINFILENAME),
      fileType: file?.mimetype ?? (req.body.fileType !== undefined ? req.body.fileType : existing.MAVGSTINFILETYPE),
      fileBuffer: file?.buffer,
      activeFlag: req.body.activeFlag ?? existing.MACACTIVEFLAG,
    };

    const errors = validateGstin(payload, false);
    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, { errors });
    }

    const normalizedGstinNumber = payload.gstinNumber.trim().toUpperCase();
    const duplicateRes = await conn.execute<any>(
      `SELECT GSTINID FROM MEMCUSTOMERGSTIN
       WHERE MAVCUSTOMERCODE = :code AND MAVGSTINNUMBER = :gstinNumber AND GSTINID <> :id`,
      { code: normalizedCustomerCode, gstinNumber: normalizedGstinNumber, id }
    );
    if (duplicateRes.rows?.length) {
      throw new AppError('GSTIN already exists for this customer', 409);
    }

    if (payload.fileBuffer && payload.fileBuffer.length > 0) {
      const storedDocument = await uploadGstinPdf({
        customerCode: normalizedCustomerCode,
        gstinNumber: normalizedGstinNumber,
        fileName: payload.fileName ?? `${normalizedGstinNumber}.pdf`,
        fileBuffer: payload.fileBuffer,
      });

      if (storedDocument) {
        const updateWithPathSql = `
          UPDATE MEMCUSTOMERGSTIN SET
            MAVSTATE = :state,
            MAVSTATECODE = :stateCode,
            MAVGSTINNUMBER = :gstinNumber,
            MAVGSTINFILE = NULL,
            MAVGSTINFILENAME = :fileName,
            MAVGSTINFILETYPE = :fileType,
            MAVGSTINFILEPATH = :filePath,
            MACACTIVEFLAG = :activeFlag,
            MADUPDATEDDATE = SYSDATE
          WHERE GSTINID = :id AND MAVCUSTOMERCODE = :customerCode
        `;
        await conn.execute(updateWithPathSql, {
          state: payload.state.trim().slice(0, 50),
          stateCode: payload.stateCode?.slice(0, 2) ?? null,
          gstinNumber: normalizedGstinNumber.slice(0, 15),
          fileName: payload.fileName?.slice(0, 255) ?? null,
          fileType: storedDocument.contentType,
          filePath: storedDocument.path.slice(0, 500),
          activeFlag: (payload.activeFlag ?? 'Y').toUpperCase(),
          id,
          customerCode: normalizedCustomerCode,
        });
      } else {
      const updateWithLobSql = `
        UPDATE MEMCUSTOMERGSTIN SET
          MAVSTATE = :state,
          MAVSTATECODE = :stateCode,
          MAVGSTINNUMBER = :gstinNumber,
          MAVGSTINFILE = EMPTY_BLOB(),
          MAVGSTINFILENAME = :fileName,
          MAVGSTINFILETYPE = :fileType,
          MAVGSTINFILEPATH = NULL,
          MACACTIVEFLAG = :activeFlag,
          MADUPDATEDDATE = SYSDATE
        WHERE GSTINID = :id AND MAVCUSTOMERCODE = :customerCode
        RETURNING MAVGSTINFILE INTO :lobOut
      `;
      const lobBind: any = { type: 2007, dir: 3003 };
      const binds = {
        state: payload.state.trim().slice(0, 50),
        stateCode: payload.stateCode?.slice(0, 2) ?? null,
        gstinNumber: normalizedGstinNumber.slice(0, 15),
        fileName: payload.fileName?.slice(0, 255) ?? null,
        fileType: payload.fileType?.slice(0, 50) ?? null,
        activeFlag: (payload.activeFlag ?? 'Y').toUpperCase(),
        id,
        customerCode: normalizedCustomerCode,
        lobOut: lobBind,
      };
      const r = await conn.execute(updateWithLobSql, binds);
      const lob = (r.outBinds as any)?.lobOut?.[0] ?? (r.outBinds as any)?.lobOut;
      if (lob && typeof lob.write === 'function') {
        await lob.write(1, payload.fileBuffer);
        await lob.close();
      }
      }
    } else {
      const updateSql = `
        UPDATE MEMCUSTOMERGSTIN SET
          MAVSTATE = :state,
          MAVSTATECODE = :stateCode,
          MAVGSTINNUMBER = :gstinNumber,
          MAVGSTINFILENAME = :fileName,
          MAVGSTINFILETYPE = :fileType,
          MACACTIVEFLAG = :activeFlag,
          MADUPDATEDDATE = SYSDATE
        WHERE GSTINID = :id AND MAVCUSTOMERCODE = :customerCode
      `;
      await conn.execute(updateSql, {
        state: payload.state.trim().slice(0, 50),
        stateCode: payload.stateCode?.slice(0, 2) ?? null,
        gstinNumber: normalizedGstinNumber.slice(0, 15),
        fileName: payload.fileName?.slice(0, 255) ?? null,
        fileType: payload.fileType?.slice(0, 50) ?? null,
        activeFlag: (payload.activeFlag ?? 'Y').toUpperCase(),
        id,
        customerCode: normalizedCustomerCode,
      });
    }

    await conn.commit();

    res.status(200).json({
      success: true,
      message: 'GSTIN updated successfully',
      data: { gstinId: id },
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
});

export const deleteGstin = asyncHandler(async (req: Request, res: Response) => {
  const customerCode = paramStr(req.params.customerCode);
  const gstinId = paramStr(req.params.gstinId);
  const id = Number(gstinId);
  if (!Number.isFinite(id)) throw new AppError('Valid GSTIN ID is required', 400);

  const sql = `
    DELETE FROM MEMCUSTOMERGSTIN
    WHERE GSTINID = :id AND MAVCUSTOMERCODE = :code
  `;
  const result = await executeQuery(sql, {
    id,
    code: customerCode.trim().toUpperCase(),
  }, { autoCommit: true });

  if (((result as any).rowsAffected ?? 0) === 0) {
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

  const conn = await getConnection();
  try {
    const sql = `
      SELECT MAVGSTINFILE, MAVGSTINFILENAME, MAVGSTINFILETYPE, MAVGSTINFILEPATH
      FROM MEMCUSTOMERGSTIN
      WHERE GSTINID = :id AND MAVCUSTOMERCODE = :code
    `;
    const r = await conn.execute<any>(sql, { id, code: customerCode.trim().toUpperCase() });
    const row = r.rows?.[0];
    if (!row || (!row.MAVGSTINFILEPATH && !row.MAVGSTINFILE)) {
      throw new AppError('GSTIN file not found', 404);
    }

    const chunks: Buffer[] = [];
    if (row.MAVGSTINFILEPATH) {
      const storedFile = await downloadGstinPdf(row.MAVGSTINFILEPATH);
      if (storedFile) chunks.push(storedFile);
    } else {
      const lob = row.MAVGSTINFILE;
      if (lob && typeof lob.read === 'function') {
      let offset = 1;
      const chunkSize = 32768;
      let chunk: Buffer;
      do {
        chunk = await lob.read(offset, chunkSize);
        if (chunk && chunk.length > 0) chunks.push(chunk);
        offset += chunk?.length ?? 0;
      } while (chunk && chunk.length === chunkSize);
      await lob.close();
      }
    }

    const buffer = Buffer.concat(chunks);
    const fileName = row.MAVGSTINFILENAME ?? `gstin-${id}`;
    const contentType = row.MAVGSTINFILETYPE ?? 'application/octet-stream';

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length.toString());
    res.status(200).send(buffer);
  } finally {
    await conn.close();
  }
});
