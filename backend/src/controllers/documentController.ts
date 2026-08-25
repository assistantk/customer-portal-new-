import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { scanDocument } from '../utils/documentScanner.js';

export const scanPanDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('PAN PDF file is required', 400);
  const result = await scanDocument('pan', req.file.buffer);
  if (!result.pan) return res.status(422).json({ success: false, pan: null, message: 'PAN number could not be detected from the uploaded document. Please upload a clearer PAN Card PDF or enter the PAN manually.' });
  return res.json({ success: true, pan: result.pan });
});

export const scanGstinDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('GSTIN PDF file is required', 400);
  const result = await scanDocument('gstin', req.file.buffer);
  if (!result.gstin || !result.address) return res.status(422).json({ success: false, gstin: result.gstin, address: result.address, message: 'GSTIN or registered address could not be detected. Please upload a clearer GST certificate.' });
  return res.json({ success: true, gstin: result.gstin, address: result.address, legalName: result.legalName });
});