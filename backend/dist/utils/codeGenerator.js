import { env } from '../config/env.js';
import { executeQuery } from '../config/database.js';
const CORPORATE_SUFFIXES = [
    'PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'INC', 'CORP',
    'CORPORATION', 'CO', 'COMPANY', 'PLC', 'GROUP', 'HOLDINGS',
    'AND', '&', 'THE',
];
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMERIC = '0123456789';
export const stripCorporateSuffixes = (name) => {
    if (!name)
        return '';
    const tokens = name
        .toUpperCase()
        .replace(/[^A-Z0-9&\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    return tokens
        .filter((t) => !CORPORATE_SUFFIXES.includes(t))
        .join(' ');
};
export const generateBaseCode = (companyName, maxLength = env.CODE_MAX_LENGTH) => {
    const cleaned = stripCorporateSuffixes(companyName);
    if (!cleaned)
        return 'TEMP';
    const words = cleaned.split(/\s+/).filter(Boolean);
    let code = '';
    if (words.length >= maxLength) {
        code = words.slice(0, maxLength).map((w) => w[0] ?? '').join('');
    }
    else if (words.length === 1) {
        const w = words[0];
        code = w.slice(0, maxLength);
    }
    else {
        const firstLetters = words.map((w) => w[0] ?? '').join('');
        const remaining = maxLength - firstLetters.length;
        if (remaining > 0 && words.length > 0) {
            const lastWord = words[words.length - 1];
            code = firstLetters + lastWord.slice(1, 1 + remaining);
        }
        else {
            code = firstLetters.slice(0, maxLength);
        }
    }
    return code.toUpperCase().slice(0, maxLength);
};
export const findNextUniqueSuffix = (existingCodes, base, maxLength = env.CODE_MAX_LENGTH, maxRetries = env.CODE_MAX_RETRIES) => {
    const baseTrim = base.slice(0, maxLength);
    if (!existingCodes.includes(baseTrim))
        return baseTrim;
    const suffixChars = maxLength - 1;
    const basePrefix = baseTrim.slice(0, suffixChars);
    for (let n = 1; n <= maxRetries; n++) {
        const suffix = n.toString();
        if (suffix.length > maxLength - basePrefix.length)
            continue;
        const candidate = (basePrefix + suffix).slice(0, maxLength);
        if (!existingCodes.includes(candidate))
            return candidate;
    }
    for (let i = 0; i < NUMERIC.length; i++) {
        for (let j = 0; j < NUMERIC.length; j++) {
            const candidate = (basePrefix.slice(0, maxLength - 2) + NUMERIC[i] + NUMERIC[j]).slice(0, maxLength);
            if (!existingCodes.includes(candidate))
                return candidate;
        }
    }
    let retries = maxRetries;
    for (let a = 0; a < ALPHA.length && retries-- > 0; a++) {
        for (let n = 0; n < 10 && retries-- > 0; n++) {
            const candidate = (basePrefix.slice(0, maxLength - 2) + ALPHA[a] + n.toString()).slice(0, maxLength);
            if (!existingCodes.includes(candidate))
                return candidate;
        }
    }
    return null;
};
const getTableMeta = (type) => type === 'global'
    ? { table: 'global_customers', codeCol: 'global_code', nameCol: 'company_name' }
    : { table: 'handling_agents', codeCol: 'handling_agent_code', nameCol: 'handling_agent_name' };
export const fetchExistingCodes = async (type) => {
    const { table, codeCol } = getTableMeta(type);
    const rows = await executeQuery(`SELECT ${codeCol} FROM ${table}`, []);
    return rows.map((r) => r[codeCol]);
};
export const insertCodeRow = async (type, code, name) => {
    const { table, codeCol, nameCol } = getTableMeta(type);
    await executeQuery(`INSERT INTO ${table} (${codeCol}, ${nameCol}, central_belonging, edemand_flag, implementation_date, implementation_remark)
     VALUES (?, ?, 'N', 'N', NOW(), 'Registered via Customer Portal')`, [code, name]);
};
export const generateUniqueCode = async (companyName, type, maxLength = env.CODE_MAX_LENGTH) => {
    if (!companyName?.trim()) {
        throw new Error('Company name is required for code generation');
    }
    const base = generateBaseCode(companyName, maxLength);
    const existing = await fetchExistingCodes(type);
    const finalCode = findNextUniqueSuffix(existing, base, maxLength, env.CODE_MAX_RETRIES);
    if (!finalCode) {
        throw new Error(`Could not generate a unique ${type} code for "${companyName}" after ${env.CODE_MAX_RETRIES} attempts. ` +
            `Consider increasing CODE_MAX_LENGTH in the environment.`);
    }
    const variationsTried = finalCode === base
        ? 1
        : existing.filter((c) => c.startsWith(base.slice(0, maxLength - 1))).length + 1;
    return { code: finalCode, base, variationsTried };
};
export const reserveUniqueCode = async (companyName, type, maxLength = env.CODE_MAX_LENGTH) => {
    const generated = await generateUniqueCode(companyName, type, maxLength);
    try {
        await insertCodeRow(type, generated.code, companyName.trim().slice(0, 45));
    }
    catch (dbErr) {
        // MySQL duplicate entry error code
        if (dbErr?.code === 'ER_DUP_ENTRY' ||
            dbErr?.errno === 1062 ||
            String(dbErr?.message ?? '').includes('Duplicate entry')) {
            return reserveUniqueCode(companyName, type, maxLength);
        }
        throw dbErr;
    }
    return generated;
};
//# sourceMappingURL=codeGenerator.js.map