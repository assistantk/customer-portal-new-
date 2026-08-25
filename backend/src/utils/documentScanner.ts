import { PDFParse } from 'pdf-parse';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';
import { isValidGSTIN, isValidPAN } from './validators.js';

export type DocumentKind = 'pan' | 'gstin';

export interface ScanResult {
  pan: string | null;
  gstin: string | null;
  address: string | null;
  legalName: string | null;
  state: string | null;
  text: string;
}

const PAN_PATTERN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi;
const GSTIN_PATTERN = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi;
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
  const value = text.toUpperCase().replace(/\s+/g, '');
  return value.match(PAN_PATTERN)?.map(v => v.toUpperCase()).find(isValidPAN) ?? null;
};

const findGstin = (text: string): string | null => {
  const value = text.toUpperCase().replace(/[\s-]+/g, '');
  return value.match(GSTIN_PATTERN)?.map(v => v.toUpperCase()).find(isValidGSTIN) ?? null;
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

async function ocrPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const worker = await createWorker('eng');
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as any, canvasContext: canvas.getContext('2d') as any, viewport }).promise;
      const result = await worker.recognize(canvas.toBuffer('image/png'));
      pages.push(result.data.text);
    }
    return pages.join('\n');
  } finally {
    await worker.terminate();
  }
}

export async function scanDocument(kind: DocumentKind, buffer: Buffer): Promise<ScanResult> {
  let text = '';
  try {
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    text = parsed.text || '';
    await parser.destroy();
  } catch {
    text = '';
  }
  if (!text.trim()) text = await ocrPdf(buffer);

  const compact = normalizeText(text);
  const pan = kind === 'pan' ? findPan(compact) : null;
  const gstin = kind === 'gstin' ? findGstin(compact) : null;
  const address = kind === 'gstin' ? extractAddress(text) : null;
  const legalName = kind === 'gstin' ? labelledValue(text, ['legal name', 'trade name']) : null;
  return { pan, gstin, address, legalName, state: null, text: compact };
}