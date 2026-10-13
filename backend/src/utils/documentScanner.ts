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
  city: string | null;
  pincode: string | null;
  legalName: string | null;
  stateCode: string | null;
  state: string | null;
  confidence: number;
  text: string;
}

const PAN_PATTERN = /[A-Z0-9]{10}/gi;
const GSTIN_PATTERN = /[A-Z0-9]{15}/gi;
const PIN_PATTERN = /\b[1-9][0-9]{5}\b/g;
const ADDRESS_FIELDS = [
  { label: 'Building No./Flat No.', pattern: /Building\s+No\.?\s*\/\s*Flat\s+No\.?/i },
  { label: 'Name Of Premises/Building', pattern: /Name\s+Of\s+Premises\s*\/\s*Building/i },
  { label: 'Road/Street', pattern: /Road\s*\/\s*Street/i },
  { label: 'Nearby Landmark', pattern: /Nearby\s+Landmark/i },
  { label: 'Locality/Sub Locality', pattern: /Locality\s*\/\s*Sub\s*Locality/i },
  { label: 'City/Town/Village', pattern: /City\s*\/\s*Town\s*\/\s*Village/i },
  { label: 'District', pattern: /\bDistrict\b/i },
  { label: 'State', pattern: /\bState\b/i },
  { label: 'PIN Code', pattern: /\bPIN\s*Code\b|\bPincode\b/i },
];
const ADDRESS_BOUNDARY = /\b(?:date\s+of\s+liabil\w{2,}|date\s+of\s+valid\w{2,}|type\s+of\s+registration|status\s+of\s+registration|registration\s+status|additional\s+places?\s+of\s+business|details?\s+of\s+additional\s+places?\s+of\s+business)\b|\b\d{1,2}\s*[.)]?\s*(?=(?:date|type|status|principal|additional|nature|constitution)\b)/i;

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

const titleCase = (value: string): string => value.toLowerCase().replace(/\b[a-z]/g, character => character.toUpperCase());

const titleCaseAddress = (value: string): string => value.toLowerCase().replace(/\b([a-z0-9]+)/g, word => (
  /^\d+(?:st|nd|rd|th)$/i.test(word)
    ? word.replace(/(st|nd|rd|th)$/i, suffix => suffix.toLowerCase())
    : word.charAt(0).toUpperCase() + word.slice(1)
));

const editDistanceAtMostOne = (left: string, right: string): boolean => {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex++;
      rightIndex++;
      continue;
    }
    if (++differences > 1) return false;
    if (left.length > right.length) leftIndex++;
    else if (right.length > left.length) rightIndex++;
    else {
      leftIndex++;
      rightIndex++;
    }
  }
  return differences + (leftIndex < left.length || rightIndex < right.length ? 1 : 0) <= 1;
};

const collapseRepeatedCity = (address: string, preferredCity: string | null): { address: string; city: string | null } => {
  const words = address.match(/[A-Za-z]+/g) || [];
  let city = preferredCity;
  if (!city) {
    const groups: Array<{ value: string; count: number; variants: Map<string, number>; indices: number[] }> = [];
    words.forEach((word, index) => {
      if (word.length < 5) return;
      const group = groups.find(candidate => editDistanceAtMostOne(candidate.value.toLowerCase(), word.toLowerCase()));
      if (group) {
        group.count++;
        group.variants.set(word, (group.variants.get(word) || 0) + 1);
        group.indices.push(index);
        if (word.length > group.value.length) group.value = word;
      } else {
        groups.push({ value: word, count: 1, variants: new Map([[word, 1]]), indices: [index] });
      }
    });
    const repeatedCity = groups
      .map(group => ({
        ...group,
        closeCount: Math.max(...group.indices.map((start, index) => (
          group.indices.slice(index).filter(position => position - start <= 2).length
        ))),
      }))
      .filter(group => group.closeCount > 1)
      .sort((left, right) => right.closeCount - left.closeCount || right.count - left.count)[0];
    city = repeatedCity
      ? [...repeatedCity.variants].sort((left, right) => right[1] - left[1])[0][0]
      : null;
  }
  if (!city) return { address, city: null };

  const aliases = [...new Set(words.filter(word =>
    word.length >= 5 && editDistanceAtMostOne(word.toLowerCase(), city!.toLowerCase())
  ))];
  const alternatives = [city, ...aliases]
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(`\\b(?:${alternatives})\\b`, 'ig');
  return { address: address.replace(pattern, ' '), city };
};

const cleanAddressText = (value: string): string => value
  .replace(/[|]/g, 'I')
  .replace(/\s+/g, ' ')
  .replace(/\s*,\s*/g, ', ')
  .replace(/(?:,\s*){2,}/g, ', ')
  .replace(/[,;]\s*\./g, ',')
  .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
  .trim();

const getPrincipalAddressSection = (text: string): string | null => {
  const principal = /\baddress\s+of\s+principal\s+place\s+of\s+business\b/i.exec(text);
  const structuredLabel = /\b(?:building\s+no\.?\s*\/\s*flat\s+no\.?|name\s+of\s+premises\s*\/\s*building|locality\s*\/\s*sub\s*locality)\b/i.exec(text);
  const start = principal
    ? principal.index + principal[0].length
    : structuredLabel?.index;
  if (start === undefined) return null;
  if (!principal) {
    const additional = /\badditional\s+places?\s+of\s+business\b/i.exec(text);
    if (additional && structuredLabel && additional.index < structuredLabel.index) return null;
  }

  const remainder = text.slice(start);
  const boundary = ADDRESS_BOUNDARY.exec(remainder);
  return (boundary ? remainder.slice(0, boundary.index) : remainder).trim();
};

const getAddressFieldValues = (section: string): Record<string, string> => {
  const matches: Array<{ index: number; end: number; label: string }> = [];
  for (const field of ADDRESS_FIELDS) {
    const match = field.pattern.exec(section);
    if (match) matches.push({ index: match.index, end: match.index + match[0].length, label: field.label });
  }
  matches.sort((left, right) => left.index - right.index);

  const values: Record<string, string> = {};
  matches.forEach((match, index) => {
    const next = matches[index + 1];
    const value = cleanAddressText(section.slice(match.end, next?.index ?? section.length));
    if (value) values[match.label] = value;
  });
  return values;
};

const getStateFromAddress = (value: string): string | null => {
  const states = [...new Set(Array.from({ length: 38 }, (_, index) => getStateNameFromCode(String(index + 1).padStart(2, '0'))).filter((state): state is string => Boolean(state)))]
    .sort((left, right) => right.length - left.length);
  const statePattern = new RegExp(`(?:^|[,\\.\\s])(${states.map(state => state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[,\\.\\s])`, 'i');
  const match = statePattern.exec(value);
  return match ? states.find(state => state.toLowerCase() === match[1].toLowerCase()) || titleCase(match[1]) : null;
};

export const extractStructuredAddress = (text: string) => {
  const section = getPrincipalAddressSection(text);
  if (!section) return { address: null, city: null, pincode: null, state: null };

  const fields = getAddressFieldValues(section);
  const explicitCity = fields['City/Town/Village'] || null;
  const state = fields.State ? titleCase(fields.State) : getStateFromAddress(section);
  const pinMatches = [...section.matchAll(new RegExp(PIN_PATTERN.source, 'g'))];
  const pincode = fields['PIN Code'] || pinMatches.at(-1)?.[0] || null;
  const components = [
    fields['Building No./Flat No.'],
    fields['Name Of Premises/Building'],
    fields['Road/Street'],
    fields['Nearby Landmark'],
    fields['Locality/Sub Locality'],
  ].filter((part): part is string => Boolean(part));

  let addressBody = components.length
    ? components.join(', ')
    : section.replace(new RegExp(ADDRESS_FIELDS.map(field => field.pattern.source).join('|'), 'ig'), ', ');

  if (!components.length) {
    if (pincode) addressBody = addressBody.replace(new RegExp(pincode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
    if (state) addressBody = addressBody.replace(new RegExp(state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
    addressBody = cleanAddressText(addressBody);
  }

  let city = explicitCity ? cleanAddressText(explicitCity) : null;
  if (!components.length) {
    addressBody = addressBody
      .replace(/\bF['’]?(?:L|1)oor\b/gi, 'Floor')
      .replace(/\b(?:ist|1st)\s+floor\b/gi, '1st Floor')
      .replace(/([a-z])road\b/gi, '$1 Road')
      .replace(/([a-z])street\b/gi, '$1 Street')
      .replace(/[,;]\s*\d{1,2}\s*$/, '')
      .replace(/\b(road|rd|street|lane|marg|highway)\s+(?=[A-Za-z0-9])/gi, '$1, ');
    const collapsed = collapseRepeatedCity(addressBody, city);
    addressBody = collapsed.address;
    city = collapsed.city;
    if (!city) {
      const lastPart = addressBody.split(',').map(cleanAddressText).filter(Boolean).at(-1) || '';
      city = lastPart.match(/[A-Za-z]+\s*$/)?.[0]?.trim() || null;
      if (city) addressBody = collapseRepeatedCity(addressBody, city).address;
    }
  }

  const address = cleanAddressText([
    ...addressBody.split(',').map(cleanAddressText).filter(Boolean),
    city,
    state,
    pincode,
  ].filter((part): part is string => Boolean(part)).map(titleCaseAddress).join(', '));
  return { address: address || null, city: city ? titleCaseAddress(city) : null, pincode: pincode || null, state: state || null };
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
  let fallbackText = '';
  let confidence = 0.95;

  // Check magic bytes to determine if PDF or Image
  const isPdf = buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF

  if (isPdf) {
    let parser: PDFParse | undefined;
    try {
      parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      text = parsed.text || '';
      confidence = 0.98;
    } catch {
      text = '';
    } finally {
      if (parser) await parser.destroy();
    }
    const parsedGstin = kind === 'gstin' ? findGstin(text) : null;
    const parsedAddress = kind === 'gstin' ? extractStructuredAddress(text).address : null;
    if (!text.trim() || (kind === 'gstin' && (!parsedGstin || !parsedAddress))) {
      const res = await ocrPdf(buffer);
      fallbackText = res.text;
      if (!text.trim()) text = fallbackText;
      confidence = text === fallbackText ? res.confidence : Math.min(confidence, res.confidence);
    }
  } else {
    // Image file (JPG/JPEG/PNG)
    const res = await ocrImage(buffer);
    text = res.text;
    confidence = res.confidence;
  }

  const compact = normalizeText(text);
  const pan = kind === 'pan' ? findPan(compact) : null;
  const gstin = kind === 'gstin' ? findGstin(text) || findGstin(fallbackText) : null;

  const structured = kind === 'gstin' ? extractStructuredAddress(text) : { address: null, city: null, pincode: null, state: null };
  const fallbackStructured = kind === 'gstin' && fallbackText ? extractStructuredAddress(fallbackText) : { address: null, city: null, pincode: null, state: null };
  const address = structured.address || fallbackStructured.address;
  const pincode = structured.pincode || fallbackStructured.pincode || (address ? address.match(PIN_PATTERN)?.[0] || null : null);
  const city = structured.city || fallbackStructured.city;
  
  const legalName = kind === 'gstin' ? labelledValue(text, ['legal name', 'trade name']) : null;
  const stateCode = gstin ? gstin.slice(0, 2) : null;
  const state = structured.state || fallbackStructured.state || (stateCode ? getStateNameFromCode(stateCode) : null);

  return { pan, gstin, address, city, pincode, legalName, stateCode, state, confidence, text: compact };
}