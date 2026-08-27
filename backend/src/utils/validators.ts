export interface ValidationError {
  field: string;
  message: string;
}

export const isValidPAN = (pan: string): boolean => {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
};

export const isValidGSTIN = (gstin: string): boolean => {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1}$/.test(gstin);
};

export const isValidIndianMobile = (mobile: string): boolean => {
  return /^[6-9][0-9]{9}$/.test(mobile);
};

export const isValidPincode = (pincode: string): boolean => {
  return /^[0-9]{6}$/.test(pincode);
};

export const isValidPCO = (pco: string): boolean => {
  return /^[0-9]{2,3}$/.test(pco);
};

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidCustomerCode = (code: string): boolean => {
  return /^[A-Z0-9]{2,10}$/.test(code);
};

export const ALLOWED_GSTIN_FILE_TYPES = [
  'application/pdf',
];

export const MAX_GSTIN_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export interface CustomerPayload {
  customerCode?: string;
  customerName: string;
  address?: string;
  city?: string;
  pincode?: string;
  pcoCode?: string;
  pan?: string;
  email?: string;
  mobile?: string;
  globalCustomerCode?: string;
  handlingAgentCode?: string;
  activeFlag?: string;
  codeType?: string;
  operatingDivision?: string;
  zone?: string;
}

export interface GstinPayload {
  gstinId?: number;
  state: string;
  stateCode?: string;
  gstinNumber: string;
  fileName?: string;
  fileType?: string;
  filePath?: string;
  fileBuffer?: Buffer;
  activeFlag?: string;
}

export const validateCustomer = (
  payload: CustomerPayload,
  forCreate: boolean = true
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!payload.customerName?.trim()) {
    errors.push({ field: 'customerName', message: 'Customer name is required' });
  } else if (payload.customerName.length > 100) {
    errors.push({ field: 'customerName', message: 'Customer name must be ≤ 100 characters' });
  }

  if (forCreate && !payload.customerCode?.trim()) {
    // customerCode is allowed to be generated server-side; skip check
  } else if (payload.customerCode && !isValidCustomerCode(payload.customerCode)) {
    errors.push({ field: 'customerCode', message: 'Customer code must be 2-10 alphanumeric characters' });
  }

  if (payload.pan && !isValidPAN(payload.pan)) {
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
  } else if (hasGlobal && hasHandling) {
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

export const validateGstin = (
  payload: GstinPayload,
  forCreate: boolean = true
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!payload.state?.trim()) {
    errors.push({ field: 'state', message: 'State is required' });
  } else if (payload.state.length > 50) {
    errors.push({ field: 'state', message: 'State must be ≤ 50 characters' });
  }

  if (payload.stateCode && payload.stateCode.length > 2) {
    errors.push({ field: 'stateCode', message: 'State code must be ≤ 2 characters' });
  }

  if (!payload.gstinNumber?.trim()) {
    errors.push({ field: 'gstinNumber', message: 'GSTIN number is required' });
  } else if (!isValidGSTIN(payload.gstinNumber)) {
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
