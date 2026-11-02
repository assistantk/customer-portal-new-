import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { AuthService, AuthUserData } from './auth.service';
import { OFFICIAL_SIGNATURE_BASE64, OFFICIAL_SIGNATURE_ASPECT_RATIO } from './signature-asset';

export interface RegistrationPdfData {
  title?: string;
  codeType?: string; // 'GLOBAL' | 'HANDLING_AGENT' | 'OWNERSHIP'
  code?: string;
  companyName?: string;
  tradeName?: string;
  panNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstins?: Array<{ gstin: string; state?: string }>;
  ownershipCode?: string;
  ownershipDesc?: string;
  partyCode?: string;
  partyDesc?: string;
  recordDate?: string | Date; // Record's date column value from table/API
  generatedAt?: Date;
}

export interface SignatureBlockDetails {
  verifiedStatus: string;
  eSignedByLabel: string;
  signerIdentity: string;
  designationDivisionOrg: string;
  designationDivision: string;
  formattedTimestamp: string;
  signatureImageBase64: string;
}

/**
 * Formats a Date object into IST timezone string matching the format:
 * "Fri Oct 30 15:27:55 IST 2026"
 */
export function formatIstTimestamp(date: Date = new Date()): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const kolkataDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const dayName = days[kolkataDate.getDay()];
  const monthName = months[kolkataDate.getMonth()];
  const dateNum = String(kolkataDate.getDate()).padStart(2, '0');
  const hours = String(kolkataDate.getHours()).padStart(2, '0');
  const minutes = String(kolkataDate.getMinutes()).padStart(2, '0');
  const seconds = String(kolkataDate.getSeconds()).padStart(2, '0');
  const year = kolkataDate.getFullYear();

  return `${dayName} ${monthName} ${dateNum} ${hours}:${minutes}:${seconds} IST ${year}`;
}

/**
 * Parses and formats the date column associated with the source record.
 * Falls back dynamically to the system date/time in IST if the record date is unavailable or invalid.
 */
export function parseAndFormatRecordDate(recordDate?: string | Date | null, fallbackDate: Date = new Date()): string {
  if (!recordDate) {
    return formatIstTimestamp(fallbackDate);
  }
  if (recordDate instanceof Date) {
    return !isNaN(recordDate.getTime()) ? formatIstTimestamp(recordDate) : formatIstTimestamp(fallbackDate);
  }
  const s = String(recordDate).trim();
  if (!s || s === '-' || s.toUpperCase() === 'N/A') {
    return formatIstTimestamp(fallbackDate);
  }
  // If already in IST formatted pattern, retain as-is
  if (s.includes('IST') && s.length >= 20) {
    return s;
  }
  // Try DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(.*)$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return formatIstTimestamp(d);
    }
  }
  // Try ISO or standard Date parsing
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return formatIstTimestamp(parsed);
  }
  return formatIstTimestamp(fallbackDate);
}

@Injectable({
  providedIn: 'root'
})
export class PdfGeneratorService {
  constructor(private authService: AuthService) {}

  /**
   * Resolves dynamic signature details from the authenticated user and generation/record time.
   * Format:
   *   Signature Not Verified
   *   eSigned by
   *   [LOGGED-IN USER FULL NAME], [EMPLOYEE ID]
   *   [DESIGNATION]/[DIVISION]/CRIS
   *   [DYNAMIC DATE AND TIME]
   */
  resolveSignatureDetails(
    user?: AuthUserData | null,
    date: Date = new Date(),
    recordDate?: string | Date | null
  ): SignatureBlockDetails {
    const authUser = user !== undefined ? user : this.authService.currentUser;

    const fullName = (authUser?.userName || authUser?.userId || 'AUTHORIZED USER').trim();
    const employeeId = (authUser?.userId || 'N/A').trim();

    // Fetch designation from currently authenticated user's selected designation
    let rawDesignation = (authUser?.designation || authUser?.userRole || 'SR.DCM').trim();
    if (rawDesignation.toUpperCase() === 'SR-DCM') {
      rawDesignation = 'SR.DCM';
    }
    // Remove any trailing slashes (e.g. 'SR.DCM/' -> 'SR.DCM')
    const designation = rawDesignation.replace(/\/+$/, '');

    // Fetch division code from authenticated profile
    const division = (authUser?.divisionCode || 'CSTM').trim().toUpperCase() || 'CSTM';
    const organization = 'CRIS';

    // Format: [DESIGNATION]/[DIVISION]/CRIS
    const designationDivisionOrg = `${designation}/${division}/${organization}`;
    const designationDivision = `${designation}/${division}`;

    // Prefer record date from source table/API, fallback to system IST date/time
    const formattedTimestamp = parseAndFormatRecordDate(recordDate, date);

    return {
      verifiedStatus: 'Signature Not Verified',
      eSignedByLabel: 'eSigned by',
      signerIdentity: `${fullName}, ${employeeId}`,
      designationDivisionOrg,
      designationDivision,
      formattedTimestamp,
      signatureImageBase64: OFFICIAL_SIGNATURE_BASE64
    };
  }

  /**
   * Generates a jsPDF document for the given registration data and appends the official signature section.
   */
  generateRegistrationPdf(data: RegistrationPdfData, userOverride?: AuthUserData | null): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const signature = this.resolveSignatureDetails(
      userOverride,
      data.generatedAt || new Date(),
      data.recordDate
    );

    // Top decorative banner (Railways navy blue)
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, 210, 8, 'F');

    // Document Title Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 58, 138);
    doc.text('GOVERNMENT OF INDIA - MINISTRY OF RAILWAYS', 105, 17, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text('CENTRE FOR RAILWAY INFORMATION SYSTEMS (CRIS)', 105, 23, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('FREIGHT CODE GENERATOR - REGISTRATION ACKNOWLEDGEMENT', 105, 29, { align: 'center' });

    // Divider line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(15, 33, 195, 33);

    // Metadata Summary Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15, 37, 180, 16, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(15, 37, 180, 16, 2, 2, 'S');

    const codeLabel = data.code || data.ownershipCode || 'N/A';
    const typeLabel = data.codeType === 'HANDLING_AGENT'
      ? 'HANDLING AGENT CODE'
      : data.codeType === 'OWNERSHIP'
      ? 'OWNERSHIP CODE'
      : 'GLOBAL CUSTOMER CODE';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('DOCUMENT REF:', 20, 44);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(codeLabel, 50, 44);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('DATE GENERATED:', 105, 44);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(signature.formattedTimestamp, 137, 44);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('CODE TYPE:', 20, 49.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(typeLabel, 50, 49.5);

    // Section 1: Entity Particulars
    let y = 60;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text('1. CUSTOMER & ENTITY PARTICULARS', 15, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(15, y + 2, 195, y + 2);
    y += 8;

    const particulars: Array<[string, string]> = [
      ['Customer / Entity Code', codeLabel],
      ['Company / Legal Name', data.companyName || '-'],
      ['Trade Name', data.tradeName || '-'],
      ['PAN Number', data.panNumber || '-'],
      ['Registered Address', data.address || '-'],
      ['City / State / Pincode', `${data.city || '-'}, ${data.state || '-'} - ${data.pincode || '-'}`]
    ];

    if (data.ownershipCode || data.partyCode) {
      if (data.ownershipCode) {
        particulars.push(['Ownership Code & Desc', `${data.ownershipCode} - ${data.ownershipDesc || '-'}`]);
      }
      if (data.partyCode) {
        particulars.push(['Party Code & Desc', `${data.partyCode} - ${data.partyDesc || '-'}`]);
      }
    }

    for (const [lbl, val] of particulars) {
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, 52, 7, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, y, 180, 7, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text(lbl, 18, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const safeVal = val.length > 70 ? val.substring(0, 67) + '...' : val;
      doc.text(safeVal || '-', 70, y + 5);
      y += 7;
    }

    // Section 2: GSTIN Particulars (if any)
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text('2. REGISTERED STATE-WISE GSTIN DETAILS', 15, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(15, y + 2, 195, y + 2);
    y += 7;

    // GSTIN Table Header
    doc.setFillColor(224, 231, 255);
    doc.rect(15, y, 180, 6.5, 'F');
    doc.setDrawColor(199, 210, 254);
    doc.rect(15, y, 180, 6.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text('S.NO.', 20, y + 4.5);
    doc.text('GSTIN NUMBER', 50, y + 4.5);
    doc.text('STATE / REGION', 120, y + 4.5);
    y += 6.5;

    const gstinList = data.gstins && data.gstins.length > 0
      ? data.gstins
      : [{ gstin: 'NO GSTIN REGISTERED', state: '-' }];

    gstinList.slice(0, 8).forEach((g, idx) => {
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, y, 180, 6.5, 'S');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(String(idx + 1), 22, y + 4.5);
      doc.text(g.gstin || '-', 50, y + 4.5);
      doc.text(g.state || '-', 120, y + 4.5);
      y += 6.5;
    });

    // ========================================================
    // DYNAMIC eSIGNATURE SECTION (Bottom Right on Final Page)
    // ========================================================
    // Requirement: For multi-page PDFs, display signature on final page only
    const totalPages = doc.getNumberOfPages();
    doc.setPage(totalPages);

    const sigX = 105;
    const sigY = Math.max(y + 8, 220);
    const sigWidth = 90;
    const sigHeight = 54;

    // Signature box container
    doc.setFillColor(250, 250, 252);
    doc.roundedRect(sigX, sigY, sigWidth, sigHeight, 2, 2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.roundedRect(sigX, sigY, sigWidth, sigHeight, 2, 2, 'S');

    // 1. Embed official reference e-signature image preserving original aspect ratio
    const imgWidth = 36;
    const imgHeight = imgWidth / OFFICIAL_SIGNATURE_ASPECT_RATIO;
    const imgX = sigX + 3.5;
    const imgY = sigY + (sigHeight - imgHeight) / 2;

    try {
      doc.addImage(OFFICIAL_SIGNATURE_BASE64, 'PNG', imgX, imgY, imgWidth, imgHeight);
    } catch (e) {
      console.warn('Could not embed signature image in PDF:', e);
    }

    // 2. Render dynamic authenticated text beside the image
    const textX = sigX + 41.5;

    // Line 1: Signature Heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(185, 28, 28);
    doc.text(signature.verifiedStatus, textX, sigY + 8);

    // Line 2: eSigned by
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(signature.eSignedByLabel, textX, sigY + 15);

    // Line 3: [LOGGED-IN USER FULL NAME], [EMPLOYEE ID]
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(signature.signerIdentity, textX, sigY + 22);

    // Line 4: [DESIGNATION]/[DIVISION]/CRIS
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(signature.designationDivisionOrg, textX, sigY + 29);

    // Line 5: [DYNAMIC DATE AND TIME]
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(signature.formattedTimestamp, textX, sigY + 36);

    // Line 6: Authority branding
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(59, 130, 246);
    doc.text('CDAC | CRIS', textX, sigY + 44);

    // Page Footers for all pages
    const finalPageCount = doc.getNumberOfPages();
    for (let p = 1; p <= finalPageCount; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.line(15, 280, 195, 280);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `This is a system generated document from the Freight Code Generator portal (CRIS). Page ${p} of ${finalPageCount}`,
        105,
        285,
        { align: 'center' }
      );
    }

    return doc;
  }

  /**
   * Generates a preview blob URL of the PDF document.
   */
  previewRegistrationPdf(data: RegistrationPdfData, userOverride?: AuthUserData | null): string {
    const doc = this.generateRegistrationPdf(data, userOverride);
    const blob = doc.output('blob');
    return URL.createObjectURL(blob);
  }

  /**
   * Generates and triggers browser download of the registration acknowledgement PDF.
   */
  downloadRegistrationPdf(data: RegistrationPdfData, filename?: string, userOverride?: AuthUserData | null): void {
    const doc = this.generateRegistrationPdf(data, userOverride);
    const defaultFilename = `${(data.code || 'registration').toUpperCase()}_acknowledgement.pdf`;
    doc.save(filename || defaultFilename);
  }
}
