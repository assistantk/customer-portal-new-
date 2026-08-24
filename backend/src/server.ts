import express, { Request, Response, json } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { initPool, closePool } from './config/database.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import customerRoutes from './routes/customerRoutes.js';
import codeRoutes from './routes/codeRoutes.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: env.isProduction ? undefined : false,
}));

app.use(cors({
  origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.use(json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Customer Registration API is running',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    foisReady: env.DB_USERNAME.length > 0,
  });
});

app.use('/api/customers', customerRoutes);
app.use('/api/codes', codeRoutes);
app.use('/api/auth', authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const shutdown = async (signal: string) => {
  console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
  await closePool();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
});

const start = async () => {
  try {
    await initPool();
    app.listen(env.PORT, () => {
      console.log(`[Server] 🚀 Customer Registration API listening on port ${env.PORT}`);
      console.log(`[Server] Environment: ${env.NODE_ENV}`);
      console.log(`[Server] CORS origin: ${env.CORS_ORIGIN}`);
      console.log(`[Server] CODE_MAX_LENGTH: ${env.CODE_MAX_LENGTH}`);
      console.log(`[Server] Health check: http://localhost:${env.PORT}/api/health`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
};

start();

export default app;
