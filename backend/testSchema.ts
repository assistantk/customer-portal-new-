import mysql from 'mysql2/promise';
import { env } from './src/config/env.js';

async function run() {
  const pool = mysql.createPool({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  try {
    const [rows, fields] = await pool.query("DESCRIBE customer_code");
    console.log("customer_code columns:", rows.map(r => r.Field));
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
