import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { withTransaction, executeQuery } from '../config/database.js';
import { validateCustomer, validateGstin } from '../utils/validators.js';
import { reserveUniqueCode } from '../utils/codeGenerator.js';
import path from 'path';
import fs from 'fs/promises';
import { env } from '../config/env.js';
import { addressesMatch, scanDocument } from '../utils/documentScanner.js';
import { isValidPAN, isValidGSTIN } from '../utils/validators.js';
/** Safely extract a string route param (Express 5 types it as string | string[]). */
const paramStr = (val) => Array.isArray(val) ? val[0] ?? '' : val ?? '';
const mapRowToCustomer = (row) => ({
    customerCode: row.customer_code,
    customerName: row.company_name,
    address: row.address,
    city: row.city,
    pincode: row.pincode,
    pcoCode: row.pco_code,
    pan: row.pan_number,
    panFileName: row.pan_file_name,
    panVerificationStatus: row.pan_verification_status,
    email: row.email,
    mobile: row.mobile,
    globalCustomerCode: row.global_customer_code,
    handlingAgentCode: row.handling_agent_code,
    activeFlag: row.active,
    createdDate: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedDate: row.updated_at ? new Date(row.updated_at).toISOString() : null,
});
export const getCustomer = asyncHandler(async (req, res) => {
    const customerCode = paramStr(req.params.customerCode);
    if (!customerCode.trim()) {
        throw new AppError('Customer Code is required', 400);
    }
    const rows = await executeQuery(`SELECT * FROM customers WHERE customer_code = ?`, [customerCode.trim().toUpperCase()]);
    if (!rows || rows.length === 0) {
        throw new AppError('Customer Code not found.', 404, { customerCode });
    }
    res.status(200).json({
        success: true,
        data: mapRowToCustomer(rows[0]),
    });
});
export const createCustomer = asyncHandler(async (req, res) => {
    let rawBody = req.body;
    if (typeof rawBody === 'string') {
        try {
            rawBody = JSON.parse(rawBody);
        }
        catch (_) { /* keep as-is */ }
    }
    if (typeof rawBody.gstins === 'string') {
        try {
            rawBody.gstins = JSON.parse(rawBody.gstins);
        }
        catch (_) {
            rawBody.gstins = [];
        }
    }
    const payload = rawBody;
    const uploaded = (req.files || {});
    const panFile = uploaded.panFile?.[0];
    const gstinFiles = uploaded.gstinFiles || [];
    if (panFile) {
        const panScan = await scanDocument('pan', panFile.buffer);
        if (!panScan.pan || !isValidPAN(panScan.pan) || panScan.pan !== String(payload.pan ?? '').trim().toUpperCase())
            throw new AppError('PAN number does not match the uploaded PAN Card.', 422);
        payload.panScan = panScan.pan;
    }
    if (Array.isArray(payload.gstins)) {
        for (let i = 0; i < payload.gstins.length; i++) {
            const file = gstinFiles[i];
            if (!file)
                continue;
            const scan = await scanDocument('gstin', file.buffer);
            const entry = payload.gstins[i];
            if (!scan.gstin || !scan.address || !isValidGSTIN(scan.gstin) || scan.gstin !== String(entry.gstinNumber ?? '').trim().toUpperCase())
                throw new AppError('GSTIN number does not match the uploaded GST certificate.', 422);
            if (!addressesMatch(String(payload.address ?? ''), scan.address))
                throw new AppError('Business address does not match the GST certificate.', 422);
            entry.scannedAddress = scan.address;
        }
    }
    const validationErrors = validateCustomer(payload, true);
    const gstinValidationErrors = [];
    const gstinSet = new Set();
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
    // When codeType is set, the server will generate/handle the code — skip code-required validation
    const codeType = rawBody.codeType;
    const filteredErrors = (codeType && ['global', 'handling'].includes(codeType))
        ? validationErrors.filter(e => e.field !== 'globalCustomerCode' && e.field !== 'handlingAgentCode')
        : validationErrors;
    filteredErrors.push(...gstinValidationErrors);
    if (filteredErrors.length > 0) {
        throw new AppError('Validation failed', 400, { errors: filteredErrors });
    }
    if (codeType && !['global', 'handling'].includes(codeType)) {
        throw new AppError('codeType must be "global" or "handling"', 400);
    }
    const result = await withTransaction(async (conn) => {
        let globalCode = payload.globalCustomerCode?.trim().toUpperCase();
        let handlingCode = payload.handlingAgentCode?.trim().toUpperCase();
        if (codeType === 'global') {
            if (globalCode) {
                // Code provided — ensure it exists in parent table
                const { insertCodeRow } = await import('../utils/codeGenerator.js');
                try {
                    await insertCodeRow('global', globalCode, payload.customerName.trim().slice(0, 45));
                }
                catch (e) {
                    // Ignore duplicate — code already reserved during generate step
                    if (e?.code !== 'ER_DUP_ENTRY' && e?.errno !== 1062)
                        throw e;
                }
            }
            else {
                const reserved = await reserveUniqueCode(payload.customerName, 'global');
                globalCode = reserved.code;
            }
            handlingCode = undefined; // ensure only one is set
        }
        else if (codeType === 'handling') {
            if (handlingCode) {
                const { insertCodeRow } = await import('../utils/codeGenerator.js');
                try {
                    await insertCodeRow('handling', handlingCode, payload.customerName.trim().slice(0, 45));
                }
                catch (e) {
                    if (e?.code !== 'ER_DUP_ENTRY' && e?.errno !== 1062)
                        throw e;
                }
            }
            else {
                const reserved = await reserveUniqueCode(payload.customerName, 'handling');
                handlingCode = reserved.code;
            }
            globalCode = undefined; // ensure only one is set
        }
        if (!globalCode && !handlingCode) {
            throw new AppError('Either Global Code or Handling Agent Code must be provided or generated', 400);
        }
        const customerCode = payload.customerCode?.trim().toUpperCase() ||
            `CUST${Date.now().toString().slice(-6)}`;
        await conn.execute(`INSERT INTO customers (
        customer_code, company_name, address, city, pincode, pco_code,
        pan_number, email, mobile,
        global_customer_code, handling_agent_code,
        active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            customerCode,
            payload.customerName.trim().slice(0, 100),
            payload.address?.trim().slice(0, 255) ?? null,
            payload.city?.trim().slice(0, 50) ?? null,
            payload.pincode?.trim().slice(0, 10) ?? null,
            payload.pcoCode?.trim().slice(0, 3) ?? null,
            payload.pan?.trim().toUpperCase().slice(0, 10) ?? null,
            payload.email?.trim().toLowerCase().slice(0, 100) ?? null,
            payload.mobile?.trim().slice(0, 15) ?? null,
            globalCode ?? null,
            handlingCode ?? null,
            (payload.activeFlag ?? 'Y').toUpperCase(),
        ]);
        if (panFile) {
            const filePath = path.join('pan', `${customerCode}_PAN_${Date.now()}.pdf`);
            await fs.mkdir(path.join(env.UPLOAD_DIR, 'pan'), { recursive: true });
            await fs.writeFile(path.join(env.UPLOAD_DIR, filePath), panFile.buffer);
            await conn.execute(`UPDATE customers SET pan_file_name = ?, pan_file_type = ?, pan_file_path = ?, pan_verification_status = 'VERIFIED' WHERE customer_code = ?`, [panFile.originalname, panFile.mimetype, filePath, customerCode]);
        }
        const gstins = Array.isArray(payload.gstins) ? payload.gstins : [];
        for (let index = 0; index < gstins.length; index++) {
            const gstin = gstins[index];
            if (!gstin.gstinNumber?.trim() || !gstin.state?.trim())
                continue;
            const file = gstinFiles[index];
            let filePath = null;
            if (file) {
                filePath = path.join('gstin', `${customerCode}_${Date.now()}_${index}.pdf`);
                await fs.mkdir(path.join(env.UPLOAD_DIR, 'gstin'), { recursive: true });
                await fs.writeFile(path.join(env.UPLOAD_DIR, filePath), file.buffer);
            }
            await conn.execute(`INSERT INTO customer_gstins (
          customer_code, state, state_code, gstin_number,
          file_name, file_type, file_path, registered_address,
          gstin_verification_status, address_verification_status, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Y')`, [
                customerCode,
                gstin.state.trim().slice(0, 50),
                gstin.stateCode?.trim().slice(0, 2) ?? null,
                gstin.gstinNumber.trim().toUpperCase().slice(0, 15),
                gstin.fileName?.trim().slice(0, 255) ?? null,
                gstin.fileType?.trim().slice(0, 50) ?? null,
                filePath,
                gstin.scannedAddress ?? null,
                gstin.scannedAddress ? 'VERIFIED' : 'PENDING',
                gstin.scannedAddress ? 'VERIFIED' : 'PENDING',
            ]);
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
export const updateCustomer = asyncHandler(async (req, res) => {
    const customerCode = paramStr(req.params.customerCode);
    const payload = req.body;
    if (!customerCode.trim()) {
        throw new AppError('Customer Code is required', 400);
    }
    const normalizedCode = customerCode.trim().toUpperCase();
    const existingRows = await executeQuery(`SELECT * FROM customers WHERE customer_code = ?`, [normalizedCode]);
    if (!existingRows || existingRows.length === 0) {
        throw new AppError('Customer Code not found.', 404, { customerCode });
    }
    const existing = existingRows[0];
    // Merge: only overwrite when a new value is explicitly supplied (not undefined)
    const merged = {
        customerCode: existing.customer_code,
        customerName: payload.customerName?.trim() ?? existing.company_name,
        address: payload.address !== undefined ? (payload.address?.trim() ?? null) : existing.address,
        city: payload.city !== undefined ? (payload.city?.trim() ?? null) : existing.city,
        pincode: payload.pincode !== undefined ? (payload.pincode?.trim() ?? null) : existing.pincode,
        pcoCode: payload.pcoCode !== undefined ? (payload.pcoCode?.trim() ?? null) : existing.pco_code,
        pan: payload.pan !== undefined ? (payload.pan?.trim().toUpperCase() ?? null) : existing.pan_number,
        email: payload.email !== undefined ? (payload.email?.trim().toLowerCase() ?? null) : existing.email,
        mobile: payload.mobile !== undefined ? (payload.mobile?.trim() ?? null) : existing.mobile,
        globalCustomerCode: payload.globalCustomerCode !== undefined
            ? (payload.globalCustomerCode?.trim().toUpperCase() ?? null)
            : existing.global_customer_code,
        handlingAgentCode: payload.handlingAgentCode !== undefined
            ? (payload.handlingAgentCode?.trim().toUpperCase() ?? null)
            : existing.handling_agent_code,
        activeFlag: payload.activeFlag !== undefined
            ? payload.activeFlag.toUpperCase()
            : existing.active,
    };
    const errors = validateCustomer(merged, false);
    if (errors.length > 0) {
        throw new AppError('Validation failed', 400, { errors });
    }
    await executeQuery(`UPDATE customers SET
      company_name = ?,
      address = ?,
      city = ?,
      pincode = ?,
      pco_code = ?,
      pan_number = ?,
      email = ?,
      mobile = ?,
      global_customer_code = ?,
      handling_agent_code = ?,
      active = ?
    WHERE customer_code = ?`, [
        merged.customerName.trim().slice(0, 100),
        merged.address?.slice(0, 255) ?? null,
        merged.city?.slice(0, 50) ?? null,
        merged.pincode?.slice(0, 10) ?? null,
        merged.pcoCode?.slice(0, 3) ?? null,
        merged.pan?.slice(0, 10) ?? null,
        merged.email?.slice(0, 100) ?? null,
        merged.mobile?.slice(0, 15) ?? null,
        merged.globalCustomerCode ?? null,
        merged.handlingAgentCode ?? null,
        (merged.activeFlag ?? 'Y').toUpperCase(),
        normalizedCode,
    ]);
    const afterRows = await executeQuery(`SELECT * FROM customers WHERE customer_code = ?`, [normalizedCode]);
    res.status(200).json({
        success: true,
        message: 'Customer updated successfully',
        data: mapRowToCustomer(afterRows[0]),
    });
});
//# sourceMappingURL=customerController.js.map