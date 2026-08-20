import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = statusCode >= 400 && statusCode < 500;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
};

const mapOracleError = (err: any): AppError | null => {
  const msg = String(err?.message ?? '');
  const code = err?.errorNum ?? err?.code ?? null;

  if (code === 1 || msg.includes('ORA-00001') || msg.includes('unique constraint')) {
    const fieldMatch = msg.match(/\(([A-Z0-9_.]+)\)/)?.[1] ?? 'record';
    const lower = fieldMatch.toLowerCase();
    let field = 'record';
    if (lower.includes('pan')) field = 'pan';
    else if (lower.includes('email')) field = 'email';
    else if (lower.includes('gstin')) field = 'gstinNumber';
    else if (lower.includes('globalcust') || lower.includes('glblcust')) field = 'globalCustomerCode';
    else if (lower.includes('hndgagnt')) field = 'handlingAgentCode';
    return new AppError('Duplicate value detected', 409, {
      field,
      dbError: env.isProduction ? undefined : msg,
    });
  }

  if (code === 2290 || msg.includes('ORA-02290') || msg.includes('check constraint')) {
    return new AppError('Field value violates database validation rules', 400, {
      dbError: env.isProduction ? undefined : msg,
    });
  }

  if (code === 2291 || code === 2292 || msg.includes('ORA-02291') || msg.includes('ORA-02292')) {
    return new AppError('Referenced record does not exist or cannot be removed due to dependencies', 409, {
      dbError: env.isProduction ? undefined : msg,
    });
  }

  if (code === 1400 || msg.includes('ORA-01400') || msg.includes('cannot insert NULL')) {
    return new AppError('A required field is missing', 400, {
      dbError: env.isProduction ? undefined : msg,
    });
  }

  return null;
};

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const mapped = mapOracleError(err);
  if (mapped) err = mapped;

  const statusCode = err.statusCode ?? 500;
  const message = err.isOperational
    ? err.message
    : env.isProduction
      ? 'An unexpected error occurred'
      : err.message ?? 'Internal Server Error';

  const payload: any = {
    success: false,
    message,
    statusCode,
  };

  if (err.details) payload.details = err.details;

  if (env.isDevelopment && !err.isOperational) {
    payload.stack = err.stack;
  }

  if (!env.isProduction && (statusCode >= 500 || err instanceof Error)) {
    console.error('[ERROR]', err);
  }

  res.status(statusCode).json(payload);
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
