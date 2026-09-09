import { PDFParse } from 'pdf-parse';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';
import { isValidGSTIN, isValidPAN, correctPanOcr, correctGstinOcr, getStateNameFromCode } from './validators.js';

export type DocumentKind = 'pan' | 'gstin';

export interface ScanResult {
  pan: string | null;
  gstin: string | null;
  address: string | null;
  legalName: string | null;
  stateCode: string | null;
  state: string | null;
  confidence: number;
  text: string;
}

const PAN_PATTERN = /[A-Z0-9]{10}/gi;
const GSTIN_PATTERN = /[A-Z0-9]{15}/gi;
const PIN_PATTERN = /\b[1-9][0-9]{5}\b/g;

export const normalizeAddress = (value: string): string => value
  .toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ')
  .replace(/\b(RD|STREET|ST)\b/g, ' ROAD ')
  .replace(/\s+/g, ' ')
  .trim();

export const addressesMatch = (left: string, right: string): boolean => {
  const a = normalizeAddress(left);
  const b = normalizeAddress(right);
  if (!a || !b) return false;
  const leftPin = a.match(PIN_PATTERN)?.[0];
  const rightPin = b.match(PIN_PATTERN)?.[0];
  if (leftPin && rightPin && leftPin !== rightPin) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(' ').filter(token => token.length > 1));
  const bTokens = new Set(b.split(' ').filter(token => token.length > 1));
  const overlap = [...aTokens].filter(token => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size) >= 0.6;
};

const normalizeText = (value: string): string => value.replace(/[|]/g, 'I').replace(/\s+/g, ' ').trim();

const findPan = (text: string): string | null => {
  const clean = text.toUpperCase().replace(/[\s:-]+/g, '');
  // 1. Direct valid match
  const directMatch = clean.match(/[A-Z]{5}[0-9]{4}[A-Z]/g);
  if (directMatch) {
    const valid = directMatch.find(isValidPAN);
    if (valid) return valid;
  }
  // 2. Candidate match with position-aware OCR correction
  const candidates = clean.match(PAN_PATTERN) || [];
  for (const cand of candidates) {
    const corrected = correctPanOcr(cand);
    if (corrected) return corrected;
  }
  return null;
};

const findGstin = (text: string): string | null => {
  const clean = text.toUpperCase().replace(/[\s:-]+/g, '');
  // 1. Direct valid match
  const directMatch = clean.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/g);
  if (directMatch) {
    const valid = directMatch.find(isValidGSTIN);
    if (valid) return valid;
  }
  // 2. Candidate match with position-aware OCR correction
  const candidates = clean.match(GSTIN_PATTERN) || [];
  for (const cand of candidates) {
    const corrected = correctGstinOcr(cand);
    if (corrected) return corrected;
  }
  return null;
};

const labelledValue = (text: string, labels: string[]): string | null => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const index = lines.findIndex(line => labels.some(label => line.toLowerCase().includes(label.toLowerCase())));
  if (index < 0) return null;
  const sameLine = lines[index].split(/[:]/).slice(1).join(':').trim();
  return sameLine || lines[index + 1] || null;
};

const extractAddress = (text: string): string | null => {
  const value = labelledValue(text, ['registered address', 'principal place of business', 'business address', 'address']);
  if (!value) return null;
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line => line.toLowerCase().includes(value.toLowerCase()));
  const selected = start >= 0 ? lines.slice(start, start + 5) : [value];
  const address = selected.join(', ');
  return PIN_PATTERN.test(address) ? address : null;
};

async function ocrImage(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(buffer);
    const confidence = (result.data.confidence || 90) / 100;
    return { text: result.data.text, confidence };
  } finally {
    await worker.terminate();
  }
}

async function ocrPdf(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const worker = await createWorker('eng');
  try {
    const pages: string[] = [];
    let totalConf = 0;
    let count = 0;
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as any, canvasContext: canvas.getContext('2d') as any, viewport }).promise;
      const result = await worker.recognize(canvas.toBuffer('image/png'));
      pages.push(result.data.text);
      totalConf += result.data.confidence || 90;
      count++;
    }
    const confidence = count > 0 ? (totalConf / count) / 100 : 0.9;
    return { text: pages.join('\n'), confidence };
  } finally {
    await worker.terminate();
  }
}

export async function scanDocument(kind: DocumentKind, buffer: Buffer): Promise<ScanResult> {
  let text = '';
  let confidence = 0.95;

  // Check magic bytes to determine if PDF or Image
  const isPdf = buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF

  if (isPdf) {
    try {
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      text = parsed.text || '';
      await parser.destroy();
      confidence = 0.98;
    } catch {
      text = '';
    }
    if (!text.trim()) {
      const res = await ocrPdf(buffer);
      text = res.text;
      confidence = res.confidence;
    }
  } else {
    // Image file (JPG/JPEG/PNG)
    const res = await ocrImage(buffer);
    text = res.text;
    confidence = res.confidence;
  }

  const compact = normalizeText(text);
  const pan = kind === 'pan' ? findPan(compact) : null;
  const gstin = kind === 'gstin' ? findGstin(compact) : null;
  const address = kind === 'gstin' ? extractAddress(text) : null;
  const legalName = kind === 'gstin' ? labelledValue(text, ['legal name', 'trade name']) : null;
  const stateCode = gstin ? gstin.slice(0, 2) : null;
  const state = stateCode ? getStateNameFromCode(stateCode) : null;

  return { pan, gstin, address, legalName, stateCode, state, confidence, text: compact };
}