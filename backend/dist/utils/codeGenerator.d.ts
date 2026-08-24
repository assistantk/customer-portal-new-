export declare const stripCorporateSuffixes: (name: string) => string;
export declare const generateBaseCode: (companyName: string, maxLength?: number) => string;
export declare const findNextUniqueSuffix: (existingCodes: string[], base: string, maxLength?: number, maxRetries?: number) => string | null;
export type CodeType = 'global' | 'handling';
export declare const fetchExistingCodes: (type: CodeType) => Promise<string[]>;
export declare const insertCodeRow: (type: CodeType, code: string, name: string) => Promise<void>;
export declare const generateUniqueCode: (companyName: string, type: CodeType, maxLength?: number) => Promise<{
    code: string;
    base: string;
    variationsTried: number;
}>;
export declare const reserveUniqueCode: (companyName: string, type: CodeType, maxLength?: number) => Promise<{
    code: string;
    base: string;
    variationsTried: number;
}>;
//# sourceMappingURL=codeGenerator.d.ts.map