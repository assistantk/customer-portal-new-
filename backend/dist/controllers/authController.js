import bcrypt from 'bcryptjs';
import { withTransaction } from '../config/database.js';
import oracledb from 'oracledb';
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
        // --- Check duplicates & insert inside a transaction ---
        await withTransaction(async (conn) => {
            // Duplicate email?
            const emailCheck = await conn.execute(`SELECT COUNT(*) AS CNT FROM MEMUSERS WHERE LOWER(MAVEMAIL) = :email`, { email: trimmedEmail }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            if (emailCheck.rows?.[0]?.CNT > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'An account with this email already exists.',
                });
            }
            // Duplicate username?
            const usernameCheck = await conn.execute(`SELECT COUNT(*) AS CNT FROM MEMUSERS WHERE LOWER(MAVUSERNAME) = :username`, { username: trimmedUsername.toLowerCase() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            if (usernameCheck.rows?.[0]?.CNT > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'This username is already taken.',
                });
            }
            // Hash password
            const hash = await bcrypt.hash(password, SALT_ROUNDS);
            // Insert
            await conn.execute(`INSERT INTO MEMUSERS (MAVEMAIL, MAVUSERNAME, MAVPASSWORDHASH)
         VALUES (:email, :username, :hash)`, { email: trimmedEmail, username: trimmedUsername, hash });
            return res.status(201).json({
                success: true,
                message: 'Account created successfully. Please sign in.',
            });
        });
    }
    catch (err) {
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
        const result = await withTransaction(async (conn) => {
            const rows = await conn.execute(`SELECT MAVUSERID, MAVEMAIL, MAVUSERNAME, MAVPASSWORDHASH, MACACTIVEFLAG
         FROM MEMUSERS
         WHERE LOWER(MAVUSERNAME) = :username`, { username: trimmedUsername.toLowerCase() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const user = rows.rows?.[0];
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
        next(err);
    }
};
//# sourceMappingURL=authController.js.map