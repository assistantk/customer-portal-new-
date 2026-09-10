export const isValidPAN = (pan) => {
    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
};
export const isValidGSTIN = (gstin) => {
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1}$/.test(gstin);
};
export const isGstinMatchingPan = (gstin, pan) => {
    const normalizedGstin = String(gstin ?? '').replace(/\s+/g, '').toUpperCase();
    const normalizedPan = String(pan ?? '').replace(/\s+/g, '').toUpperCase();
    return normalizedGstin.length === 15 && normalizedPan.length === 10 && normalizedGstin.slice(2, 12) === normalizedPan;
};
export const isValidIndianMobile = (mobile) => {
    return /^[6-9][0-9]{9}$/.test(mobile);
};
export const isValidPincode = (pincode) => {
    return /^[0-9]{6}$/.test(pincode);
};
export const isValidPCO = (pco) => {
    return /^[0-9]{2,3}$/.test(pco);
};
export const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
export const isValidCustomerCode = (code) => {
    return /^[A-Z0-9]{2,10}$/.test(code);
};
export const ALLOWED_GSTIN_FILE_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
];
export const STATE_CODE_MAP = {
    '01': 'Jammu and Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '25': 'Daman and Diu',
    '26': 'Dadra and Nagar Haveli',
    '27': 'Maharashtra',
    '28': 'Andhra Pradesh',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana',
    '37': 'Andhra Pradesh',
    '38': 'Ladakh',
};
export const getStateNameFromCode = (code) => {
    if (!code)
        return null;
    const cleanCode = code.padStart(2, '0');
    return STATE_CODE_MAP[cleanCode] || null;
};
const digitToLetter = {
    '0': 'O',
    '1': 'I',
    '2': 'Z',
    '5': 'S',
    '6': 'G',
    '8': 'B',
};
const letterToDigit = {
    'O': '0', 'Q': '0', 'D': '0',
    'I': '1', 'L': '1',
    'Z': '2',
    'S': '5',
    'G': '6',
    'B': '8',
};
export const correctPanOcr = (candidate) => {
    if (!candidate)
        return null;
    const clean = candidate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 10)
        return null;
    const chars = clean.split('');
    // Pos 0-4: must be uppercase letters
    for (let i = 0; i < 5; i++) {
        if (/\d/.test(chars[i])) {
            chars[i] = digitToLetter[chars[i]] || chars[i];
        }
    }
    // Pos 5-8: must be digits
    for (let i = 5; i < 9; i++) {
        if (/[A-Z]/.test(chars[i])) {
            chars[i] = letterToDigit[chars[i]] || chars[i];
        }
    }
    // Pos 9: must be uppercase letter
    if (/\d/.test(chars[9])) {
        chars[9] = digitToLetter[chars[9]] || chars[9];
    }
    const result = chars.join('');
    return isValidPAN(result) ? result : null;
};
export const correctGstinOcr = (candidate) => {
    if (!candidate)
        return null;
    const clean = candidate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 15)
        return null;
    const chars = clean.split('');
    // Pos 0-1: state code (digits)
    for (let i = 0; i < 2; i++) {
        if (/[A-Z]/.test(chars[i])) {
            chars[i] = letterToDigit[chars[i]] || chars[i];
        }
    }
    // Pos 2-11: embedded PAN (5 letters + 4 digits + 1 letter)
    for (let i = 2; i < 7; i++) {
        if (/\d/.test(chars[i])) {
            chars[i] = digitToLetter[chars[i]] || chars[i];
        }
    }
    for (let i = 7; i < 11; i++) {
        if (/[A-Z]/.test(chars[i])) {
            chars[i] = letterToDigit[chars[i]] || chars[i];
        }
    }
    if (/\d/.test(chars[11])) {
        chars[11] = digitToLetter[chars[11]] || chars[11];
    }
    // Pos 12: entity number [1-9A-Z]
    // Pos 13: default 'Z'
    if (chars[13] !== 'Z') {
        if (['2', '7', 'S'].includes(chars[13])) {
            chars[13] = 'Z';
        }
    }
    // Pos 14: checksum [0-9A-Z]
    const result = chars.join('');
    return isValidGSTIN(result) ? result : null;
};
export const MAX_GSTIN_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const validateCustomer = (payload, forCreate = true) => {
    const errors = [];
    if (!payload.customerName?.trim()) {
        errors.push({ field: 'customerName', message: 'Customer name is required' });
    }
    else if (payload.customerName.length > 100) {
        errors.push({ field: 'customerName', message: 'Customer name must be ≤ 100 characters' });
    }
    if (forCreate && !payload.customerCode?.trim()) {
        // customerCode is allowed to be generated server-side; skip check
    }
    else if (payload.customerCode && !isValidCustomerCode(payload.customerCode)) {
        errors.push({ field: 'customerCode', message: 'Customer code must be 2-10 alphanumeric characters' });
    }
    if (!payload.pan?.trim()) {
        errors.push({ field: 'pan', message: 'PAN is required' });
    }
    else if (!isValidPAN(payload.pan.trim().toUpperCase())) {
        errors.push({ field: 'pan', message: 'PAN must be in format AAAAA9999A (5 letters + 4 digits + 1 letter)' });
    }
    if (payload.email && !isValidEmail(payload.email)) {
        errors.push({ field: 'email', message: 'Invalid email format' });
    }
    if (payload.mobile && !isValidIndianMobile(payload.mobile)) {
        errors.push({ field: 'mobile', message: 'Mobile must be a 10-digit Indian number starting with 6-9' });
    }
    if (payload.pincode && !isValidPincode(payload.pincode)) {
        errors.push({ field: 'pincode', message: 'Pincode must be 6 digits' });
    }
    if (payload.pcoCode && !isValidPCO(payload.pcoCode)) {
        errors.push({ field: 'pcoCode', message: 'PCO code must be 2-3 digits' });
    }
    const hasGlobal = !!payload.globalCustomerCode?.trim();
    const hasHandling = !!payload.handlingAgentCode?.trim();
    if (!(hasGlobal || hasHandling)) {
        errors.push({ field: 'globalCustomerCode', message: 'Either Global Code or Handling Agent Code is required' });
    }
    else if (hasGlobal && hasHandling) {
        errors.push({ field: 'handlingAgentCode', message: 'Use either Global Code OR Handling Agent Code, not both' });
    }
    if (payload.globalCustomerCode && payload.globalCustomerCode.length > 4) {
        errors.push({ field: 'globalCustomerCode', message: 'Global Code must be ≤ 4 characters (FOIS VARCHAR2(4))' });
    }
    if (payload.handlingAgentCode && payload.handlingAgentCode.length > 4) {
        errors.push({ field: 'handlingAgentCode', message: 'Handling Agent Code must be ≤ 4 characters (FOIS VARCHAR2(4))' });
    }
    if (payload.activeFlag && !['Y', 'N'].includes(payload.activeFlag)) {
        errors.push({ field: 'activeFlag', message: 'Active flag must be Y or N' });
    }
    return errors;
};
export const validateGstin = (payload, forCreate = true) => {
    const errors = [];
    if (!payload.state?.trim()) {
        errors.push({ field: 'state', message: 'State is required' });
    }
    else if (payload.state.length > 50) {
        errors.push({ field: 'state', message: 'State must be ≤ 50 characters' });
    }
    if (payload.stateCode && payload.stateCode.length > 2) {
        errors.push({ field: 'stateCode', message: 'State code must be ≤ 2 characters' });
    }
    if (!payload.gstinNumber?.trim()) {
        errors.push({ field: 'gstinNumber', message: 'GSTIN number is required' });
    }
    else if (!isValidGSTIN(payload.gstinNumber)) {
        errors.push({ field: 'gstinNumber', message: 'GSTIN must be a valid 15-character Indian GSTIN format' });
    }
    if (payload.fileType && !ALLOWED_GSTIN_FILE_TYPES.includes(payload.fileType)) {
        errors.push({ field: 'fileType', message: `GSTIN file must be one of: ${ALLOWED_GSTIN_FILE_TYPES.join(', ')}` });
    }
    if (forCreate && !payload.fileName?.trim() && !payload.fileBuffer) {
        errors.push({ field: 'fileName', message: 'GSTIN PDF file is required' });
    }
    if (payload.filePath && payload.filePath.length > 500) {
        errors.push({ field: 'filePath', message: 'GSTIN file path must be ≤ 500 characters' });
    }
    if (payload.fileBuffer && payload.fileBuffer.length > MAX_GSTIN_FILE_SIZE) {
        errors.push({ field: 'fileBuffer', message: `GSTIN file size must be ≤ ${MAX_GSTIN_FILE_SIZE / 1024 / 1024}MB` });
    }
    if (payload.activeFlag && !['Y', 'N'].includes(payload.activeFlag)) {
        errors.push({ field: 'activeFlag', message: 'Active flag must be Y or N' });
    }
    return errors;
};
//# sourceMappingURL=validators.js.map