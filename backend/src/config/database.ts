import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool: mysql.Pool | null = null;

export const initPool = async (): Promise<mysql.Pool> => {
  if (pool) return pool;

  pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: env.DB_POOL_MAX,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: 'utf8mb4',
    timezone: '+00:00',
  });

  // Test the connection
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();

  console.log(`[DB] MySQL pool created: ${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);
  return pool;
};

export const getPool = (): mysql.Pool => {
  if (!pool) throw new Error('Database pool not initialized. Call initPool() first.');
  return pool;
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[DB] MySQL pool closed.');
  }
};

/**
 * Execute a query using a connection from the pool.
 * Returns [rows, fields].
 */
export const executeQuery = async <T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> => {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows as T[];
};

/**
 * Run a function inside a MySQL transaction.
 * Automatically commits on success, rolls back on error.
 */
export const withTransaction = async <T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> => {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    conn.release();
  }
};
