export interface ValidationError {
    field: string;
    message: string;
}
export declare const isValidPAN: (pan: string) => boolean;
export declare const isValidGSTIN: (gstin: string) => boolean;
export declare const isGstinMatchingPan: (gstin: string, pan: string) => boolean;
export declare const isValidIndianMobile: (mobile: string) => boolean;
export declare const isValidPincode: (pincode: string) => boolean;
export declare const isValidPCO: (pco: string) => boolean;
export declare const isValidEmail: (email: string) => boolean;
export declare const isValidCustomerCode: (code: string) => boolean;
export declare const ALLOWED_GSTIN_FILE_TYPES: string[];
export declare const MAX_GSTIN_FILE_SIZE: number;
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
export declare const validateCustomer: (payload: CustomerPayload, forCreate?: boolean) => ValidationError[];
export declare const validateGstin: (payload: GstinPayload, forCreate?: boolean) => ValidationError[];
//# sourceMappingURL=validators.d.ts.map