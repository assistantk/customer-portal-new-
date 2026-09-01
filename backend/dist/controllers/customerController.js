import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { withTransaction, executeQuery } from '../config/database.js';
import { validateCustomer, validateGstin } from '../utils/validators.js';
import { reserveUniqueCode } from '../utils/codeGenerator.js';
import { sendAuditEmail } from '../utils/email.js';
import path from 'path';
import fs from 'fs/promises';
import { env } from '../config/env.js';
import { addressesMatch, scanDocument } from '../utils/documentScanner.js';
import { isValidPAN, isValidGSTIN, isGstinMatchingPan } from '../utils/validators.js';
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
    email: row.email_id || row.email,
    mobile: row.phone_number || row.mobile,
    activeFlag: row.active || 'Y',
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
        if (isValidPAN(String(payload.pan ?? '').trim().toUpperCase()) && isValidGSTIN(normalizedGstin) && !isGstinMatchingPan(normalizedGstin, String(payload.pan ?? ''))) {
            gstinValidationErrors.push({ field: 'gstinNumber', message: 'GSTIN does not match the PAN number' });
        }
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
        const customerCode = codeType === 'global' ? globalCode : handlingCode;
        const tableName = codeType === 'global' ? 'customer_code' : 'handling_agents';
        const codeCol = codeType === 'global' ? 'customer_code' : 'handling_code';
        const emailCol = codeType === 'global' ? 'email_id' : 'email';
        const mobileCol = codeType === 'global' ? 'phone_number' : 'mobile';
        // Insert full data into the respective table (customer_code or handling_agents)
        // Note: for handling agents, if reserveUniqueCode inserted a row, this should be an UPDATE.
        // However, since we now want to insert the full row, we'll try to DELETE the dummy row first or just UPDATE it.
        // Wait, let's just do an INSERT ... ON DUPLICATE KEY UPDATE.
        // Or, since we modified reserveUniqueCode to not insert for global, for handling we can just update.
        // Let's use INSERT ... ON DUPLICATE KEY UPDATE for safety.
        await conn.execute(`INSERT INTO ${tableName} (
        ${codeCol}, company_name, address, city, pincode,
        pan_number, ${emailCol}, ${mobileCol},
        zone, division
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        company_name = VALUES(company_name),
        address = VALUES(address),
        city = VALUES(city),
        pincode = VALUES(pincode),
        pan_number = VALUES(pan_number),
        ${emailCol} = VALUES(${emailCol}),
        ${mobileCol} = VALUES(${mobileCol}),
        zone = VALUES(zone),
        division = VALUES(division)`, [
            customerCode,
            payload.customerName.trim().slice(0, 100),
            payload.address?.trim().slice(0, 255) ?? null,
            payload.city?.trim().slice(0, 50) ?? null,
            payload.pincode?.trim().slice(0, 20) ?? null,
            payload.pan?.trim().toUpperCase().slice(0, 10) ?? null,
            payload.email?.trim().toLowerCase().slice(0, 100) ?? null,
            payload.mobile?.trim().slice(0, 15) ?? null,
            payload.zone?.slice(0, 50) ?? null,
            payload.operatingDivision?.slice(0, 50) ?? null,
        ]);
        if (panFile) {
            const filePath = path.join('pan', `${customerCode}_PAN_${Date.now()}.pdf`);
            await fs.mkdir(path.join(env.UPLOAD_DIR, 'pan'), { recursive: true });
            await fs.writeFile(path.join(env.UPLOAD_DIR, filePath), panFile.buffer);
            await conn.execute(`UPDATE ${tableName} SET pan_file_name = ?, pan_file_type = ?, pan_file_path = ?, pan_verification_status = 'VERIFIED' WHERE ${codeCol} = ?`, [panFile.originalname, panFile.mimetype, filePath, customerCode]);
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
        // Prepare audit data after successful transaction
        const timestamp = new Date().toISOString();
        const submittedBy = undefined; // No user auth yet
        // Audit for table
        const customerChanges = [];
        const customerColumns = [
            { field: 'company_name', value: payload.customerName?.trim().slice(0, 100) ?? null },
            { field: 'address', value: payload.address?.trim().slice(0, 255) ?? null },
            { field: 'city', value: payload.city?.trim().slice(0, 50) ?? null },
            { field: 'pincode', value: payload.pincode?.trim().slice(0, 20) ?? null },
            { field: 'pan_number', value: payload.pan?.trim().toUpperCase().slice(0, 10) ?? null },
            { field: emailCol, value: payload.email?.trim().toLowerCase().slice(0, 100) ?? null },
            { field: mobileCol, value: payload.mobile?.trim().slice(0, 15) ?? null },
            { field: 'zone', value: payload.zone?.slice(0, 50) ?? null },
            { field: 'division', value: payload.operatingDivision?.slice(0, 50) ?? null },
        ];
        // For INSERT, we consider all columns as changes (oldValue = null)
        customerColumns.forEach(col => {
            customerChanges.push({
                fieldName: col.field,
                oldValue: null,
                newValue: col.value,
            });
        });
        // Audit for customer_gstins table
        const gstinChanges = [];
        let gstinQueryParts = [];
        for (let index = 0; index < gstins.length; index++) {
            const gstin = gstins[index];
            if (!gstin.gstinNumber?.trim() || !gstin.state?.trim())
                continue;
            // For INSERT, oldValue = null
            gstinChanges.push({ fieldName: 'state', oldValue: null, newValue: gstin.state.trim().slice(0, 50) }, { fieldName: 'state_code', oldValue: null, newValue: gstin.stateCode?.trim().slice(0, 2) ?? null }, { fieldName: 'gstin_number', oldValue: null, newValue: gstin.gstinNumber.trim().toUpperCase().slice(0, 15) }, { fieldName: 'file_name', oldValue: null, newValue: gstin.fileName?.trim().slice(0, 255) ?? null }, { fieldName: 'file_type', oldValue: null, newValue: gstin.fileType?.trim().slice(0, 50) ?? null }, { fieldName: 'registered_address', oldValue: null, newValue: gstin.scannedAddress ?? null }, { fieldName: 'gstin_verification_status', oldValue: null, newValue: gstin.scannedAddress ? 'VERIFIED' : 'PENDING' }, { fieldName: 'address_verification_status', oldValue: null, newValue: gstin.scannedAddress ? 'VERIFIED' : 'PENDING' }, { fieldName: 'active', oldValue: null, newValue: 'Y' });
            // Build individual INSERT for this GSTIN
            const gstinCols = 'customer_code, state, state_code, gstin_number, file_name, file_type, file_path, registered_address, gstin_verification_status, address_verification_status, active';
            const gstinVals = [
                `'${customerCode}'`,
                `'${gstin.state.trim().slice(0, 50)}'`,
                gstin.stateCode?.trim().slice(0, 2) ? `'${gstin.stateCode.trim().slice(0, 2)}'` : 'NULL',
                `'${gstin.gstinNumber.trim().toUpperCase().slice(0, 15)}'`,
                gstin.fileName?.trim().slice(0, 255) ? `'${gstin.fileName.trim().slice(0, 255).replace(/'/g, "''")}'` : 'NULL',
                gstin.fileType?.trim().slice(0, 50) ? `'${gstin.fileType.trim().slice(0, 50).replace(/'/g, "''")}'` : 'NULL',
                gstin.filePath ? `'${gstin.filePath.replace(/'/g, "''")}'` : 'NULL',
                gstin.scannedAddress ? `'${gstin.scannedAddress.replace(/'/g, "''")}'` : 'NULL',
                gstin.scannedAddress ? `'VERIFIED'` : `'PENDING'`,
                gstin.scannedAddress ? `'VERIFIED'` : `'PENDING'`,
                `'Y'`
            ].join(', ');
            gstinQueryParts.push(`INSERT INTO customer_gstins (${gstinCols}) VALUES (${gstinVals});`);
        }
        const gstinQuery = gstinQueryParts.join('\n');
        const customerColsStr = customerColumns.map(c => c.field).join(', ');
        const customerValsStr = customerColumns.map(c => c.value === null ? 'NULL' : `'${String(c.value).replace(/'/g, "''")}'`).join(', ');
        const customerQuery = `INSERT INTO ${tableName} (${codeCol}, ${customerColsStr}) VALUES ('${customerCode}', ${customerValsStr});`;
        // Combine executed queries
        const executedQuery = `${customerQuery}\n${gstinQuery}`.trim();
        // Combine all changes
        const allChanges = [
            ...customerChanges,
            ...gstinChanges,
        ];
        // Send audit email
        try {
            await sendAuditEmail({
                page: 'New Entry',
                operation: 'INSERT',
                table: tableName,
                customerCode,
                globalCode: undefined, // removed from DB
                handlingAgentCode: handlingCode, // Fixed variable name
                changes: allChanges,
                executedQuery,
                timestamp,
                submittedBy,
            });
        }
        catch (emailError) {
            console.error('[EMAIL AUDIT] Failed to send audit email for createCustomer:', emailError);
            // Don't fail the request if email fails
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
        handlingAgentCode: undefined,
        activeFlag: payload.activeFlag !== undefined
            ? payload.activeFlag.toUpperCase()
            : existing.active,
        codeType: payload.codeType !== undefined ? payload.codeType : existing.code_type,
        operatingDivision: payload.operatingDivision !== undefined ? payload.operatingDivision : existing.operating_division,
        zone: payload.zone !== undefined ? payload.zone : existing.zone,
    };
    const errors = validateCustomer(merged, false);
    const existingGstinRows = await executeQuery(`SELECT gstin_number FROM customer_gstins WHERE customer_code = ? AND active = 'Y'`, [normalizedCode]);
    for (const row of existingGstinRows) {
        if (isValidPAN(String(merged.pan ?? '')) && isValidGSTIN(String(row.gstin_number ?? '').trim().toUpperCase()) && !isGstinMatchingPan(row.gstin_number, String(merged.pan ?? ''))) {
            errors.push({ field: 'pan', message: 'PAN does not match an existing GSTIN for this customer' });
            break;
        }
    }
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
      active = ?,
      code_type = ?,
      operating_division = ?,
      zone = ?
    WHERE customer_code = ?`, [
        merged.customerName.trim().slice(0, 100),
        merged.address?.slice(0, 255) ?? null,
        merged.city?.slice(0, 50) ?? null,
        merged.pincode?.slice(0, 10) ?? null,
        merged.pcoCode?.slice(0, 3) ?? null,
        merged.pan?.slice(0, 10) ?? null,
        merged.email?.slice(0, 100) ?? null,
        merged.mobile?.slice(0, 15) ?? null,
        (merged.activeFlag ?? 'Y').toUpperCase(),
        merged.codeType?.slice(0, 255) ?? 'Unknown',
        merged.operatingDivision?.slice(0, 255) ?? 'Unknown',
        merged.zone?.slice(0, 255) ?? 'Unknown',
        normalizedCode,
    ]);
    const afterRows = await executeQuery(`SELECT * FROM customers WHERE customer_code = ?`, [normalizedCode]);
    // Prepare audit data after successful update
    const timestamp = new Date().toISOString();
    const submittedBy = undefined; // No user auth yet
    // Audit for customers table - compare existing vs afterRows
    const customerChanges = [];
    const customerFields = [
        { field: 'customer_name', existing: existing.company_name, after: afterRows[0]?.company_name },
        { field: 'address', existing: existing.address, after: afterRows[0]?.address },
        { field: 'city', existing: existing.city, after: afterRows[0]?.city },
        { field: 'pincode', existing: existing.pincode, after: afterRows[0]?.pincode },
        { field: 'pco_code', existing: existing.pco_code, after: afterRows[0]?.pco_code },
        { field: 'pan_number', existing: existing.pan_number, after: afterRows[0]?.pan_number },
        { field: 'email', existing: existing.email, after: afterRows[0]?.email },
        { field: 'mobile', existing: existing.mobile, after: afterRows[0]?.mobile },
        { field: 'active', existing: existing.active, after: afterRows[0]?.active },
        { field: 'code_type', existing: existing.code_type, after: afterRows[0]?.code_type },
        { field: 'operating_division', existing: existing.operating_division, after: afterRows[0]?.operating_division },
        { field: 'zone', existing: existing.zone, after: afterRows[0]?.zone },
    ];
    customerFields.forEach(field => {
        const existingVal = field.existing ?? null;
        const afterVal = field.after ?? null;
        if (JSON.stringify(existingVal) !== JSON.stringify(afterVal)) {
            customerChanges.push({
                fieldName: field.field,
                oldValue: existingVal,
                newValue: afterVal,
            });
        }
    });
    // Audit for customer_gstins table - check if any GSTINs were modified
    // Note: GSTIN modifications are handled separately in gstinController.ts
    // For customer update, we only audit customer table changes
    const allChanges = customerChanges;
    // Build executed query string (UPDATE customers)
    const setClauses = [
        merged.customerName ? `company_name = '${merged.customerName.trim().slice(0, 100).replace(/'/g, "''")}'` : null,
        merged.address !== undefined ? `address = ${merged.address ? `'${merged.address.trim().slice(0, 255).replace(/'/g, "''")}'` : 'NULL'}` : null,
        merged.city !== undefined ? `city = ${merged.city ? `'${merged.city.trim().slice(0, 50).replace(/'/g, "''")}'` : 'NULL'}` : null,
        merged.pincode !== undefined ? `pincode = ${merged.pincode ? `'${merged.pincode.trim().slice(0, 10).replace(/'/g, "''")}'` : 'NULL'}` : null,
        merged.pcoCode !== undefined ? `pco_code = ${merged.pcoCode ? `'${merged.pcoCode.trim().slice(0, 3).replace(/'/g, "''")}'` : 'NULL'}` : null,
        merged.pan !== undefined ? `pan_number = ${merged.pan ? `'${merged.pan.trim().toUpperCase().slice(0, 10).replace(/'/g, "''")}'` : 'NULL'}` : null,
        merged.email !== undefined ? `email = ${merged.email ? `'${merged.email.trim().toLowerCase().slice(0, 100).replace(/'/g, "''")}'` : 'NULL'}` : null,
        merged.mobile !== undefined ? `mobile = ${merged.mobile ? `'${merged.mobile.trim().slice(0, 15).replace(/'/g, "''")}'` : 'NULL'}` : null,
        merged.activeFlag !== undefined ? `active = '${(merged.activeFlag ?? 'Y').toUpperCase()}'` : null,
    ].filter(Boolean).join(', ');
    const executedQuery = `UPDATE customers SET ${setClauses} WHERE customer_code = '${normalizedCode}';`;
    // Log audit information for debugging
    console.log('[AUDIT DEBUG] updateCustomer called for customerCode:', normalizedCode);
    console.log('[AUDIT DEBUG] Number of changes detected:', allChanges.length);
    if (allChanges.length > 0) {
        console.log('[AUDIT DEBUG] Changes:', JSON.stringify(allChanges, null, 2));
    }
    else {
        console.log('[AUDIT DEBUG] No changes detected');
    }
    console.log('[AUDIT DEBUG] Executing query:', executedQuery);
    // Send audit email
    try {
        console.log('[AUDIT DEBUG] About to call sendAuditEmail...');
        await sendAuditEmail({
            page: 'Old User',
            operation: 'UPDATE',
            table: 'customers',
            customerCode: normalizedCode,
            globalCode: afterRows[0]?.global_customer_code ?? null,
            handlingAgentCode: afterRows[0]?.handling_agent_code ?? null,
            changes: allChanges,
            executedQuery,
            timestamp,
            submittedBy,
        });
        console.log('[AUDIT DEBUG] sendAuditEmail completed successfully');
    }
    catch (emailError) {
        console.error('[EMAIL AUDIT] Failed to send audit email for updateCustomer:', emailError);
        // Don't fail the request if email fails
    }
    res.status(200).json({
        success: true,
        message: 'Customer updated successfully',
        data: mapRowToCustomer(afterRows[0]),
    });
});
//# sourceMappingURL=customerController.js.map