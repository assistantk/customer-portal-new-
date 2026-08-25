import mysql from 'mysql2/promise';
export declare const initPool: () => Promise<mysql.Pool>;
export declare const getPool: () => mysql.Pool;
export declare const closePool: () => Promise<void>;
/**
 * Execute a query using a connection from the pool.
 * Returns [rows, fields].
 */
export declare const executeQuery: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
/**
 * Run a function inside a MySQL transaction.
 * Automatically commits on success, rolls back on error.
 */
export declare const withTransaction: <T>(fn: (conn: mysql.PoolConnection) => Promise<T>) => Promise<T>;
//# sourceMappingURL=database.d.ts.map