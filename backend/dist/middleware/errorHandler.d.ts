import { Request, Response, NextFunction } from 'express';
export declare class AppError extends Error {
    statusCode: number;
    isOperational: boolean;
    details?: any;
    constructor(message: string, statusCode?: number, details?: any);
}
export declare const notFoundHandler: (req: Request, _res: Response, next: NextFunction) => void;
export declare const errorHandler: (err: any, _req: Request, res: Response, _next: NextFunction) => void;
export declare const asyncHandler: (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=errorHandler.d.ts.map