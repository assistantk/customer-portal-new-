import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { scanDocument } from '../utils/documentScanner.js';

export const scanPanDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('PAN document file is required', 400);
  const result = await scanDocument('pan', req.file.buffer);
  if (!result.pan) {
    return res.status(422).json({
      success: false,
      documentType: 'PAN',
      extractedNumber: null,
      message: 'PAN number could not be detected. Please upload a clearer document or enter the PAN manually.',
    });
  }
  return res.json({
    success: true,
    documentType: 'PAN',
    extractedNumber: result.pan,
    confidence: Number(result.confidence.toFixed(2)),
  });
});

export const scanGstinDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('GSTIN document file is required', 400);
  const result = await scanDocument('gstin', req.file.buffer);
  if (!result.gstin) {
    return res.status(422).json({
      success: false,
      documentType: 'GSTIN',
      extractedNumber: null,
      stateCode: null,
      message: 'GSTIN could not be detected. Please upload a clearer document or enter the GSTIN manually.',
    });
  }
  return res.json({
    success: true,
    documentType: 'GSTIN',
    extractedNumber: result.gstin,
    stateCode: result.stateCode,
    state: result.state,
    address: result.address,
    city: result.city,
    pincode: result.pincode,
    legalName: result.legalName,
    confidence: Number(result.confidence.toFixed(2)),
  });
});