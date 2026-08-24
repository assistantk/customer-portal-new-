import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { withTransaction, getConnection } from '../config/database.js';
import { env } from '../config/env.js';
import oracledb from 'oracledb';

const SALT_ROUNDS = 10;

/* ── helpers ── */

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username: string): boolean {
  // 3-50 chars, alphanumeric + underscores/hyphens, must start with a letter
  return /^[a-zA-Z][a-zA-Z0-9_-]{2,49}$/.test(username);
}

interface PasswordCheck {
  valid: boolean;
  message: string;
}

function checkPassword(password: string): PasswordCheck {
  if (password.length < 8)
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  if (!/[A-Z]/.test(password))
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  if (!/[a-z]/.test(password))
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  if (!/[0-9]/.test(password))
    return { valid: false, message: 'Password must contain at least one digit.' };
  if (!/[^a-zA-Z0-9]/.test(password))
    return { valid: false, message: 'Password must contain at least one special character.' };
  return { valid: true, message: '' };
}

/**
 * Check if the MEMUSERS table exists in the database.
 * Returns true if the table exists, false otherwise.
 */
async function isUsersTableReady(): Promise<boolean> {
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `SELECT 1 FROM MEMUSERS WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return true;
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    // ORA-00942: table or view does not exist
    if (err?.errorNum === 942 || msg.includes('ORA-00942')) {
      return false;
    }
    throw err; // Re-throw non-table-missing errors
  } finally {
    if (conn) {
      try { await conn.close(); } catch (_) { /* ignore */ }
    }
  }
}

/* ── Register ── */

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, username, password, confirmPassword } = req.body;

    // --- Validate inputs ---
    if (!email || !username || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    if (!isValidUsername(trimmedUsername)) {
      return res.status(400).json({
        success: false,
        message: 'Username must be 3-50 characters, start with a letter, and contain only letters, numbers, underscores, or hyphens.',
      });
    }

    const pwCheck = checkPassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    // --- Check if MEMUSERS table exists ---
    const tableReady = await isUsersTableReady();
    if (!tableReady) {
      return res.status(503).json({
        success: false,
        message: 'Authentication tables not initialized. Please run database/06_create_users_table.sql against your Oracle instance.',
      });
    }

    // --- Check duplicates & insert inside a transaction ---
    await withTransaction(async (conn) => {
      // Duplicate email?
      const emailCheck = await conn.execute<{ CNT: number }>(
        `SELECT COUNT(*) AS CNT FROM MEMUSERS WHERE LOWER(MAVEMAIL) = :email`,
        { email: trimmedEmail },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if ((emailCheck.rows as any)?.[0]?.CNT > 0) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists.',
        });
      }

      // Duplicate username?
      const usernameCheck = await conn.execute<{ CNT: number }>(
        `SELECT COUNT(*) AS CNT FROM MEMUSERS WHERE LOWER(MAVUSERNAME) = :username`,
        { username: trimmedUsername.toLowerCase() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if ((usernameCheck.rows as any)?.[0]?.CNT > 0) {
        return res.status(409).json({
          success: false,
          message: 'This username is already taken.',
        });
      }

      // Hash password
      const hash = await bcrypt.hash(password, SALT_ROUNDS);

      // Insert
      await conn.execute(
        `INSERT INTO MEMUSERS (MAVEMAIL, MAVUSERNAME, MAVPASSWORDHASH)
         VALUES (:email, :username, :hash)`,
        { email: trimmedEmail, username: trimmedUsername, hash },
      );

      return res.status(201).json({
        success: true,
        message: 'Account created successfully. Please sign in.',
      });
    });
  } catch (err: any) {
    // Provide a clear message for common Oracle connection errors
    const msg = String(err?.message ?? '');
    if (msg.includes('ORA-12541') || msg.includes('ORA-12514') || msg.includes('ECONNREFUSED')) {
      return res.status(503).json({
        success: false,
        message: 'Cannot connect to database. Please ensure Oracle is running and backend .env is configured.',
      });
    }
    // Log the error for debugging
    console.error('[Auth Register Error]', err);
    next(err);
  }
};

/* ── Login ── */

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const trimmedUsername = username.trim();

    // --- Check if MEMUSERS table exists ---
    const tableReady = await isUsersTableReady();

    // Dev-mode fallback: if MEMUSERS table doesn't exist AND not production,
    // allow login with any credentials so the app is usable during development.
    if (!tableReady) {
      if (!env.isProduction) {
        console.warn('[Auth] MEMUSERS table not found. Dev-mode bypass: allowing login for any credentials.');
        return res.status(200).json({
          success: true,
          message: 'Login successful (dev-mode bypass — MEMUSERS table not initialized).',
          data: {
            userId: 0,
            email: 'dev@localhost',
            username: trimmedUsername,
          },
        });
      }
      return res.status(503).json({
        success: false,
        message: 'Authentication tables not initialized. Please run database/06_create_users_table.sql against your Oracle instance.',
      });
    }

    // --- Real authentication against MEMUSERS ---
    const result = await withTransaction(async (conn) => {
      const rows = await conn.execute<{
        MAVUSERID: number;
        MAVEMAIL: string;
        MAVUSERNAME: string;
        MAVPASSWORDHASH: string;
        MACACTIVEFLAG: string;
      }>(
        `SELECT MAVUSERID, MAVEMAIL, MAVUSERNAME, MAVPASSWORDHASH, MACACTIVEFLAG
         FROM MEMUSERS
         WHERE LOWER(MAVUSERNAME) = :username`,
        { username: trimmedUsername.toLowerCase() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const user = (rows.rows as any)?.[0];
      if (!user) {
        return null;
      }

      if (user.MACACTIVEFLAG !== 'Y') {
        return { inactive: true };
      }

      const match = await bcrypt.compare(password, user.MAVPASSWORDHASH);
      if (!match) {
        return null;
      }

      return {
        userId: user.MAVUSERID,
        email: user.MAVEMAIL,
        username: user.MAVUSERNAME,
      };
    });

    if (!result) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    if ((result as any).inactive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: result,
    });
  } catch (err: any) {
    // Provide a clear message for common Oracle connection errors
    const msg = String(err?.message ?? '');
    if (msg.includes('ORA-12541') || msg.includes('ORA-12514') || msg.includes('ECONNREFUSED')) {
      // Dev-mode fallback when Oracle is completely unreachable
      if (!env.isProduction) {
        const trimmedUsername = req.body?.username?.trim() ?? 'dev';
        console.warn('[Auth] Oracle unreachable. Dev-mode bypass: allowing login.');
        return res.status(200).json({
          success: true,
          message: 'Login successful (dev-mode bypass — Oracle unreachable).',
          data: {
            userId: 0,
            email: 'dev@localhost',
            username: trimmedUsername,
          },
        });
      }
      return res.status(503).json({
        success: false,
        message: 'Cannot connect to database. Please ensure Oracle is running and backend .env is configured.',
      });
    }
    // Pass all other errors to the error handler
    console.error('[Auth Login Error]', err);
    next(err);
  }
};
