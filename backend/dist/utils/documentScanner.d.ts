export type DocumentKind = 'pan' | 'gstin';
export interface ScanResult {
    pan: string | null;
    gstin: string | null;
    address: string | null;
    legalName: string | null;
    state: string | null;
    text: string;
}
export declare const normalizeAddress: (value: string) => string;
export declare const addressesMatch: (left: string, right: string) => boolean;
export declare function scanDocument(kind: DocumentKind, buffer: Buffer): Promise<ScanResult>;
//# sourceMappingURL=documentScanner.d.ts.map