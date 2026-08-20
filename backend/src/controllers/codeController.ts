import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import {
  generateUniqueCode,
  reserveUniqueCode,
  generateBaseCode,
  stripCorporateSuffixes,
  CodeType,
} from '../utils/codeGenerator.js';
import { env } from '../config/env.js';

export const generateGlobalCode = asyncHandler(async (req: Request, res: Response) => {
  const { companyName, reserve = false } = req.body;
  if (!companyName?.trim()) {
    throw new AppError('companyName is required', 400);
  }

  const base = generateBaseCode(companyName, env.CODE_MAX_LENGTH);
  const cleaned = stripCorporateSuffixes(companyName);

  const fn = reserve ? reserveUniqueCode : generateUniqueCode;
  const result = await fn(companyName, 'global' as CodeType, env.CODE_MAX_LENGTH);

  res.status(200).json({
    success: true,
    data: {
      code: result.code,
      base,
      cleanedName: cleaned,
      reserved: !!reserve,
      codeType: 'global',
      maxLength: env.CODE_MAX_LENGTH,
      variationsTried: result.variationsTried,
    },
  });
});

export const generateHandlingCode = asyncHandler(async (req: Request, res: Response) => {
  const { companyName, reserve = false } = req.body;
  if (!companyName?.trim()) {
    throw new AppError('companyName is required', 400);
  }

  const base = generateBaseCode(companyName, env.CODE_MAX_LENGTH);
  const cleaned = stripCorporateSuffixes(companyName);

  const fn = reserve ? reserveUniqueCode : generateUniqueCode;
  const result = await fn(companyName, 'handling' as CodeType, env.CODE_MAX_LENGTH);

  res.status(200).json({
    success: true,
    data: {
      code: result.code,
      base,
      cleanedName: cleaned,
      reserved: !!reserve,
      codeType: 'handling',
      maxLength: env.CODE_MAX_LENGTH,
      variationsTried: result.variationsTried,
    },
  });
});
