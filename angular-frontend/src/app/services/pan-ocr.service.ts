import { Injectable } from '@angular/core';

export const STATE_CODE_MAP: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Dadra and Nagar Haveli and Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export function getStateNameFromGstinCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return STATE_CODE_MAP[String(code).padStart(2, '0')] || null;
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PIN_PATTERN = /\b[1-9][0-9]{5}\b/;
const MAX_PDF_PAGES = 50;
const baseUri = typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://localhost/';
const TESSERACT_ASSET_BASE = new URL('assets/tesseract-assets/', baseUri).href;
const TESSERACT_LANGUAGE_BASE = new URL('assets/tessdata/', baseUri).href;
const ADDRESS_BOUNDARY = /\b(?:date\s+of\s+liabil\w{2,}|date\s+of\s+valid\w{2,}|type\s+of\s+registration|status\s+of\s+registration|registration\s+status|additional\s+places?\s+of\s+business|details?\s+of\s+additional\s+places?\s+of\s+business)\b|\b\d{1,2}\s*[.)]?\s*(?=(?:date|type|status|principal|additional|nature|constitution)\b)/i;
const ADDRESS_LABELS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'building', pattern: /Building\s+No\.?\s*\/\s*Flat\s+No\.?/ig },
  { key: 'premises', pattern: /Name\s+Of\s+Premises\s*\/\s*Building/ig },
  { key: 'road', pattern: /Road\s*\/\s*Street/ig },
  { key: 'landmark', pattern: /Nearby\s+Landmark/ig },
  { key: 'locality', pattern: /Locality\s*\/\s*Sub\s*Locality/ig },
  { key: 'city', pattern: /City\s*\/\s*Town\s*\/\s*Village/ig },
  { key: 'district', pattern: /\bDistrict\b/ig },
  { key: 'state', pattern: /\bState\b/ig },
  { key: 'pincode', pattern: /\bPIN\s*Code\b|\bPincode\b/ig },
];
const KNOWN_STATES = [...new Set(Object.values(STATE_CODE_MAP))].sort((a, b) => b.length - a.length);
const DIGIT_TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' };
const LETTER_TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };

export interface ExtractedGstinDetails {
  gstin?: string | null;
  stateCode?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  state?: string | null;
  tradeName?: string | null;
  legalName?: string | null;
  businessName?: string | null;
  stateName?: string | null;
}

interface ParsedAddress {
  address: string | null;
  city: string | null;
  pincode: string | null;
  state: string | null;
}

interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
  cleanup(): void;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

type OcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;

function correctGstinCandidate(candidate: string): string | null {
  const clean = candidate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 15) return null;
  const chars = clean.split('');
  for (let index = 0; index < 2; index++) {
    if (/[A-Z]/.test(chars[index])) chars[index] = LETTER_TO_DIGIT[chars[index]] || chars[index];
  }
  for (let index = 2; index < 7; index++) {
    if (/\d/.test(chars[index])) chars[index] = DIGIT_TO_LETTER[chars[index]] || chars[index];
  }
  for (let index = 7; index < 11; index++) {
    if (/[A-Z]/.test(chars[index])) chars[index] = LETTER_TO_DIGIT[chars[index]] || chars[index];
  }
  if (/\d/.test(chars[11])) chars[11] = DIGIT_TO_LETTER[chars[11]] || chars[11];
  if (chars[13] !== 'Z' && ['2', '7', 'S'].includes(chars[13])) chars[13] = 'Z';
  const corrected = chars.join('');
  return GSTIN_REGEX.test(corrected) ? corrected : null;
}

function cleanText(value: string): string {
  return value
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/[,;]\s*\./g, ',')
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
    .trim();
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b[a-z]/g, character => character.toUpperCase());
}

function titleCaseAddress(value: string): string {
  return value.toLowerCase().replace(/\b([a-z0-9]+)/g, word => (
    /^\d+(?:st|nd|rd|th)$/i.test(word)
      ? word.replace(/(st|nd|rd|th)$/i, suffix => suffix.toLowerCase())
      : word.charAt(0).toUpperCase() + word.slice(1)
  ));
}

function extractAddressSection(text: string): string | null {
  const principal = /\baddress\s+of\s+principal\s+place\s+of\s+business\b/i.exec(text);
  const structured = /\b(?:building\s+no\.?\s*\/\s*flat\s+no\.?|name\s+of\s+premises\s*\/\s*building|locality\s*\/\s*sub\s*locality)\b/i.exec(text);
  if (!principal && !structured) return null;
  const additional = /\badditional\s+places?\s+of\s+business\b/i.exec(text);
  if (!principal && additional && structured && additional.index < structured.index) return null;
  const start = principal ? principal.index + principal[0].length : structured!.index;
  const remaining = text.slice(start);
  const boundary = ADDRESS_BOUNDARY.exec(remaining);
  return (boundary ? remaining.slice(0, boundary.index) : remaining).trim();
}

function parsePrincipalAddress(text: string): ParsedAddress {
  const section = extractAddressSection(text);
  if (!section) return { address: null, city: null, pincode: null, state: null };

  const matches: Array<{ index: number; end: number; key: string }> = [];
  for (const label of ADDRESS_LABELS) {
    label.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = label.pattern.exec(section))) {
      matches.push({ index: match.index, end: label.pattern.lastIndex, key: label.key });
    }
  }
  matches.sort((left, right) => left.index - right.index);
  const values: Record<string, string> = {};
  matches.forEach((match, index) => {
    const value = cleanText(section.slice(match.end, matches[index + 1]?.index ?? section.length));
    if (value && !values[match.key]) values[match.key] = value;
  });

  const explicitCity = values['city'] || null;
  const stateMatch = values['state']
    ? { name: titleCase(values['state']) }
    : findStateName(section);
  const pincode = values['pincode'] || [...section.matchAll(new RegExp(PIN_PATTERN.source, 'g'))].at(-1)?.[0] || null;
  const components = [values['building'], values['premises'], values['road'], values['landmark'], values['locality']].filter(Boolean);
  let addressBody = components.length
    ? components.join(', ')
    : section.replace(new RegExp(ADDRESS_LABELS.map(label => label.pattern.source).join('|'), 'ig'), ', ');
  let city = explicitCity ? cleanText(explicitCity) : null;

  if (!components.length) {
    if (pincode) addressBody = addressBody.replace(new RegExp(pincode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
    if (stateMatch) addressBody = addressBody.replace(new RegExp(stateMatch.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
    addressBody = cleanText(addressBody);
    const parts = addressBody.split(',').map(cleanText).filter(Boolean);
    if (!city && parts.length > 0) city = parts[parts.length - 1].match(/[A-Za-z]+\s*$/)?.[0]?.trim() || null;
    if (city) addressBody = addressBody.replace(new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), ' ');
  }

  const addressParts = [
    ...addressBody.split(',').map(cleanText).filter(Boolean),
    city,
    stateMatch?.name || null,
    pincode,
  ].filter((part): part is string => Boolean(part)).map(titleCaseAddress);
  return {
    address: cleanText(addressParts.join(', ')) || null,
    city: city ? titleCaseAddress(city) : null,
    pincode,
    state: stateMatch?.name || null,
  };
}

function findStateName(text: string): { name: string } | null {
  const escaped = KNOWN_STATES.map(state => state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const match = new RegExp(`(?:^|[,\\.\\s])(${escaped.join('|')})(?=$|[,\\.\\s])`, 'i').exec(text);
  if (!match) return null;
  return { name: KNOWN_STATES.find(state => state.toLowerCase() === match[1].toLowerCase()) || titleCase(match[1]) };
}

function isInvalidBusinessName(name: string | null | undefined): boolean {
  if (!name) return true;
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['na', 'nil', 'null', 'none', 'notapplicable'].includes(clean) || clean.length < 2;
}

function extractLegalName(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const labelPattern = /\b(?:1\s*[\.\)]\s*)?legal\s+name(?:\s+of\s+business)?\s*[:\-]?\s*/ig;
  const nextLabelPattern = /\b(?:\d+\s*[\.\)]\s*)?(?:trade\s+name|constitution\s+of\s+business|gstin(?:\s*\/?\s*uin)?|gst\s+identification\s+number|pan(?:\s+(?:number|no\.?))?|principal\s+place\s+of\s+business|address\s+of\s+(?:principal\s+place|business)|date\s+of\s+(?:liability|validity|issue|registration)|period\s+of\s+validity|type\s+of\s+registration|particulars\s+of\s+approving\s+authority|taxpayer\s+type|nature\s+of\s+business\s+activities|state\s+jurisdiction|centre\s+jurisdiction|center\s+jurisdiction|registration\s+certificate|status)\b/ig;
  for (const match of normalized.matchAll(labelPattern)) {
    const remaining = normalized.slice(match.index! + match[0].length);
    nextLabelPattern.lastIndex = 0;
    const nextLabel = nextLabelPattern.exec(remaining);
    const candidate = remaining.slice(0, nextLabel ? nextLabel.index : remaining.length)
      .replace(/\s*[|¦]\s*[^|¦]{0,12}$/, '')
      .replace(/\s*\d+\s*[\.\)]?\s*$/, '')
      .replace(/^[\s:;,\-|?]+|[\s:;,\-|?]+$/g, '')
      .trim();
    if (isInvalidBusinessName(candidate)) continue;
    if (candidate.length >= 2 && candidate.length <= 120 && (candidate.match(/[a-z]/ig) || []).length >= 2) {
      return candidate;
    }
  }
  return null;
}

function extractTradeName(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const labelPattern = /\b(?:2\s*[\.\)]\s*)?(?:trade|frade|tr[a4]de)\s+name(?:\s*[,;:]?\s*if\s+any\b|\s*\(\s*if\s+any\s*\))?\s*[:\-]?\s*/ig;
  const nextLabelPattern = /\b(?:\d+\s*[\.\)]\s*)?(?:legal\s+name(?:\s+of\s+business)?|constitution\s+of\s+business|gstin(?:\s*\/?\s*uin)?|gst\s+identification\s+number|pan(?:\s+(?:number|no\.?))?|principal\s+place\s+of\s+business|address\s+of\s+(?:principal\s+place|business)|date\s+of\s+(?:liability|validity|issue|registration)|period\s+of\s+validity|type\s+of\s+registration|particulars\s+of\s+approving\s+authority|taxpayer\s+type|nature\s+of\s+business\s+activities|state\s+jurisdiction|centre\s+jurisdiction|center\s+jurisdiction|registration\s+certificate|status)\b/ig;
  for (const match of normalized.matchAll(labelPattern)) {
    const remaining = normalized.slice(match.index! + match[0].length);
    nextLabelPattern.lastIndex = 0;
    const nextLabel = nextLabelPattern.exec(remaining);
    const candidate = remaining.slice(0, nextLabel ? nextLabel.index : remaining.length)
      .replace(/\s*[|¦]\s*[^|¦]{0,12}$/, '')
      .replace(/\s*\d+\s*[\.\)]?\s*$/, '')
      .replace(/^[\s:;,\-|?]+|[\s:;,\-|?]+$/g, '')
      .trim();
    if (isInvalidBusinessName(candidate)) continue;
    if (candidate.length >= 2 && candidate.length <= 120 && (candidate.match(/[a-z]/ig) || []).length >= 2) {
      return candidate;
    }
  }
  return null;
}

export function extractGstinDetailsFromText(text: string): ExtractedGstinDetails {
  const clean = text.toUpperCase().replace(/[\s:-]+/g, '');
  const direct = clean.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/);
  let gstin = direct?.[0] || null;
  if (!gstin) {
    for (const candidate of clean.matchAll(/(?=([A-Z0-9]{15}))/g)) {
      gstin = correctGstinCandidate(candidate[1]);
      if (gstin) break;
    }
  }
  const address = parsePrincipalAddress(text);
  const trade = extractTradeName(text);
  const legal = extractLegalName(text);
  const businessName = trade || legal || null;

  return {
    gstin,
    stateCode: gstin ? gstin.slice(0, 2) : null,
    tradeName: businessName,
    legalName: legal,
    businessName,
    ...address,
  };
}

async function prepareImageForOcr(file: File): Promise<File | HTMLCanvasElement> {
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(2.5, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not prepare the image for OCR.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const histogram = new Uint32Array(256);
    const { data } = image;
    const pixelCount = data.length / 4;
    for (let index = 0; index < data.length; index += 4) {
      histogram[Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114)]++;
    }
    let low = 0;
    let high = 255;
    let accumulated = 0;
    for (; low < 255; low++) {
      accumulated += histogram[low];
      if (accumulated >= pixelCount * 0.01) break;
    }
    accumulated = 0;
    for (; high > 0; high--) {
      accumulated += histogram[high];
      if (accumulated >= pixelCount * 0.03) break;
    }
    const contrast = 255 / Math.max(1, high - low);
    for (let index = 0; index < data.length; index += 4) {
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const enhanced = Math.max(0, Math.min(255, Math.round((gray - low) * contrast)));
      data[index] = enhanced;
      data[index + 1] = enhanced;
      data[index + 2] = enhanced;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function renderPdfPage(pdf: PdfDocument, pageNumber: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the PDF page for OCR.');
  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  return canvas;
}

@Injectable({ providedIn: 'root' })
export class PanOcrService {
  async extractGstinFromFile(file: File): Promise<ExtractedGstinDetails> {
    let details: ExtractedGstinDetails = {};
    const extension = file.name.split('.').pop()?.toLowerCase();
    const isPdf = file.type === 'application/pdf' || extension === 'pdf';
    let pdf: PdfDocument | null = null;
    let pageLimitExceeded = false;
    let text = '';

    if (isPdf) {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('assets/pdfjs-assets/pdf.worker.min.mjs', document.baseURI).href;
        pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise as PdfDocument;
        if (pdf.numPages > MAX_PDF_PAGES) {
          pageLimitExceeded = true;
          const oversizedPdf = pdf;
          pdf = null;
          await oversizedPdf.destroy();
        } else {
          const pages: string[] = [];
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            pages.push(content.items.map(item => item.str || '').filter(Boolean).join(' '));
            page.cleanup();
          }
          text = pages.join('\n');
          details = extractGstinDetailsFromText(text);
        }
      } catch (error) {
        console.warn('Client-side PDF text extraction failed; trying OCR:', error);
      }
    }
    if (pageLimitExceeded) throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page limit.`);

    if ((!isPdf || pdf) && (!details.gstin || !details.address || !(details.tradeName || details.legalName))) {
      let worker: OcrWorker | null = null;
      let imageCanvas: HTMLCanvasElement | null = null;
      let preparedImage: File | HTMLCanvasElement | null = null;
      try {
        const { createWorker } = await import('tesseract.js');
        worker = await createWorker('eng', 1, {
          workerPath: new URL('worker.min.js', TESSERACT_ASSET_BASE).href,
          corePath: TESSERACT_ASSET_BASE,
          langPath: TESSERACT_LANGUAGE_BASE,
          gzip: false,
          workerBlobURL: false,
        });
        await worker.setParameters({
          tessedit_pageseg_mode: '11' as Parameters<OcrWorker['setParameters']>[0]['tessedit_pageseg_mode'],
        });
        const pageCount = isPdf ? (pdf?.numPages || 0) : 1;
        const ocrPages: string[] = [];
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
          const source = isPdf
            ? await renderPdfPage(pdf!, pageNumber)
            : (preparedImage ||= await prepareImageForOcr(file));
          if (source instanceof HTMLCanvasElement && !isPdf) imageCanvas = source;
          const result = await worker.recognize(source);
          ocrPages.push(result.data.text);
          const ocrDetails = extractGstinDetailsFromText(ocrPages.join('\n'));
          if (isPdf && source instanceof HTMLCanvasElement) {
            source.width = 0;
            source.height = 0;
          }
          if ((details.gstin || ocrDetails.gstin) && (details.address || ocrDetails.address) && (details.tradeName || ocrDetails.tradeName || details.legalName || ocrDetails.legalName)) break;
        }
        const ocrDetails = extractGstinDetailsFromText(ocrPages.join('\n'));
        details = {
          gstin: details.gstin || ocrDetails.gstin,
          stateCode: details.stateCode || ocrDetails.stateCode,
          address: details.address || ocrDetails.address,
          city: details.city || ocrDetails.city,
          pincode: details.pincode || ocrDetails.pincode,
          state: details.state || ocrDetails.state,
          tradeName: details.tradeName || ocrDetails.tradeName,
          legalName: details.legalName || ocrDetails.legalName,
          businessName: details.businessName || ocrDetails.businessName || details.tradeName || ocrDetails.tradeName,
        };
      } catch (error) {
        console.warn('Client-side GSTIN OCR failed; trying the document API:', error);
      } finally {
        if (worker) await worker.terminate();
        if (imageCanvas) {
          imageCanvas.width = 0;
          imageCanvas.height = 0;
        }
      }
    }

    if (pdf) await pdf.destroy();
    return {
      ...details,
      stateName: details.state || getStateNameFromGstinCode(details.stateCode),
    };
  }
}
