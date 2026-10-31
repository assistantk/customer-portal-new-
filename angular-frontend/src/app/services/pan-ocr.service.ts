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
  { key: 'building', pattern: /Building\s+No\.?\s*\/\s*Flat\s+No\.?|Building\s+No\.?|Building\s+Number/ig },
  { key: 'floor', pattern: /Floor\s+No\.?|Floor\s+Number/ig },
  { key: 'flat', pattern: /Flat\s+No\.?|Flat\s+Number/ig },
  { key: 'premises', pattern: /Name\s+Of\s+Premises\s*\/\s*Building|Name\s+Of\s+Premises/ig },
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
  /** PAN extracted from an explicit PAN field in the certificate (preferred),
   *  or derived from GSTIN characters at positions 3-12 (0-based index 2-11).
   *  Null when a PAN vs GSTIN mismatch is detected.
   */
  pan?: string | null;
  /** Set to true when the explicitly printed PAN does not match the GSTIN-derived PAN. */
  panMismatch?: boolean;
  /** Set to true when the extracted company/trade name exceeds 40 characters.
   *  The raw (untruncated) name is still returned in businessName/tradeName.
   */
  companyNameTooLong?: boolean;
}

interface ParsedAddress {
  address: string | null;
  city: string | null;
  pincode: string | null;
  state: string | null;
}

interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  getViewport(options: { scale: number; rotation?: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
  cleanup(): void;
  rotate?: number;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

type OcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;

function correctGstinCandidate(candidate: string): string | null {
  let clean = candidate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Handle OCR artifact: extra 0 before O or extra character after Z (e.g. Z0O -> ZO)
  if (clean.length === 16 && /Z0[A-Z0-9]$/.test(clean)) {
    clean = clean.replace(/Z0([A-Z0-9])$/, 'Z$1');
  }
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

export function cleanAndShortenAddress(address: string | null | undefined, maxLength = 100): string {
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 100;
  if (!address?.trim() || limit === 0) return '';

  let normalized = address
    .replace(/\r\n?/g, '\n')
    .replace(/[|;]/g, ',')
    .replace(/\n+/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/[,;:]\s*[,;:]+/g, ',')
    .replace(/\.{2,}/g, '.')
    .replace(/\s*,\s*/g, ', ')
    .trim();

  const pinLabel = /\b(?:pin\s*code|pincode)\b\s*[:\-]?\s*([1-9]\d{5})\b/i.exec(normalized);
  const pinCandidates = [...normalized.matchAll(/\b[1-9]\d{5}\b/g)];
  const trailingPin = [...pinCandidates].reverse().find(match => (
    !normalized.slice(match.index! + match[0].length).replace(/[\s,.;:]+/g, '')
  ));
  const pin = pinLabel?.[1] || trailingPin?.[0] || '';
  const pinMatch = pinLabel || trailingPin;
  if (pinMatch) {
    normalized = `${normalized.slice(0, pinMatch.index)}${normalized.slice(pinMatch.index! + pinMatch[0].length)}`;
  }
  normalized = normalized.replace(/\b(?:pin\s*code|pincode)\b\s*[:\-]?/gi, '');

  const seen = new Set<string>();
  const segments = normalized.split(',').map(segment => {
    const withoutLabels = segment
      .replace(/^\s*(?:address|registered\s+office|location)\s*[:\-]?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const words: string[] = [];
    let previousWord = '';
    for (const word of withoutLabels.split(/\s+/)) {
      const key = word.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (key && key === previousWord) continue;
      words.push(word);
      previousWord = key;
    }
    const cleaned = words.join(' ').replace(/^[\s.,;:]+|[\s.,;:]+$/g, '').trim();
    const key = cleaned.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (!key || seen.has(key)) return '';
    seen.add(key);
    return cleaned;
  }).filter(Boolean);

  const needsShortening = [...segments, ...(pin ? [pin] : [])].join(', ').length > limit;
  const abbreviated = needsShortening
    ? segments.map(segment => segment
      .replace(/\bNEAR\b/gi, 'Nr')
      .replace(/\bOPPOSITE(?:\s+TO)?\b/gi, 'Opp')
      .replace(/\bROAD\b/gi, 'Rd')
      .replace(/\bSTREET\b/gi, 'St')
      .replace(/\bBUILDING\b/gi, 'Bldg')
      .replace(/\bFLOOR\b/gi, 'Flr')
      .trim())
    : [...segments];
  const isState = (segment: string) => KNOWN_STATES.some(state => state.toLowerCase() === segment.toLowerCase());
  const removalPriority = (segment: string): number => {
    if (/\b(?:near|nr|opposite|opp|behind)\b/i.test(segment)) return 0;
    if (isState(segment)) return 2;
    if (/\b(?:city|town|village|district)\b/i.test(segment)) return 3;
    if (/\b(?:road|rd|street|st|locality|sector|colony|area|nagar)\b/i.test(segment)) return 4;
    return 1;
  };
  const render = () => [...abbreviated, ...(pin ? [pin] : [])].join(', ');

  while (render().length > limit && abbreviated.length > 1) {
    let removeIndex = 1;
    for (let index = 2; index < abbreviated.length; index++) {
      const priority = removalPriority(abbreviated[index]);
      const currentPriority = removalPriority(abbreviated[removeIndex]);
      if (priority < currentPriority || (priority === currentPriority && index > removeIndex)) {
        removeIndex = index;
      }
    }
    abbreviated.splice(removeIndex, 1);
  }

  const result = render();
  if (result.length <= limit) return result;

  const pinSuffix = pin && pin.length < limit ? `, ${pin}` : '';
  const addressBudget = Math.max(0, limit - pinSuffix.length);
  const coreAddress = abbreviated[0] || '';
  const words: string[] = [];
  for (const word of coreAddress.split(/\s+/)) {
    const candidate = [...words, word].join(' ');
    if (candidate.length > addressBudget) break;
    words.push(word);
  }
  let shortened = words.join(' ');
  if (!shortened && coreAddress && addressBudget > 0) {
    shortened = coreAddress.slice(0, addressBudget);
  }
  return `${shortened}${pinSuffix}`.slice(0, limit).trim();
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
  const principal = /\b(?:address\s+of\s+principal\s+place\s+of\s+business|address\s+of\s+principal\s+place\s+of|principal\s+place\s+of\s+business)\b/i.exec(text);
  const structured = /\b(?:building\s+no\.?\s*\/\s*flat\s+no\.?|name\s+of\s+premises\s*\/\s*building|locality\s*\/\s*sub\s*locality)\b/i.exec(text);
  if (!principal && !structured) return null;
  const additional = /\badditional\s+places?\s+of\s+business\b/i.exec(text);
  if (!principal && additional && structured && additional.index < structured.index) return null;
  const start = principal ? principal.index + principal[0].length : structured!.index;
  const remaining = text.slice(start);
  const boundary = ADDRESS_BOUNDARY.exec(remaining);
  let section = (boundary ? remaining.slice(0, boundary.index) : remaining).trim();
  // Strip stray table-header labels like 'Business' or 'Address' at line start or before address
  section = section.replace(/(?:^|\n|\r)\s*(?:Business|Address|Principal)\s*[:\-]?\s*/gi, '\n');
  section = section.replace(/\bBusiness\s+(?=[A-Z0-9])/g, '');
  return section.trim();
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
    let value = cleanText(section.slice(match.end, matches[index + 1]?.index ?? section.length));
    value = value.replace(/\s*\b(?:Date|Type|Status|Constitution)\b.*$/i, '').trim();
    if (value && !values[match.key]) values[match.key] = value;
  });

  const explicitCity = values['city'] || null;
  const rawState = values['state'] ? values['state'].replace(/[^a-zA-Z ]/g, '').trim() : '';
  let explicitState: string | null = null;
  if (rawState) {
    const matched = KNOWN_STATES.find(s => s.toLowerCase() === rawState.toLowerCase());
    explicitState = matched || titleCase(rawState);
  }
  const stateMatch = explicitState ? { name: explicitState } : (values['state'] ? findStateName(values['state']) : findStateName(section));
  const pincode = values['pincode']?.match(PIN_PATTERN)?.[0] || [...section.matchAll(new RegExp(PIN_PATTERN.source, 'g'))].at(-1)?.[0] || null;
  const components = [values['building'], values['flat'], values['floor'], values['premises'], values['road'], values['landmark'], values['locality']].filter(Boolean);
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
    address: cleanAndShortenAddress(addressParts.join(', ')) || null,
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
  return [
    'na', 'nil', 'null', 'none', 'notapplicable', 'notavailable', 'n/a',
    'governmentofindia', 'registrationcertificate'
  ].includes(clean) || clean.length < 2;
}

function trimUnrelatedBusinessValue(value: string): string {
  return value
    .replace(/\s*[|¦]\s*[^|¦]{0,12}$/, '')
    .replace(/\b(?:null|n\/a|na|not\s+applicable|not\s+available)\b/gi, '')
    .replace(/\b(?:additional\s+trade\s+names?(?:\s*,\s*if\s+any)?|trade\s+name(?:\s*,\s*if\s+any)?|legal\s+name(?:\s+of\s+business)?|constitution\s+of\s+business|gstin(?:\s*\/\?\s*uin)?|gst\s+identification\s+number|pan(?:\s+(?:number|no\.?))?|principal\s+place\s+of\s+business|address\s+of\s+(?:principal\s+place|business)|date\s+of\s+(?:liability|validity|issue|registration)|period\s+of\s+validity|type\s+of\s+registration|particulars\s+of\s+approving\s+authority|taxpayer\s+type|nature\s+of\s+business\s+activities|state\s+jurisdiction|centre\s+jurisdiction|center\s+jurisdiction|registration\s+certificate|government\s+of\s+india|status)\b.*$/gi, '')
    .replace(/\s*\d+\s*[\.\)\(\{\}\[\]:\-\s]*$/g, '')
    .replace(/^[\d\s\.\)\(\{\}\[\]:\-]+/g, '')
    .replace(/^(?:government\s+of\s+india|registration\s+certificate)\s*[:\-]?\s*/gi, '')
    .replace(/^[\s:;,\-|?{}()\[\]]+|[\s:;,\-|?{}()\[\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFieldValue(text: string, labelPattern: RegExp, nextFieldPattern: RegExp): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const matches = [...normalized.matchAll(labelPattern)];
  for (const match of matches) {
    const start = match.index! + match[0].length;
    const remaining = normalized.slice(start);
    const boundaryIndex = remaining.search(nextFieldPattern);
    const candidate = trimUnrelatedBusinessValue(remaining.slice(0, boundaryIndex >= 0 ? boundaryIndex : remaining.length));
    if (isInvalidBusinessName(candidate)) continue;
    if (candidate.length >= 2 && candidate.length <= 120 && (candidate.match(/[a-z]/ig) || []).length >= 2) {
      return candidate;
    }
  }
  return null;
}

function extractLegalName(text: string): string | null {
  const labelPattern = /\b(?:\d+\s*[\.\)\(\{\}\[\]]*\s*)?(?:legal|regal|1egal|iegal|leal)\s+name(?:\s+of\s+business)?\s*[:\-]?\s*/ig;
  const nextFieldPattern = /(?:^|\b)(?:\d+\s*[\.\)\(\{\}\[\]]*\s*)?(?:additional\s+trade\s+names?|trade\s+name(?:\s*,\s*if\s+any)?|constitution\s+of\s+business|gstin(?:\s*\/\?\s*uin)?|gst\s+identification\s+number|pan(?:\s+(?:number|no\.?))?|principal\s+place\s+of\s+business|address\s+of\s+(?:principal\s+place|business)|date\s+of\s+(?:liability|validity|issue|registration)|period\s+of\s+validity|type\s+of\s+registration|particulars\s+of\s+approving\s+authority|taxpayer\s+type|nature\s+of\s+business\s+activities|state\s+jurisdiction|centre\s+jurisdiction|center\s+jurisdiction|registration\s+certificate|status)\b/i;
  return extractFieldValue(text, labelPattern, nextFieldPattern);
}

function extractTradeName(text: string): string | null {
  const labelPattern = /\b(?:\d+\s*[\.\)\(\{\}\[\]]*\s*)?(?:trade|frade|tr[a4]de)\s+name(?:\s*[,;:]?\s*if\s+any\b|\s*\(\s*if\s+any\s*\))?\s*[:\-]?\s*/ig;
  const nextFieldPattern = /(?:^|\b)(?:\d+\s*[\.\)\(\{\}\[\]]*\s*)?(?:additional\s+trade\s+names?|legal\s+name(?:\s+of\s+business)?|constitution\s+of\s+business|gstin(?:\s*\/\?\s*uin)?|gst\s+identification\s+number|pan(?:\s+(?:number|no\.?))?|principal\s+place\s+of\s+business|address\s+of\s+(?:principal\s+place|business)|date\s+of\s+(?:liability|validity|issue|registration)|period\s+of\s+validity|type\s+of\s+registration|particulars\s+of\s+approving\s+authority|taxpayer\s+type|nature\s+of\s+business\s+activities|state\s+jurisdiction|centre\s+jurisdiction|center\s+jurisdiction|registration\s+certificate|status)\b/i;
  return extractFieldValue(text, labelPattern, nextFieldPattern);
}

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function extractExplicitPan(text: string): string | null {
  const labelPattern = /\b(?:permanent\s+account\s+number|pan(?:\s+(?:number|no\.?))?)\s*[:\-]?\s*/ig;
  const normalized = text.replace(/\s+/g, ' ').trim();
  const matches = [...normalized.matchAll(labelPattern)];
  for (const match of matches) {
    const start = match.index! + match[0].length;
    const candidate = normalized.slice(start, start + 20).replace(/\s+/g, '').toUpperCase();
    const pan = candidate.match(/[A-Z]{5}[0-9]{4}[A-Z]/)?.[0] || null;
    if (pan && PAN_REGEX.test(pan)) return pan;
  }
  return null;
}

export function extractGstin(text: string): string | null {
  const clean = text.toUpperCase().replace(/[\s:-]+/g, '');
  const direct = clean.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/);
  if (direct) {
    if (direct[0].endsWith('Z0') && clean.includes(direct[0] + 'O')) {
      return direct[0].slice(0, 14) + 'O';
    }
    return direct[0];
  }
  const withNoise = clean.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z0[0-9A-Z]/);
  if (withNoise) {
    const corrected = correctGstinCandidate(withNoise[0]);
    if (corrected) return corrected;
  }
  for (const candidate of clean.matchAll(/(?=([A-Z0-9]{15,16}))/g)) {
    const corrected = correctGstinCandidate(candidate[1]);
    if (corrected) return corrected;
  }
  return null;
}

export function classifyPage(text: string): { type: 'reg06' | 'annexure_a' | 'annexure_b' | 'other' | 'unknown'; score: number } {
  const t = text.toLowerCase();
  if (t.includes('appointment letter') || t.includes('authorized h & t') || t.includes('contractor at') || t.includes('matix')) {
    return { type: 'other', score: -10 };
  }
  let regScore = 0;
  if (/form\s+gst\s+reg-06|reg-06/i.test(t)) regScore += 5;
  if (/registration\s+certificate/i.test(t)) regScore += 4;
  if (/principal\s+place\s+of\s+business/i.test(t)) regScore += 3;
  if (/date\s+of\s+liability/i.test(t)) regScore += 2;
  if (/type\s+of\s+registration/i.test(t)) regScore += 2;

  let annAScore = 0;
  if (/annexure\s*[-]?\s*a\b/i.test(t)) annAScore += 5;
  if (/additional\s+place/i.test(t)) annAScore += 3;

  let annBScore = 0;
  if (/annexure\s*[-]?\s*b\b/i.test(t)) annBScore += 5;
  if (/proprietor|managing\s*\/\s*whole-time/i.test(t)) annBScore += 3;

  if (regScore > annAScore && regScore > annBScore && regScore >= 4) return { type: 'reg06', score: regScore };
  if (annAScore > annBScore && annAScore >= 4) return { type: 'annexure_a', score: annAScore };
  if (annBScore >= 4) return { type: 'annexure_b', score: annBScore };
  return { type: 'unknown', score: 0 };
}

export function combineMultiPageDetails(pages: Array<{ text: string; pageNumber: number }>): ExtractedGstinDetails {
  if (pages.length === 0) return {};
  if (pages.length === 1) return extractGstinDetailsFromText(pages[0].text);

  const analyzed = pages.map(p => ({
    ...p,
    classification: classifyPage(p.text),
  }));

  const reg06 = analyzed.find(p => p.classification.type === 'reg06')
    || analyzed.find(p => p.classification.type !== 'other')
    || analyzed[0];
  const validPages = analyzed.filter(p => p.classification.type !== 'other');

  // Extract address, city, and PIN code strictly from reg06 page
  const addressDetails = parsePrincipalAddress(reg06.text);

  let tradeName = extractTradeName(reg06.text);
  let legalName = extractLegalName(reg06.text);
  for (const p of validPages) {
    if (!tradeName) tradeName = extractTradeName(p.text);
    if (!legalName) legalName = extractLegalName(p.text);
  }
  const businessName = tradeName || legalName || null;

  let gstin = extractGstin(reg06.text);
  if (!gstin) {
    for (const p of validPages) {
      gstin = extractGstin(p.text);
      if (gstin) break;
    }
  }

  const explicitPan = extractExplicitPan(reg06.text) || validPages.map(p => extractExplicitPan(p.text)).find(Boolean) || null;
  const gstinDerivedPan = gstin && gstin.length === 15 ? gstin.slice(2, 12) : null;
  let pan: string | null = null;
  let panMismatch = false;
  if (explicitPan && gstinDerivedPan) {
    if (explicitPan === gstinDerivedPan) {
      pan = explicitPan;
    } else {
      panMismatch = true;
      pan = explicitPan;
    }
  } else if (explicitPan) {
    pan = explicitPan;
  } else if (gstinDerivedPan && PAN_REGEX.test(gstinDerivedPan)) {
    pan = gstinDerivedPan;
  }

  const companyNameTooLong = Boolean(businessName && businessName.length > 40);

  return {
    gstin,
    stateCode: gstin ? gstin.slice(0, 2) : null,
    tradeName: tradeName || legalName,
    legalName,
    businessName,
    pan,
    panMismatch,
    companyNameTooLong,
    ...addressDetails,
  };
}

export function extractGstinDetailsFromText(text: string): ExtractedGstinDetails {
  const gstin = extractGstin(text);
  const address = parsePrincipalAddress(text);
  const legal = extractLegalName(text);
  const trade = extractTradeName(text);
  const businessName = trade || legal || null;
  const tradeName = trade || legal || null;

  const explicitPan = extractExplicitPan(text);
  const gstinDerivedPan = gstin && gstin.length === 15 ? gstin.slice(2, 12) : null;
  let pan: string | null = null;
  let panMismatch = false;
  if (explicitPan && gstinDerivedPan) {
    if (explicitPan === gstinDerivedPan) {
      pan = explicitPan;
    } else {
      panMismatch = true;
      pan = explicitPan;
    }
  } else if (explicitPan) {
    pan = explicitPan;
  } else if (gstinDerivedPan && PAN_REGEX.test(gstinDerivedPan)) {
    pan = gstinDerivedPan;
  }

  const companyNameTooLong = Boolean(businessName && businessName.length > 40);

  return {
    gstin,
    stateCode: gstin ? gstin.slice(0, 2) : null,
    tradeName,
    legalName: legal,
    businessName,
    pan,
    panMismatch,
    companyNameTooLong,
    ...address,
  };
}

function preprocessCanvasForOcr(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const pixelCount = data.length / 4;
  const histogram = new Uint32Array(256);

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
    histogram[gray]++;
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
  const threshold = (low + high) / 2;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index];
    const enhanced = Math.max(0, Math.min(255, Math.round((gray - low) * contrast)));
    const sharpened = enhanced < threshold * 0.85
      ? Math.round(enhanced * 0.8)
      : enhanced > threshold * 1.15
        ? Math.min(255, Math.round(enhanced * 1.15))
        : enhanced;
    data[index] = sharpened;
    data[index + 1] = sharpened;
    data[index + 2] = sharpened;
  }
  context.putImageData(image, 0, 0);
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
    preprocessCanvasForOcr(canvas);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function renderPdfPage(pdf: PdfDocument, pageNumber: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const rawViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(4.0, Math.max(3.2, 2200 / Math.max(rawViewport.width, 1)));
  const rotation = ((page as any).rotate || 0);
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not prepare the PDF page for OCR.');
  await page.render({ canvasContext: context, viewport }).promise;
  preprocessCanvasForOcr(canvas);
  page.cleanup();
  return canvas;
}

@Injectable({ providedIn: 'root' })
export class PanOcrService {
  async extractGstinFromFile(file: File | Blob | string | null | undefined): Promise<ExtractedGstinDetails> {
    if (!file) {
      return {};
    }

    if (typeof file === 'string') {
      const trimmed = file.trim();
      if (/^[a-zA-Z]:\\/.test(trimmed) || /^file:\/\//i.test(trimmed)) {
        throw new Error('OCR cannot read a local filesystem path directly. Please upload the PDF using the browser file selector instead of passing a path like C:\\Users\\...\\file.pdf.');
      }
      if (/^https?:\/\//i.test(trimmed)) {
        const response = await fetch(trimmed);
        if (!response.ok) {
          throw new Error(`Could not fetch the document (${response.status}). Please upload the PDF manually.`);
        }
        const blob = await response.blob();
        return this.extractGstinFromFile(new File([blob], trimmed.split(/[\\/]/).pop() || 'document.pdf', { type: blob.type || 'application/pdf' }));
      }
      throw new Error('OCR requires a browser File or Blob object. Please upload the document from the file picker instead of passing a raw filesystem path.');
    }

    const browserFile = file instanceof File ? file : new File([file], 'document.pdf', { type: file.type || 'application/pdf' });
    const extension = browserFile.name.split('.').pop()?.toLowerCase();
    const isPdf = browserFile.type === 'application/pdf' || extension === 'pdf';
    let pdf: PdfDocument | null = null;
    let pageLimitExceeded = false;
    const pageRecords: Array<{ pageNumber: number; text: string; isScanned: boolean }> = [];

    if (isPdf) {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('assets/pdfjs-assets/pdf.worker.min.mjs', document.baseURI).href;
        pdf = await pdfjsLib.getDocument({ data: await browserFile.arrayBuffer() }).promise as PdfDocument;
        if (pdf.numPages > MAX_PDF_PAGES) {
          pageLimitExceeded = true;
          const oversizedPdf = pdf;
          pdf = null;
          await oversizedPdf.destroy();
        } else {
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            const digitalText = content.items.map(item => item.str || '').filter(Boolean).join(' ').trim();
            page.cleanup();
            const isScanned = digitalText.length < 50;
            pageRecords.push({ pageNumber, text: digitalText, isScanned });
          }
        }
      } catch (error) {
        console.warn('Client-side PDF text extraction failed; trying OCR:', error);
      }
    }
    if (pageLimitExceeded) throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page limit.`);

    let details: ExtractedGstinDetails = {};
    if (pageRecords.length > 0) {
      details = combineMultiPageDetails(pageRecords);
    }

    const needsOcr = !isPdf || pageRecords.some(p => p.isScanned) || !details.gstin || !details.address || !(details.tradeName || details.legalName);

    if (needsOcr && (!isPdf || pdf)) {
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
          tessedit_pageseg_mode: '3' as Parameters<OcrWorker['setParameters']>[0]['tessedit_pageseg_mode'],
        });

        const pageCount = isPdf ? (pdf?.numPages || 0) : 1;
        const ocrRecords: Array<{ pageNumber: number; text: string }> = [];

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
          const existing = pageRecords[pageNumber - 1];
          if (existing && !existing.isScanned && existing.text.length > 100) {
            ocrRecords.push({ pageNumber, text: existing.text });
            continue;
          }

          const source = isPdf
            ? await renderPdfPage(pdf!, pageNumber)
            : (preparedImage ||= await prepareImageForOcr(browserFile));
          if (source instanceof HTMLCanvasElement && !isPdf) imageCanvas = source;

          const result = await worker.recognize(source);
          ocrRecords.push({ pageNumber, text: result.data.text });

          if (isPdf && source instanceof HTMLCanvasElement) {
            source.width = 0;
            source.height = 0;
          }
        }

        const ocrCombined = combineMultiPageDetails(ocrRecords);
        details = {
          gstin: details.gstin || ocrCombined.gstin,
          stateCode: details.stateCode || ocrCombined.stateCode,
          address: details.address || ocrCombined.address,
          city: details.city || ocrCombined.city,
          pincode: details.pincode || ocrCombined.pincode,
          state: details.state || ocrCombined.state,
          tradeName: details.tradeName || ocrCombined.tradeName,
          legalName: details.legalName || ocrCombined.legalName,
          businessName: details.businessName || ocrCombined.businessName || details.tradeName || ocrCombined.tradeName,
          pan: details.pan || ocrCombined.pan,
          panMismatch: details.panMismatch ?? ocrCombined.panMismatch,
          companyNameTooLong: details.companyNameTooLong ?? ocrCombined.companyNameTooLong,
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
