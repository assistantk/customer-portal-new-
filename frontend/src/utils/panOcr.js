import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const PAN_REGEX = /[A-Z]{5}[0-9]{4}[A-Z]/;
const GSTIN_REGEX = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/;
const PIN_PATTERN = /\b[1-9][0-9]{5}\b/;

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

export function getStateNameFromGstinCode(code) {
    if (!code) return null;
    const clean = String(code).padStart(2, '0');
    return STATE_CODE_MAP[clean] || null;
}

const digitToLetter = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' };
const letterToDigit = { 'O': '0', 'Q': '0', 'D': '0', 'I': '1', 'L': '1', 'Z': '2', 'S': '5', 'G': '6', 'B': '8' };

export function correctPanCandidate(candidate) {
    if (!candidate) return null;
    const clean = candidate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 10) return null;
    const chars = clean.split('');
    for (let i = 0; i < 5; i++) {
        if (/\d/.test(chars[i])) chars[i] = digitToLetter[chars[i]] || chars[i];
    }
    for (let i = 5; i < 9; i++) {
        if (/[A-Z]/.test(chars[i])) chars[i] = letterToDigit[chars[i]] || chars[i];
    }
    if (/\d/.test(chars[9])) chars[9] = digitToLetter[chars[9]] || chars[9];
    const res = chars.join('');
    return PAN_REGEX.test(res) ? res : null;
}

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

async function renderPdfFirstPageToCanvas(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
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

function extractAddressFromText(text) {
    const labels = ['registered address', 'principal place of business', 'business address', 'address'];
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const labelIndex = lines.findIndex(line => labels.some(label => line.toLowerCase().includes(label.toLowerCase())));
    if (labelIndex < 0) return null;
    
    const sameLine = lines[labelIndex].split(/[:]/).slice(1).join(':').trim();
    const value = sameLine || lines[labelIndex + 1];
    if (!value) return null;
    
    const start = lines.findIndex(line => line.toLowerCase().includes(value.toLowerCase()));
    const selected = start >= 0 ? lines.slice(start, start + 5) : [value];
    let address = selected.join(', ').replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    return PIN_PATTERN.test(address) ? address : null;
}

const extractValueForLabelFromLines = (lines, label) => {
    const lowerLabel = label.toLowerCase();
    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes(lowerLabel)) {
            const index = lowerLine.indexOf(lowerLabel);
            const remaining = line.slice(index + label.length).trim();
            if (remaining.startsWith(':')) {
                return remaining.slice(1).trim() || null;
            }
            return remaining || null;
        }
    }
    return null;
}

const extractStructuredAddress = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    const building = extractValueForLabelFromLines(lines, 'Building No./Flat No');
    const premises = extractValueForLabelFromLines(lines, 'Name Of Premises/Building');
    const road = extractValueForLabelFromLines(lines, 'Road/Street');
    const landmark = extractValueForLabelFromLines(lines, 'Nearby Landmark');
    const locality = extractValueForLabelFromLines(lines, 'Locality/Sub Locality');
    
    const city = extractValueForLabelFromLines(lines, 'City/Town/Village');
    const pincode = extractValueForLabelFromLines(lines, 'PIN Code') || extractValueForLabelFromLines(lines, 'Pincode');
    const state = extractValueForLabelFromLines(lines, 'State');

    const addressParts = [building, premises, road, landmark, locality].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(', ') : null;

    return { address, city, pincode, state };
}

function extractCityFromAddress(address) {
    if (!address) return null;
    const parts = address.split(/[,]/).map(p => p.trim()).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
        if (PIN_PATTERN.test(parts[i])) {
            let words = parts[i].replace(PIN_PATTERN, '').replace(/[-_]/g, '').trim();
            if (words.length > 2) return words;
            if (i > 0 && parts[i - 1].length > 2) return parts[i - 1];
        }
    }
    return null;
}

/**
 * Scans a PAN card file (PDF or image) with OCR and returns the detected 10-character PAN number.
 * @param {File} file
 * @returns {Promise<string|null>}
 */
export async function extractPanFromFile(file) {
    if (!file) return null;

    try {
        const isPdf = file.type === 'application/pdf';
        const source = isPdf ? await renderPdfFirstPageToCanvas(file) : file;

        const worker = await createWorker('eng');
        try {
            const { data: { text } } = await worker.recognize(source);
            const clean = text.toUpperCase().replace(/[\s:-]+/g, '');
            const direct = clean.match(PAN_REGEX);
            if (direct && direct[0]) return direct[0];

            const candidates = clean.match(/[A-Z0-9]{10}/g) || [];
            for (const c of candidates) {
                const corrected = correctPanCandidate(c);
                if (corrected) return corrected;
            }
        } finally {
            await worker.terminate();
        }
    } catch (err) {
        console.warn('Client-side PAN OCR failed, trying API:', err);
    }

    // Fallback to backend API
    const apiRes = await callBackendOcrApi('pan/scan', file);
    if (apiRes && apiRes.success && apiRes.extractedNumber) {
        return apiRes.extractedNumber;
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

    try {
        const isPdf = file.type === 'application/pdf';
        const source = isPdf ? await renderPdfFirstPageToCanvas(file) : file;

        const worker = await createWorker('eng');
        try {
            const { data: { text } } = await worker.recognize(source);
            const clean = text.toUpperCase().replace(/[\s:-]+/g, '');
            const direct = clean.match(GSTIN_REGEX);
            let gstin = direct ? direct[0] : null;

            if (!gstin) {
                const candidates = clean.match(/[A-Z0-9]{15}/g) || [];
                for (const c of candidates) {
                    const corrected = correctGstinCandidate(c);
                    if (corrected) {
                        gstin = corrected;
                        break;
                    }
                }
            }

            const structured = extractStructuredAddress(text);
            let address = structured.address || extractAddressFromText(text);
            let pincode = structured.pincode || (address ? address.match(PIN_PATTERN)?.[0] || null : null);
            let city = structured.city || extractCityFromAddress(address);

            if (gstin) {
                const stateCode = gstin.slice(0, 2);
                const stateName = structured.state || getStateNameFromGstinCode(stateCode);
                return { gstin, stateCode, stateName, address, city, pincode };
            }
        } finally {
            await worker.terminate();
        }
    } catch (err) {
        console.warn('Client-side GSTIN OCR failed, trying API:', err);
    }

    // Fallback to backend API
    const apiRes = await callBackendOcrApi('gstin/scan', file);
    if (apiRes && apiRes.success && apiRes.extractedNumber) {
        const stateCode = apiRes.stateCode || apiRes.extractedNumber.slice(0, 2);
        const stateName = apiRes.state || getStateNameFromGstinCode(stateCode);
        return { 
            gstin: apiRes.extractedNumber, 
            stateCode, 
            stateName,
            address: apiRes.address || null,
            city: apiRes.city || null,
            pincode: apiRes.pincode || null
        };
    }

    return { gstin: null, stateCode: null, stateName: null, address: null, city: null, pincode: null };
}