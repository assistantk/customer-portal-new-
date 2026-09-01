import bcrypt from 'bcryptjs';
import { withTransaction, getPool } from '../config/database.js';
import { env } from '../config/env.js';
const SALT_ROUNDS = 10;
/* ── helpers ── */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidUsername(username) {
    // 3-50 chars, alphanumeric + underscores/hyphens, must start with a letter
    return /^[a-zA-Z][a-zA-Z0-9_-]{2,49}$/.test(username);
}
function checkPassword(password) {
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
 * Check if the users table exists in the database.
 * Returns true if the table exists, false otherwise.
 */
async function isUsersTableReady() {
    let conn;
    try {
        conn = await getPool().getConnection();
        await conn.execute(`SELECT 1 FROM users LIMIT 1`);
        return true;
    }
    catch (err) {
        const msg = String(err?.message ?? '');
        // ER_NO_SUCH_TABLE
        if (err?.errno === 1146 || msg.includes('doesn\'t exist')) {
            return false;
        }
        throw err; // Re-throw non-table-missing errors
    }
    finally {
        if (conn) {
            try {
                conn.release();
            }
            catch (_) { /* ignore */ }
        }
    }
}
/* ── Register ── */
export const register = async (req, res, next) => {
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
            const emailCheck = await conn.execute(`SELECT COUNT(*) AS count FROM users WHERE LOWER(email) = ?`, [trimmedEmail]);
            if (emailCheck[0][0]?.count > 0)
                throw new Error('EMAIL_EXISTS');
            // Duplicate username?
            const usernameCheck = await conn.execute(`SELECT COUNT(*) AS count FROM users WHERE LOWER(username) = ?`, [trimmedUsername.toLowerCase()]);
            if (usernameCheck[0][0]?.count > 0)
                throw new Error('USERNAME_EXISTS');
            // Hash password
            const hash = await bcrypt.hash(password, SALT_ROUNDS);
            // Insert
            await conn.execute(`INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`, [trimmedEmail, trimmedUsername, hash]);
            return res.status(201).json({
                success: true,
                message: 'Account created successfully. Please sign in.',
            });
        });
    }
    catch (err) {
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
export const login = async (req, res, next) => {
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
            const [userRows] = await conn.execute(`SELECT id, email, username, password_hash, active FROM users WHERE LOWER(username) = ?`, [trimmedUsername.toLowerCase()]);
            const user = userRows[0];
            if (!user) {
                return null;
            }
            if (!user.active) {
                return { inactive: true };
            }
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                return null;
            }
            return {
                userId: user.id,
                email: user.email,
                username: user.username,
            };
        });
        if (!result) {
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }
        if (result.inactive) {
            return res.status(403).json({ success: false, message: 'This account has been deactivated.' });
        }
        return res.status(200).json({
            success: true,
            message: 'Login successful.',
            data: result,
        });
    }
    catch (err) {
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
//# sourceMappingURL=authController.js.map