import { env } from '../config/env.js';
export class AppError extends Error {
    statusCode;
    isOperational;
    details;
    constructor(message, statusCode = 500, details) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = statusCode >= 400 && statusCode < 500;
        this.details = details;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
export const notFoundHandler = (req, _res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
};
const mapMySQLError = (err) => {
    const msg = String(err?.message ?? '');
    const code = err?.code ?? err?.errno ?? null;
    // ER_DUP_ENTRY (1062) — duplicate unique key
    if (code === 'ER_DUP_ENTRY' || err?.errno === 1062 || msg.includes('Duplicate entry')) {
        const lower = msg.toLowerCase();
        let field = 'record';
        if (lower.includes('pan'))
            field = 'pan';
        else if (lower.includes('email'))
            field = 'email';
        else if (lower.includes('gstin'))
            field = 'gstinNumber';
        else if (lower.includes('global_code'))
            field = 'globalCustomerCode';
        else if (lower.includes('handling_agent_code'))
            field = 'handlingAgentCode';
        else if (lower.includes('customer_code'))
            field = 'customerCode';
        return new AppError('Duplicate value detected', 409, {
            field,
            dbError: env.isProduction ? undefined : msg,
        });
    }
    // ER_NO_REFERENCED_ROW_2 (1452) — FK violation
    if (code === 'ER_NO_REFERENCED_ROW_2' || err?.errno === 1452) {
        return new AppError('Referenced record does not exist', 409, {
            dbError: env.isProduction ? undefined : msg,
        });
    }
    // ER_ROW_IS_REFERENCED_2 (1451) — FK dependency
    if (code === 'ER_ROW_IS_REFERENCED_2' || err?.errno === 1451) {
        return new AppError('Cannot remove due to dependencies', 409, {
            dbError: env.isProduction ? undefined : msg,
        });
    }
    // ER_BAD_NULL_ERROR (1048) — required field missing
    if (code === 'ER_BAD_NULL_ERROR' || err?.errno === 1048) {
        return new AppError('A required field is missing', 400, {
            dbError: env.isProduction ? undefined : msg,
        });
    }
    // ER_CHECK_CONSTRAINT_VIOLATED (3819) — check constraint
    if (err?.errno === 3819 || msg.includes('Check constraint')) {
        return new AppError('Field value violates database validation rules', 400, {
            dbError: env.isProduction ? undefined : msg,
        });
    }
    return null;
};
export const errorHandler = (err, _req, res, _next) => {
    const mapped = mapMySQLError(err);
    if (mapped)
        err = mapped;
    const statusCode = err.statusCode ?? 500;
    const message = err.isOperational
        ? err.message
        : env.isProduction
            ? 'An unexpected error occurred'
            : err.message ?? 'Internal Server Error';
    const payload = {
        success: false,
        message,
        statusCode,
    };
    if (err.details)
        payload.details = err.details;
    if (env.isDevelopment && !err.isOperational) {
        payload.stack = err.stack;
    }
    if (!env.isProduction && (statusCode >= 500 || err instanceof Error)) {
        console.error('[ERROR]', err);
    }
    // Ensure we always send JSON, even if response is already sent
    if (!res.headersSent) {
        res.status(statusCode).json(payload);
    }
};
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};
//# sourceMappingURL=errorHandler.js.map