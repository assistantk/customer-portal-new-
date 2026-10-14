import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
const TESSERACT_ASSET_BASE = new URL(`${import.meta.env.BASE_URL}tesseract-assets/`, window.location.origin).href;

const GSTIN_REGEX = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/;
const PIN_PATTERN = /\b[1-9][0-9]{5}\b/;
const MAX_PDF_PAGES = Number(import.meta.env.VITE_GSTIN_MAX_PDF_PAGES) || 50;
const ADDRESS_FIELDS = [
    { label: 'Building No./Flat No.', pattern: /Building\s+No\.?\s*\/\s*Flat\s+No\.?/ig },
    { label: 'Name Of Premises/Building', pattern: /Name\s+Of\s+Premises\s*\/\s*Building/ig },
    { label: 'Road/Street', pattern: /Road\s*\/\s*Street/ig },
    { label: 'Nearby Landmark', pattern: /Nearby\s+Landmark/ig },
    { label: 'Locality/Sub Locality', pattern: /Locality\s*\/\s*Sub\s*Locality/ig },
    { label: 'City/Town/Village', pattern: /City\s*\/\s*Town\s*\/\s*Village/ig },
    { label: 'District', pattern: /\bDistrict\b/ig },
    { label: 'State', pattern: /\bState\b/ig },
    { label: 'PIN Code', pattern: /\bPIN\s*Code\b|\bPincode\b/ig },
];
const ADDRESS_BOUNDARY = /\b(?:date\s+of\s+liabil\w{2,}|date\s+of\s+valid\w{2,}|type\s+of\s+registration|status\s+of\s+registration|registration\s+status|additional\s+places?\s+of\s+business|details?\s+of\s+additional\s+places?\s+of\s+business)\b|\b\d{1,2}\s*[.)]?\s*(?=(?:date|type|status|principal|additional|nature|constitution)\b)/i;

export const STATE_CODE_MAP = {
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

const knownStates = [...new Set(Object.values(STATE_CODE_MAP))].sort((a, b) => b.length - a.length);

export function getStateNameFromGstinCode(code) {
    if (!code) return null;
    const clean = String(code).padStart(2, '0');
    return STATE_CODE_MAP[clean] || null;
}

const digitToLetter = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' };
const letterToDigit = { 'O': '0', 'Q': '0', 'D': '0', 'I': '1', 'L': '1', 'Z': '2', 'S': '5', 'G': '6', 'B': '8' };

export function correctGstinCandidate(candidate) {
    if (!candidate) return null;
    const clean = candidate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 15) return null;
    const chars = clean.split('');
    for (let i = 0; i < 2; i++) {
        if (/[A-Z]/.test(chars[i])) chars[i] = letterToDigit[chars[i]] || chars[i];
    }
    for (let i = 2; i < 7; i++) {
        if (/\d/.test(chars[i])) chars[i] = digitToLetter[chars[i]] || chars[i];
    }
    for (let i = 7; i < 11; i++) {
        if (/[A-Z]/.test(chars[i])) chars[i] = letterToDigit[chars[i]] || chars[i];
    }
    if (/\d/.test(chars[11])) chars[11] = digitToLetter[chars[11]] || chars[11];
    if (chars[13] !== 'Z' && ['2', '7', 'S'].includes(chars[13])) chars[13] = 'Z';
    const res = chars.join('');
    return GSTIN_REGEX.test(res) ? res : null;
}

async function renderPdfPageToCanvas(pdf, pageNumber = 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.5 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    return canvas;
}

async function prepareImageForOcr(file) {
    if (typeof createImageBitmap !== 'function') return file;
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
        const scale = Math.min(2.5, 2200 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
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

async function callBackendOcrApi(endpoint, file) {
    try {
        const formData = new FormData();
        formData.append('document', file);
        const res = await fetch(`/api/documents/${endpoint}`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data;
    } catch {
        return null;
    }
}

const titleCase = value => value.toLowerCase().replace(/\b[a-z]/g, character => character.toUpperCase());

const titleCaseAddress = value => value.toLowerCase().replace(/\b([a-z0-9]+)/g, word => (
    /^\d+(?:st|nd|rd|th)$/i.test(word)
        ? word.replace(/(st|nd|rd|th)$/i, suffix => suffix.toLowerCase())
        : word.charAt(0).toUpperCase() + word.slice(1)
));

function editDistanceAtMostOne(left, right) {
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
}

function collapseRepeatedCity(address, preferredCity) {
    const words = address.match(/[A-Za-z]+/g) || [];
    let city = preferredCity;
    if (!city) {
        const groups = [];
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
        word.length >= 5 && editDistanceAtMostOne(word.toLowerCase(), city.toLowerCase())
    ))];
    const alternatives = [city, ...aliases]
        .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const pattern = new RegExp(`\\b(?:${alternatives})\\b`, 'ig');
    return { address: address.replace(pattern, ' '), city };
}

function cleanAddressText(value) {
    return value
        .replace(/[|]/g, 'I')
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/(?:,\s*){2,}/g, ', ')
        .replace(/[,;]\s*\./g, ',')
        .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '')
        .trim();
}

function getAddressSection(text) {
    const principalPattern = /\baddress\s+of\s+principal\s+place\s+of\s+business\b/i;
    const principal = principalPattern.exec(text);
    let start;
    if (principal) {
        start = principal.index + principal[0].length;
    } else {
        const structuredLabel = /\b(?:building\s+no\.?\s*\/\s*flat\s+no\.?|name\s+of\s+premises\s*\/\s*building|locality\s*\/\s*sub\s*locality)\b/i.exec(text);
        if (!structuredLabel) return null;
        const additional = /\badditional\s+places?\s+of\s+business\b/i.exec(text);
        if (additional && additional.index < structuredLabel.index) return null;
        start = structuredLabel.index;
    }

    const remainder = text.slice(start);
    const boundary = ADDRESS_BOUNDARY.exec(remainder);
    return (boundary ? remainder.slice(0, boundary.index) : remainder).trim();
}

function getStructuredAddressValues(section) {
    const matches = [];
    for (const field of ADDRESS_FIELDS) {
        field.pattern.lastIndex = 0;
        let match;
        while ((match = field.pattern.exec(section))) {
            matches.push({ index: match.index, end: field.pattern.lastIndex, label: field.label });
        }
    }
    matches.sort((a, b) => a.index - b.index);
    const values = {};
    matches.forEach((match, index) => {
        const next = matches[index + 1];
        const value = cleanAddressText(section.slice(match.end, next ? next.index : section.length));
        if (value && !values[match.label]) values[match.label] = value;
    });
    return values;
}

function findState(value) {
    const escapedStates = knownStates.map(state => state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const match = new RegExp(`(?:^|[,\\.\\s])(${escapedStates.join('|')})(?=$|[,\\.\\s])`, 'i').exec(value);
    return match ? knownStates.find(state => state.toLowerCase() === match[1].toLowerCase()) || titleCase(match[1]) : null;
}

export function cleanPrincipalAddress(text) {
    const section = getAddressSection(text);
    if (!section) return { address: null, city: null, pincode: null, state: null };

    const fields = getStructuredAddressValues(section);
    const explicitCity = fields['City/Town/Village'] || null;
    const state = fields.State ? titleCase(fields.State) : findState(section);
    const pinMatches = [...section.matchAll(new RegExp(PIN_PATTERN.source, 'g'))];
    const pincode = fields['PIN Code'] || fields.Pincode || pinMatches.at(-1)?.[0] || null;
    const components = [
        fields['Building No./Flat No.'] || fields['Building No./Flat No'],
        fields['Name Of Premises/Building'],
        fields['Road/Street'],
        fields['Nearby Landmark'],
        fields['Locality/Sub Locality'],
    ].filter(Boolean);

    let addressBody = components.length
        ? components.join(', ')
        : section.replace(new RegExp(ADDRESS_FIELDS.map(field => field.pattern.source).join('|'), 'ig'), ', ');
    let extractedCity = explicitCity ? cleanAddressText(explicitCity) : null;

    if (!components.length) {
        if (pincode) addressBody = addressBody.replace(new RegExp(pincode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
        if (state) addressBody = addressBody.replace(new RegExp(state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
        addressBody = cleanAddressText(addressBody);
    }

    if (!components.length) {
        addressBody = addressBody
            .replace(/\bF['’]?(?:L|1)oor\b/gi, 'Floor')
            .replace(/\b(?:ist|1st)\s+floor\b/gi, '1st Floor')
            .replace(/([a-z])road\b/gi, '$1 Road')
            .replace(/([a-z])street\b/gi, '$1 Street')
            .replace(/[,;]\s*\d{1,2}\s*$/, '')
            .replace(/\b(road|rd|street|lane|marg|highway)\s+(?=[A-Za-z0-9])/gi, '$1, ');
        const collapsed = collapseRepeatedCity(addressBody, explicitCity);
        addressBody = collapsed.address;
        extractedCity = extractedCity || collapsed.city;
        if (!extractedCity) {
            const lastPart = addressBody.split(',').map(cleanAddressText).filter(Boolean).at(-1) || '';
            extractedCity = lastPart.match(/[A-Za-z]+\s*$/)?.[0]?.trim() || null;
            if (extractedCity) addressBody = collapseRepeatedCity(addressBody, extractedCity).address;
        }
    }

    const addressParts = [
        ...addressBody.split(',').map(cleanAddressText).filter(Boolean),
        extractedCity,
        state,
        pincode,
    ].filter(Boolean).map(titleCaseAddress);
    const address = cleanAddressText(addressParts.join(', '));
    return {
        address: address || null,
        city: extractedCity ? titleCaseAddress(extractedCity) : null,
        pincode: pincode || null,
        state: state || null,
    };
}

function extractGstinDetails(text) {
    const clean = text.toUpperCase().replace(/[\s:-]+/g, '');
    const direct = clean.match(GSTIN_REGEX);
    let gstin = direct ? direct[0] : null;
    if (!gstin) {
        const candidates = clean.match(/[A-Z0-9]{15}/g) || [];
        for (const candidate of candidates) {
            const corrected = correctGstinCandidate(candidate);
            if (corrected) {
                gstin = corrected;
                break;
            }
        }
    }
    const address = cleanPrincipalAddress(text);
    return {
        gstin,
        stateCode: gstin ? gstin.slice(0, 2) : null,
        tradeName: findTradeName(text),
        ...address,
    };
}

export function findTradeName(text) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const labelPattern = /\b(?:trade|frade|tr[a4]de)\s+name(?:\s*[,;:]?\s*if\s+any\b|\s*\(\s*if\s+any\s*\))?\s*[:\-]?\s*/ig;
    const nextLabelPattern = /\b(?:legal\s+name(?:\s+of\s+business)?|trade\s+name|constitution\s+of\s+business|gstin(?:\s*\/?\s*uin)?|gst\s+identification\s+number|pan(?:\s+(?:number|no\.?))?|principal\s+place\s+of\s+business|address\s+of\s+(?:principal\s+place|business)|date\s+of\s+(?:liability|validity|issue|registration)|period\s+of\s+validity|type\s+of\s+registration|particulars\s+of\s+approving\s+authority|taxpayer\s+type|nature\s+of\s+business\s+activities|state\s+jurisdiction|centre\s+jurisdiction|center\s+jurisdiction|registration\s+certificate|status)\b/ig;

    for (const match of normalized.matchAll(labelPattern)) {
        const remaining = normalized.slice(match.index + match[0].length);
        nextLabelPattern.lastIndex = 0;
        const nextLabel = nextLabelPattern.exec(remaining);
        const candidate = remaining.slice(0, nextLabel ? nextLabel.index : remaining.length)
            .replace(/\s*[|¦]\s*[^|¦]{0,12}$/, '')
            .replace(/^[\s:;,\-|?]+|[\s:;,\-|?]+$/g, '')
            .trim();
        if (candidate.length >= 2 && candidate.length <= 120 && (candidate.match(/[a-z]/ig) || []).length >= 2) {
            return candidate;
        }
    }
    return null;
}

/**
 * Scans a GST certificate file (PDF or image) with OCR and returns detected GSTIN details.
 * @param {File} file
 * @returns {Promise<{ gstin: string|null, stateCode: string|null, stateName: string|null }>}
 */
export async function extractGstinFromFile(file) {
    if (!file) return { gstin: null, stateCode: null, stateName: null };

    let details = { gstin: null, stateCode: null, address: null, city: null, pincode: null, state: null };
    const extension = file.name.split('.').pop()?.toLowerCase();
    const isPdf = file.type === 'application/pdf' || extension === 'pdf';
    let pdf;
    let text = '';
    let pageLimitExceeded = false;

    if (isPdf) {
        try {
            const buffer = await file.arrayBuffer();
            pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
            if (pdf.numPages > MAX_PDF_PAGES) {
                await pdf.destroy();
                pdf = null;
                pageLimitExceeded = true;
            } else {
                const pages = [];
                for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                    const page = await pdf.getPage(pageNumber);
                    const content = await page.getTextContent();
                    pages.push(content.items.map(item => 'str' in item ? item.str : '').filter(Boolean).join(' '));
                    page.cleanup();
                }
                text = pages.join('\n');
                details = extractGstinDetails(text);
            }
        } catch (err) {
            console.warn('Client-side PDF text extraction failed, trying OCR:', err);
        }
    }
    if (pageLimitExceeded) throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page limit.`);

    if ((!isPdf || pdf) && (!details.gstin || !details.address || !details.tradeName)) {
        let worker;
        let imageCanvas;
        try {
            worker = await createWorker('eng', 1, {
                workerPath: new URL('worker.min.js', TESSERACT_ASSET_BASE).href,
                corePath: TESSERACT_ASSET_BASE,
                langPath: '/api/documents/tessdata',
                gzip: false,
                workerBlobURL: false,
            });
            await worker.setParameters({ tessedit_pageseg_mode: '11' });
            const pagesToScan = isPdf ? (pdf ? pdf.numPages : 0) : 1;
            const ocrPages = [];
            for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber++) {
                const source = isPdf
                    ? await renderPdfPageToCanvas(pdf, pageNumber)
                    : (imageCanvas ||= await prepareImageForOcr(file));
                const { data: { text: pageText } } = await worker.recognize(source);
                ocrPages.push(pageText);
                const ocrDetails = extractGstinDetails(ocrPages.join('\n'));
                if (isPdf) {
                    source.width = 0;
                    source.height = 0;
                }
                if ((details.gstin || ocrDetails.gstin) &&
                    (details.address || ocrDetails.address) &&
                    (details.tradeName || ocrDetails.tradeName)) break;
            }
            const ocrDetails = extractGstinDetails(ocrPages.join('\n'));
            details = {
                gstin: details.gstin || ocrDetails.gstin,
                stateCode: details.stateCode || ocrDetails.stateCode,
                address: details.address || ocrDetails.address,
                city: details.city || ocrDetails.city,
                pincode: details.pincode || ocrDetails.pincode,
                state: details.state || ocrDetails.state,
                tradeName: details.tradeName || ocrDetails.tradeName,
            };
        } catch (err) {
            console.warn('Client-side GSTIN OCR failed, trying API:', err);
        } finally {
            if (worker) await worker.terminate();
            if (imageCanvas) {
                imageCanvas.width = 0;
                imageCanvas.height = 0;
            }
        }
    }

    if (!details.gstin || !details.address) {
        const apiRes = await callBackendOcrApi('gstin/scan', file);
        if (apiRes?.success && apiRes.extractedNumber) {
            details = {
                gstin: details.gstin || apiRes.extractedNumber,
                stateCode: details.stateCode || apiRes.stateCode || apiRes.extractedNumber.slice(0, 2),
                address: details.address || apiRes.address || null,
                city: details.city || apiRes.city || null,
                pincode: details.pincode || apiRes.pincode || null,
                state: details.state || apiRes.state || null,
            };
        }
    }

    if (pdf) await pdf.destroy();
    return {
        ...details,
        stateName: details.state || getStateNameFromGstinCode(details.stateCode),
    };
}