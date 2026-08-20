import oracledb from 'oracledb';
import { env } from './env.js';

let pool: oracledb.Pool | null = null;

export const getConnectionString = (): string => {
  return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${env.DB_HOST})(PORT=${env.DB_PORT}))(CONNECT_DATA=(SERVICE_NAME=${env.DB_SERVICE})))`;
};

export const initPool = async (): Promise<oracledb.Pool> => {
  if (pool) return pool;

  env.validateRequired();

  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];
  oracledb.autoCommit = false;

  pool = await oracledb.createPool({
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    connectString: getConnectionString(),
    poolMin: env.DB_POOL_MIN,
    poolMax: env.DB_POOL_MAX,
    poolIncrement: env.DB_POOL_INCREMENT,
    poolTimeout: 60,
    queueTimeout: 60000,
    stmtCacheSize: 30,
    enableStatistics: env.isDevelopment,
  });

  console.log(`[DB] Oracle pool created: ${env.DB_USERNAME}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_SERVICE}`);
  return pool;
};

export const getConnection = async (): Promise<oracledb.Connection> => {
  if (!pool) await initPool();
  return await pool!.getConnection();
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.close(0);
    pool = null;
    console.log('[DB] Oracle pool closed.');
  }
};

export const withTransaction = async <T>(
  fn: (conn: oracledb.Connection) => Promise<T>
): Promise<T> => {
  const conn = await getConnection();
  try {
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
    try {
      await conn.close();
    } catch (_) {
      /* ignore close errors */
    }
  }
};

export const executeQuery = async <T = any>(
  sql: string,
  binds: any[] | Record<string, any> = [],
  options: oracledb.ExecuteOptions = {}
): Promise<oracledb.Result<T>> => {
  const conn = await getConnection();
  try {
    return await conn.execute<T>(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: options.autoCommit ?? false,
      ...options,
    });
  } finally {
    try {
      await conn.close();
    } catch (_) {
      /* ignore */
    }
  }
};
