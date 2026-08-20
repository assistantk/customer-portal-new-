import dotenv from 'dotenv';

dotenv.config();

export const env = {
  DB_HOST: process.env.DB_HOST ?? 'localhost',
  DB_PORT: Number(process.env.DB_PORT ?? 1521),
  DB_SERVICE: process.env.DB_SERVICE ?? 'ORCL',
  DB_USERNAME: process.env.DB_USERNAME ?? '',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',

  DB_POOL_MIN: Number(process.env.DB_POOL_MIN ?? 4),
  DB_POOL_MAX: Number(process.env.DB_POOL_MAX ?? 20),
  DB_POOL_INCREMENT: Number(process.env.DB_POOL_INCREMENT ?? 2),

  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  CODE_MAX_LENGTH: Number(process.env.CODE_MAX_LENGTH ?? 4),
  CODE_MAX_RETRIES: Number(process.env.CODE_MAX_RETRIES ?? 50),

  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',

  validateRequired: () => {
    const missing: string[] = [];
    if (!process.env.DB_USERNAME) missing.push('DB_USERNAME');
    if (!process.env.DB_PASSWORD) missing.push('DB_PASSWORD');
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill in the values.`
      );
    }
  },
};
