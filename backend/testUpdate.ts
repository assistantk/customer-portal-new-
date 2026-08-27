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
    const [result] = await pool.query("UPDATE customer_code SET company_name = 'TechVision Solutions' WHERE customer_code = 'CUST002'");
    console.log("UPDATE result:", result);
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
