import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Standard PAN format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)
const PAN_REGEX = /[A-Z]{5}[0-9]{4}[A-Z]/;

/**
 * Renders the first page of a PDF file to an off-screen canvas at a high
 * scale so OCR has enough resolution to read small printed text accurately.
 */
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

/**
 * Scans a PAN card file (PDF or image) with OCR and returns the detected
 * 10-character PAN number, or null if none could be found.
 * @param {File} file
 * @returns {Promise<string|null>}
 */
export async function extractPanFromFile(file) {
    if (!file) return null;

    const isPdf = file.type === 'application/pdf';
    const source = isPdf ? await renderPdfFirstPageToCanvas(file) : file;

    const worker = await createWorker('eng');
    try {
        const { data: { text } } = await worker.recognize(source);
        const match = text.toUpperCase().match(PAN_REGEX);
        return match ? match[0] : null;
    } finally {
        await worker.terminate();
    }
}