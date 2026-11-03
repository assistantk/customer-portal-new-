import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PdfGeneratorService,
  formatIstTimestamp,
  parseAndFormatRecordDate,
  RegistrationPdfData
} from './pdf-generator.service';
import { AuthService, AuthUserData } from './auth.service';

class MockAuthService {
  private user: AuthUserData | null = null;

  setCurrentUser(u: AuthUserData | null): void {
    this.user = u;
  }

  get currentUser(): AuthUserData | null {
    return this.user;
  }
}

describe('PdfGeneratorService', () => {
  let service: PdfGeneratorService;
  let mockAuthService: MockAuthService;

  beforeEach(() => {
    mockAuthService = new MockAuthService();
    service = new PdfGeneratorService(mockAuthService as unknown as AuthService);
  });

  describe('formatIstTimestamp', () => {
    it('formats a date to Asia/Kolkata IST with the correct pattern', () => {
      // 2026-10-30T09:57:55.000Z is 2026-10-30 15:27:55 IST
      const date = new Date('2026-10-30T09:57:55.000Z');
      const formatted = formatIstTimestamp(date);

      expect(formatted).toBe('Fri Oct 30 15:27:55 IST 2026');
    });

    it('formats another test date in IST', () => {
      // 2026-01-15T04:30:00.000Z is 2026-01-15 10:00:00 IST
      const date = new Date('2026-01-15T04:30:00.000Z');
      const formatted = formatIstTimestamp(date);

      expect(formatted).toBe('Thu Jan 15 10:00:00 IST 2026');
    });
  });

  describe('parseAndFormatRecordDate - Dynamic Date Resolution', () => {
    const fallback = new Date('2026-11-02T10:00:00.000Z');

    it('prefers the record date when provided as an ISO string', () => {
      const res = parseAndFormatRecordDate('2026-10-30T09:57:55.000Z', fallback);
      expect(res).toBe('Fri Oct 30 15:27:55 IST 2026');
    });

    it('prefers the record date when provided as a Date object', () => {
      const recordDate = new Date('2026-08-15T03:30:00.000Z');
      const res = parseAndFormatRecordDate(recordDate, fallback);
      expect(res).toBe('Sat Aug 15 09:00:00 IST 2026');
    });

    it('prefers the record date when provided as DD-MM-YYYY', () => {
      const res = parseAndFormatRecordDate('30-10-2026', fallback);
      expect(res).toContain('Oct 30');
      expect(res).toContain('2026');
      expect(res).toContain('IST');
    });

    it('falls back to current system date when recordDate is missing or undefined', () => {
      const res = parseAndFormatRecordDate(undefined, fallback);
      expect(res).toBe(formatIstTimestamp(fallback));
    });

    it('falls back to current system date when recordDate is empty or dash', () => {
      expect(parseAndFormatRecordDate('', fallback)).toBe(formatIstTimestamp(fallback));
      expect(parseAndFormatRecordDate('-', fallback)).toBe(formatIstTimestamp(fallback));
      expect(parseAndFormatRecordDate('N/A', fallback)).toBe(formatIstTimestamp(fallback));
    });
  });

  describe('Dynamic Signature Block Resolution', () => {
    it('resolves signature details for SREEJU KRISHNAN from CSTM division', () => {
      mockAuthService.setCurrentUser({
        userId: '5219',
        userName: 'SREEJU KRISHNAN',
        designation: 'SR.DCM',
        divisionCode: 'CSTM',
        userRole: 'SR-DCM'
      });

      const fixedDate = new Date('2026-10-30T09:57:55.000Z');
      const sig = service.resolveSignatureDetails(undefined, fixedDate);

      expect(sig.verifiedStatus).toBe('Signature Not Verified');
      expect(sig.eSignedByLabel).toBe('eSigned by');
      expect(sig.signerIdentity).toBe('SREEJU KRISHNAN, 5219');
      expect(sig.designationDivisionOrg).toBe('SR.DCM/CSTM/CRIS');
      expect(sig.formattedTimestamp).toBe('Fri Oct 30 15:27:55 IST 2026');
      expect(sig.signatureImageBase64).toBe('');
    });

    it('shows the signer name once when it matches the user ID', () => {
      mockAuthService.setCurrentUser({
        userId: 'SREEJU',
        userName: 'SREEJU'
      });

      expect(service.resolveSignatureDetails().signerIdentity).toBe('SREEJU');
    });

    it('normalizes trailing slash in designation (e.g., SR.DCM/) and attaches division code TKD', () => {
      mockAuthService.setCurrentUser({
        userId: '3562',
        userName: 'ANIL SHARMA',
        designation: 'SR.DCM/',
        divisionCode: 'TKD',
        userRole: 'SR-DCM'
      });

      const fixedDate = new Date('2026-10-31T06:00:00.000Z');
      const sig = service.resolveSignatureDetails(undefined, fixedDate);

      expect(sig.signerIdentity).toBe('ANIL SHARMA, 3562');
      expect(sig.designationDivisionOrg).toBe('SR.DCM/TKD/CRIS');
      expect(sig.designationDivision).toBe('SR.DCM/TKD');
      expect(sig.formattedTimestamp).toBe('Sat Oct 31 11:30:00 IST 2026');
    });

    it('dynamically resolves details for another Senior DCM in a different division (TKD)', () => {
      mockAuthService.setCurrentUser({
        userId: '1042',
        userName: 'RAMESH KUMAR',
        designation: 'SR-DCM',
        divisionCode: 'TKD',
        userRole: 'SR-DCM'
      });

      const fixedDate = new Date('2026-10-31T06:00:00.000Z');
      const sig = service.resolveSignatureDetails(undefined, fixedDate);

      expect(sig.verifiedStatus).toBe('Signature Not Verified');
      expect(sig.eSignedByLabel).toBe('eSigned by');
      expect(sig.signerIdentity).toBe('RAMESH KUMAR, 1042');
      // Hyphenated SR-DCM normalized to SR.DCM
      expect(sig.designationDivisionOrg).toBe('SR.DCM/TKD/CRIS');
      expect(sig.formattedTimestamp).toBe('Sat Oct 31 11:30:00 IST 2026');
    });

    it('uses recordDate when passed into resolveSignatureDetails', () => {
      mockAuthService.setCurrentUser({
        userId: '5219',
        userName: 'SREEJU KRISHNAN',
        designation: 'SR.DCM',
        divisionCode: 'CSTM'
      });

      const systemDate = new Date('2026-11-02T10:00:00.000Z');
      const recordDate = '2026-10-25T05:30:00.000Z';
      const sig = service.resolveSignatureDetails(undefined, systemDate, recordDate);

      // Should display the record date, not system date
      expect(sig.formattedTimestamp).toBe('Sun Oct 25 11:00:00 IST 2026');
    });

    it('safely handles missing division and name without fabricating values', () => {
      mockAuthService.setCurrentUser({
        userId: '9999'
      });

      const sig = service.resolveSignatureDetails();
      expect(sig.signerIdentity).toBe('9999');
      expect(sig.designationDivisionOrg).toBe('SR.DCM/CSTM/CRIS');
      expect(sig.verifiedStatus).toBe('Signature Not Verified');
    });

    it('allows explicit user override for testing synthetic users across designations and divisions', () => {
      const syntheticUser: AuthUserData = {
        userId: '8877',
        userName: 'PRIYA SHARMA',
        designation: 'DCM',
        divisionCode: 'HWH',
        userRole: 'DCM'
      };

      const sig = service.resolveSignatureDetails(syntheticUser, new Date('2026-10-30T09:57:55.000Z'));
      expect(sig.signerIdentity).toBe('PRIYA SHARMA, 8877');
      expect(sig.designationDivisionOrg).toBe('DCM/HWH/CRIS');
    });
  });

  describe('PDF Generation & Signature Block', () => {
    it('generates a valid PDF with correct content and signature block without embedding an image', () => {
      mockAuthService.setCurrentUser({
        userId: '5219',
        userName: 'SREEJU KRISHNAN',
        designation: 'SR.DCM',
        divisionCode: 'CSTM'
      });

      const data: RegistrationPdfData = {
        code: 'TISCO',
        codeType: 'GLOBAL',
        companyName: 'TATA STEEL LIMITED',
        tradeName: 'TATA STEEL',
        panNumber: 'AAACT2727Q',
        address: 'BOMBAY HOUSE, 24 HOMI MODY STREET',
        city: 'MUMBAI',
        state: 'MAHARASHTRA',
        pincode: '400001',
        gstins: [{ gstin: '27AAACT2727Q1ZT', state: 'MAHARASHTRA' }],
        recordDate: '2026-10-30T09:57:55.000Z',
        generatedAt: new Date('2026-11-02T10:00:00.000Z')
      };

      const doc = service.generateRegistrationPdf(data);
      expect(doc).toBeDefined();

      const output = doc.output('arraybuffer');
      expect(output.byteLength).toBeGreaterThan(10000);

      // Verify the PDF no longer embeds the signature image object
      const binaryString = doc.output();
      expect(binaryString).not.toContain('/Subtype /Image');

      // Verify dynamic text content
      expect(binaryString).toContain('Signature Not Verified');
      expect(binaryString).toContain('eSigned by');
      expect(binaryString).toContain('SREEJU KRISHNAN');
      expect(binaryString).not.toContain('SREEJU KRISHNAN, 5219');
      expect(binaryString).toContain('SR.DCM/CSTM/CRIS');
      // Uses the record date
      expect(binaryString).toContain('Fri Oct 30 15:27:55 IST 2026');
    });

    it('falls back to current system date when recordDate is missing in PDF generation', () => {
      mockAuthService.setCurrentUser({
        userId: '5219',
        userName: 'SREEJU KRISHNAN',
        designation: 'SR.DCM',
        divisionCode: 'CSTM'
      });

      const data: RegistrationPdfData = {
        code: 'NEWCODE',
        companyName: 'NEW COMPANY',
        generatedAt: new Date('2026-11-01T04:30:00.000Z')
        // recordDate omitted
      };

      const doc = service.generateRegistrationPdf(data);
      const binaryString = doc.output();

      // System date fallback used: Sun Nov 01 10:00:00 IST 2026
      expect(binaryString).toContain('Sun Nov 01 10:00:00 IST 2026');
    });

    it('places the signature block on the final page of a multi-page document', () => {
      mockAuthService.setCurrentUser({
        userId: '5219',
        userName: 'SREEJU KRISHNAN',
        designation: 'SR.DCM',
        divisionCode: 'CSTM'
      });

      const data: RegistrationPdfData = {
        code: 'MULTI',
        companyName: 'MULTI PAGE CORP',
        recordDate: '2026-10-30T09:57:55.000Z'
      };

      const doc = service.generateRegistrationPdf(data);
      // Simulate multi-page by adding another page
      doc.addPage();
      const totalPages = doc.getNumberOfPages();
      expect(totalPages).toBe(2);

      // Re-running or verifying page placement
      const secondDoc = service.generateRegistrationPdf(data);
      expect(secondDoc.getNumberOfPages()).toBe(1);
    });

    it('creates a preview blob URL via previewRegistrationPdf', () => {
      // Mock URL.createObjectURL for jsdom environment if needed
      if (typeof URL.createObjectURL !== 'function') {
        URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-preview-url');
      } else {
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-preview-url');
      }

      const data: RegistrationPdfData = {
        code: 'PREVIEW1',
        companyName: 'PREVIEW CO'
      };

      const previewUrl = service.previewRegistrationPdf(data);
      expect(previewUrl).toBe('blob:http://localhost/mock-preview-url');
    });

    it('generates a landscape verification report with retained fields and omits contact details and pincode', () => {
      mockAuthService.setCurrentUser({
        userId: '5219',
        userName: 'SREEJU'
      });

      const doc = service.generateVerificationPdf({
        searchType: 'GST Number',
        searchValue: '27ABCDE1234F1Z5',
        columns: [
          'customerCode',
          'companyName',
          'address',
          'panNumber',
          'division',
          'additionalField',
          'emailId',
          'phoneNumber',
          'pincode'
        ],
        rows: [[
          'MSBC',
          'A VERY LONG COMPANY NAME THAT MUST WRAP WITHOUT BEING CUT OFF',
          'NIL, PUTIKHATI DEKARGAON, TEZPUR, SONITPUR, ASSAM, 784501',
          'AMKPB8046M',
          'SR.DCM/RNY',
          'API EXTRA FIELD VALUE',
          'hidden-email@example.test',
          'hidden-phone-9910303868',
          'hidden-pincode-784501'
        ]],
        generatedAt: new Date('2026-10-30T09:57:55.000Z')
      });

      expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
      const output = doc.output('arraybuffer');
      const text = new TextDecoder().decode(new Uint8Array(output));
      expect(text).toContain('Customer Verification Report');
      expect(text).toContain('Search Type: GST Number');
      expect(text).toContain('27ABCDE1234F1Z5');
      expect(text).not.toContain('Signature Not Verified');
      expect(text).toContain('eSigned by');
      expect(text).not.toContain('(SREEJU) Tj');
      expect(text).not.toContain('(5219) Tj');
      expect(text).toContain('(SR.DCM/RNY) Tj');
      expect(text).not.toContain('(SR.DCM/CSTM) Tj');
      expect(text).toContain('(SR.DCM/) Tj');
      expect(text).toContain('(SR.DCM/RNY) Tj');
      expect(text).toContain('(API EXTRA FIELD) Tj');
      expect(text).toContain('(VALUE) Tj');
      expect(text).not.toContain('Email Id');
      expect(text).not.toContain('Phone Number');
      expect(text).not.toContain('Pincode');
      expect(text).not.toContain('hidden-email@example.test');
      expect(text).not.toContain('hidden-phone-9910303868');
      expect(text).not.toContain('hidden-pincode-784501');
      expect(text).toContain('Page 1 of 1');
      expect(doc.getNumberOfPages()).toBe(1);
    });

    it('splits wide, long verification results across landscape pages without dropping the final row', () => {
      const columns = [
        'customerCode',
        'companyName',
        'address',
        ...Array.from({ length: 10 }, (_, index) => `additionalField${index}`)
      ];
      const rows = Array.from({ length: 24 }, (_, rowIndex) => [
        `CODE${rowIndex}`,
        `Company ${rowIndex}`,
        `Long address ${'TEZPUR ASSAM '.repeat(30)}`,
        ...Array.from({ length: 10 }, (_, index) => `Value ${rowIndex}-${index}`)
      ]);
      rows[rows.length - 1][2] = 'FINAL LONG ADDRESS VALUE';

      const doc = service.generateVerificationPdf({
        searchType: 'Global Customer Code',
        searchValue: 'MSBC',
        columns,
        rows,
        generatedAt: new Date('2026-10-30T09:57:55.000Z')
      });

      expect(doc.getNumberOfPages()).toBeGreaterThan(2);
      const output = doc.output('arraybuffer');
      const text = new TextDecoder().decode(new Uint8Array(output));
      expect(text).toContain('(FINAL LONG) Tj');
      expect(text).toContain('(ADDRESS VALUE) Tj');
      expect(text).toContain(`Page ${doc.getNumberOfPages()} of ${doc.getNumberOfPages()}`);
    });
  });
});
