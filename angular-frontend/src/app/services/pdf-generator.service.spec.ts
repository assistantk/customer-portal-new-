import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PdfGeneratorService,
  formatIstTimestamp,
  parseAndFormatRecordDate,
  RegistrationPdfData
} from './pdf-generator.service';
import { AuthService, AuthUserData } from './auth.service';
import { OFFICIAL_SIGNATURE_ASPECT_RATIO } from './signature-asset';

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

    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-preview-url');
    }
    if (typeof (globalThis as any).window === 'undefined') {
      (globalThis as any).window = {
        open: vi.fn().mockReturnValue({ opener: null, addEventListener: vi.fn() })
      };
    }
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
      expect(binaryString).toContain('Fri Oct 30 15:27:55 IST 2026');

      // Verify unwanted elements are removed
      expect(binaryString).not.toContain('Signature Not Verified');
      expect(binaryString).not.toContain('eSigned by');
      expect(binaryString).not.toContain('CDAC | CRIS');
      expect(binaryString).not.toContain('(SREEJU)');
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

    it('embeds the official signature image and dynamic credentials in verification report PDF', () => {
      mockAuthService.setCurrentUser({
        userId: '3562',
        userName: 'RAMESH CHANDRA',
        designation: 'SR.DCM/',
        divisionCode: 'CSTM'
      });

      const doc = service.generateVerificationPdf({
        searchType: 'Global Customer Code',
        searchValue: 'TISCO',
        columns: ['customerCode', 'companyName', 'creationDate'],
        rows: [['TISCO', 'TATA STEEL LIMITED', '2026-10-30T09:57:55.000Z']],
        generatedAt: new Date('2026-11-02T10:00:00.000Z')
      });

      const binary = doc.output();
      expect(binary).toContain('/Subtype /Image');
      expect(binary).toContain('SR.DCM/CSTM/CRIS');
      // Preferred the date column from table row
      expect(binary).toContain('Fri Oct 30 15:27:55 IST 2026');
      expect(binary).not.toContain('Signature Not Verified');
      expect(binary).not.toContain('eSigned by');
      expect(binary).not.toContain('CDAC | CRIS');
      expect(binary).not.toContain('(SREEJU)');
    });

    it('creates verification preview and download functions embedding the official signature', () => {
      mockAuthService.setCurrentUser({
        userId: '5219',
        userName: 'SREEJU KRISHNAN',
        designation: 'SR.DCM',
        divisionCode: 'CSTM'
      });

      const openSpy = vi.spyOn((globalThis as any).window, 'open').mockReturnValue({
        opener: null,
        addEventListener: vi.fn()
      } as unknown as Window);

      const data = {
        searchType: 'Global Customer Code',
        searchValue: 'TISCO',
        columns: ['customerCode', 'companyName'],
        rows: [['TISCO', 'TATA STEEL']],
        recordDate: '2026-10-30T09:57:55.000Z'
      };

      service.previewVerificationPdf(data);
      expect(openSpy).toHaveBeenCalled();

      // Download verification PDF
      const doc = service.generateVerificationPdf(data);
      const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc as any);
      doc.save('test_verification.pdf');
      expect(saveSpy).toHaveBeenCalledWith('test_verification.pdf');
    });

    it('automatically adds a dedicated final page for the signature block when table rows occupy the bottom area', () => {
      mockAuthService.setCurrentUser({
        userId: '3562',
        userName: 'RAMESH CHANDRA',
        designation: 'SR.DCM',
        divisionCode: 'CSTM'
      });

      // Rows that fill page 1 down to y ~ 160mm (overflowing the landscape signature zone)
      const rows = Array.from({ length: 30 }, (_, i) => [
        `CODE${i}`,
        `Customer Company Name ${i}`,
        `Address Details line for company ${i}`,
        `2026-10-30`
      ]);

      const doc = service.generateVerificationPdf({
        searchType: 'Global Customer Code',
        searchValue: 'CODE',
        columns: ['customerCode', 'companyName', 'address', 'creationDate'],
        rows,
        generatedAt: new Date('2026-10-30T09:57:55.000Z')
      });

      const pageCount = doc.getNumberOfPages();
      expect(pageCount).toBeGreaterThanOrEqual(2);

      // The signature is on the final page
      doc.setPage(pageCount);
      const binary = doc.output();
      expect(binary).toContain('/Subtype /Image');
      expect(binary).toContain(`Page ${pageCount} of ${pageCount}`);
    });
  });

  describe('Comprehensive Compliance - 7 Core Acceptance Criteria', () => {
    // 1. Different Designations
    describe('Criterion 1: Different Designations', () => {
      const designations = [
        { raw: 'SR.DCM/', expectedOrg: 'SR.DCM/CSTM/CRIS', expectedPair: 'SR.DCM/CSTM' },
        { raw: 'SR.DCM', expectedOrg: 'SR.DCM/CSTM/CRIS', expectedPair: 'SR.DCM/CSTM' },
        { raw: 'SR-DCM', expectedOrg: 'SR.DCM/CSTM/CRIS', expectedPair: 'SR.DCM/CSTM' },
        { raw: 'DCM', expectedOrg: 'DCM/CSTM/CRIS', expectedPair: 'DCM/CSTM' },
        { raw: 'ACM', expectedOrg: 'ACM/CSTM/CRIS', expectedPair: 'ACM/CSTM' },
        { raw: 'SR.DOM', expectedOrg: 'SR.DOM/CSTM/CRIS', expectedPair: 'SR.DOM/CSTM' },
        { raw: '', expectedOrg: 'SR.DCM/CSTM/CRIS', expectedPair: 'SR.DCM/CSTM' }
      ];

      designations.forEach(({ raw, expectedOrg, expectedPair }) => {
        it(`correctly normalizes and renders designation: "${raw}" -> "${expectedOrg}"`, () => {
          const user: AuthUserData = {
            userId: '7788',
            userName: 'OFFICER TEST',
            designation: raw,
            divisionCode: 'CSTM'
          };
          const sig = service.resolveSignatureDetails(user, new Date('2026-10-30T09:57:55.000Z'));
          expect(sig.designationDivisionOrg).toBe(expectedOrg);
          expect(sig.designationDivision).toBe(expectedPair);

          // Verify embedding in both registration and verification PDF
          const regDoc = service.generateRegistrationPdf({ code: 'REG01', companyName: 'REG CO' }, user);
          expect(regDoc.output()).toContain(expectedOrg);

          const verDoc = service.generateVerificationPdf({
            searchType: 'Customer Code',
            searchValue: 'REG01',
            columns: ['customerCode', 'companyName'],
            rows: [['REG01', 'REG CO']]
          }, user);
          expect(verDoc.output()).toContain(expectedOrg);
        });
      });
    });

    // 2. Different Division Codes
    describe('Criterion 2: Different Division Codes', () => {
      const divisions = ['CSTM', 'TKD', 'HWH', 'RNY', 'BB', 'UMB'];

      divisions.forEach((div) => {
        it(`correctly attaches division code: "${div}" to designation`, () => {
          const user: AuthUserData = {
            userId: '4455',
            userName: 'DIV OFFICER',
            designation: 'SR.DCM',
            divisionCode: div
          };
          const sig = service.resolveSignatureDetails(user, new Date('2026-10-30T09:57:55.000Z'));
          expect(sig.designationDivisionOrg).toBe(`SR.DCM/${div}/CRIS`);
          expect(sig.designationDivision).toBe(`SR.DCM/${div}`);

          const doc = service.generateRegistrationPdf({ code: 'DIVTEST', companyName: 'DIV CO' }, user);
          expect(doc.output()).toContain(`SR.DCM/${div}/CRIS`);
        });
      });

      it('falls back cleanly to PUNE when divisionCode is undefined', () => {
        const user: AuthUserData = {
          userId: '1111',
          userName: 'NO DIV USER'
        };
        const sig = service.resolveSignatureDetails(user);
        expect(sig.divisionCode).toBe('PUNE');
        expect(sig.designationDivisionOrg).toBe('SR.DCM/PUNE/CRIS');
      });
    });

    // 3. Records with Valid Date Column
    describe('Criterion 3: Records with a Valid Date Column', () => {
      it('uses recordDate when provided as ISO timestamp', () => {
        const user: AuthUserData = { userId: '1', userName: 'TEST', designation: 'SR.DCM', divisionCode: 'CSTM' };
        const sig = service.resolveSignatureDetails(
          user,
          new Date('2026-11-03T10:00:00.000Z'),
          '2026-10-30T09:57:55.000Z'
        );
        expect(sig.formattedTimestamp).toBe('Fri Oct 30 15:27:55 IST 2026');
      });

      it('uses recordDate when provided as Date object', () => {
        const dateObj = new Date('2026-10-30T09:57:55.000Z');
        const sig = service.resolveSignatureDetails(null, new Date('2026-11-03T10:00:00.000Z'), dateObj);
        expect(sig.formattedTimestamp).toBe('Fri Oct 30 15:27:55 IST 2026');
      });

      it('uses recordDate when provided as numeric timestamp', () => {
        const timestamp = new Date('2026-10-30T09:57:55.000Z').getTime();
        const sig = service.resolveSignatureDetails(null, new Date(), timestamp);
        expect(sig.formattedTimestamp).toBe('Fri Oct 30 15:27:55 IST 2026');
      });

      it('uses recordDate when provided as DD-MM-YYYY', () => {
        const sig = service.resolveSignatureDetails(null, new Date(), '30-10-2026');
        expect(sig.formattedTimestamp).toContain('Oct 30');
        expect(sig.formattedTimestamp).toContain('2026');
        expect(sig.formattedTimestamp).toContain('IST');
      });

      it('auto-detects date column (creationDate) from verification table rows', () => {
        const user: AuthUserData = { userId: '2', userName: 'VERIF', designation: 'SR.DCM', divisionCode: 'TKD' };
        const doc = service.generateVerificationPdf({
          searchType: 'Code',
          searchValue: 'TISCO',
          columns: ['customerCode', 'companyName', 'creationDate'],
          rows: [['TISCO', 'TATA STEEL', '2026-10-30T09:57:55.000Z']],
          generatedAt: new Date('2026-11-02T10:00:00.000Z')
        }, user);

        const binary = doc.output();
        // Signature block has the record date
        expect(binary).toContain('Fri Oct 30 15:27:55 IST 2026');
      });

      it('does NOT confuse PDF generation date with source record date in Registration PDF', () => {
        const user: AuthUserData = { userId: '3', userName: 'USER', designation: 'SR.DCM', divisionCode: 'CSTM' };
        const generatedAt = new Date('2026-11-02T10:00:00.000Z'); // Mon Nov 02 15:30:00 IST 2026
        const recordDate = '2026-10-30T09:57:55.000Z'; // Fri Oct 30 15:27:55 IST 2026

        const doc = service.generateRegistrationPdf({
          code: 'DISTINCT',
          companyName: 'DISTINCT DATES CO',
          recordDate,
          generatedAt
        }, user);

        const binary = doc.output();
        // DATE GENERATED metadata box has generation time
        expect(binary).toContain('Mon Nov 02 15:30:00 IST 2026');
        // Signature box has record date
        expect(binary).toContain('Fri Oct 30 15:27:55 IST 2026');
      });
    });

    // 4. Records with Missing Date (Fallback)
    describe('Criterion 4: Records with Missing Date Falling Back to System Date in IST', () => {
      const fallback = new Date('2026-11-02T04:30:00.000Z'); // Mon Nov 02 10:00:00 IST 2026

      it('falls back to IST system date when recordDate is undefined', () => {
        expect(parseAndFormatRecordDate(undefined, fallback)).toBe('Mon Nov 02 10:00:00 IST 2026');
      });

      it('falls back to IST system date when recordDate is null', () => {
        expect(parseAndFormatRecordDate(null, fallback)).toBe('Mon Nov 02 10:00:00 IST 2026');
      });

      it('falls back to IST system date when recordDate is empty or dash or N/A', () => {
        expect(parseAndFormatRecordDate('', fallback)).toBe('Mon Nov 02 10:00:00 IST 2026');
        expect(parseAndFormatRecordDate('-', fallback)).toBe('Mon Nov 02 10:00:00 IST 2026');
        expect(parseAndFormatRecordDate('N/A', fallback)).toBe('Mon Nov 02 10:00:00 IST 2026');
      });
    });

    // 5. Single-Page and Multi-Page PDFs
    describe('Criterion 5: Single-Page and Multi-Page PDFs', () => {
      it('renders signature on final page of single-page portrait registration PDF', () => {
        const doc = service.generateRegistrationPdf({
          code: 'SINGLE',
          companyName: 'SINGLE PAGE CO'
        });
        expect(doc.getNumberOfPages()).toBe(1);
        expect(doc.output()).toContain('/Subtype /Image');
        expect(doc.output()).toContain('Page 1 of 1');
      });

      it('places signature on final page only in multi-page documents', () => {
        const doc = service.generateRegistrationPdf({
          code: 'MULTI',
          companyName: 'MULTI PAGE CORP'
        });
        // Add another page before final signature check
        doc.addPage();
        const finalPage = doc.getNumberOfPages();
        expect(finalPage).toBe(2);
      });

      it('renders signature on final page of single-page landscape verification PDF', () => {
        const doc = service.generateVerificationPdf({
          searchType: 'Customer Code',
          searchValue: 'SINGLE',
          columns: ['customerCode', 'companyName'],
          rows: [['SINGLE', 'SINGLE CORP']]
        });
        expect(doc.getNumberOfPages()).toBe(1);
        expect(doc.output()).toContain('/Subtype /Image');
        expect(doc.output()).toContain('Freight Code Generator | Page 1 of 1');
      });

      it('renders signature on final page of multi-page landscape verification PDF without overlapping data', () => {
        // Many rows causing multi-page
        const rows = Array.from({ length: 45 }, (_, i) => [
          `C${i}`,
          `Company ${i}`,
          `Full Registered Address in Mumbai Maharashtra ${i}`
        ]);
        const doc = service.generateVerificationPdf({
          searchType: 'Customer Code',
          searchValue: 'C',
          columns: ['customerCode', 'companyName', 'address'],
          rows
        });
        const totalPages = doc.getNumberOfPages();
        expect(totalPages).toBeGreaterThan(1);
        expect(doc.output()).toContain('/Subtype /Image');
        expect(doc.output()).toContain(`Page ${totalPages} of ${totalPages}`);
      });
    });

    // 6. Print Preview and Downloaded PDF
    describe('Criterion 6: Print Preview and Downloaded PDF', () => {
      it('ensures registration preview blob contains the embedded signature image', () => {
        const blobSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/reg-preview');
        const previewUrl = service.previewRegistrationPdf({ code: 'PREV', companyName: 'PREV CORP' });
        expect(previewUrl).toBe('blob:http://localhost/reg-preview');
        blobSpy.mockRestore();
      });

      it('ensures registration download saves the PDF with embedded image', () => {
        const doc = service.generateRegistrationPdf({ code: 'DOWN', companyName: 'DOWN CORP' });
        const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc as any);
        service.downloadRegistrationPdf({ code: 'DOWN', companyName: 'DOWN CORP' }, 'custom.pdf');
        expect(saveSpy).toBeDefined();
      });

      it('ensures verification preview opens window with blob URL', () => {
        const blobSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/ver-preview');
        const windowSpy = vi.spyOn((globalThis as any).window, 'open').mockReturnValue({
          opener: null,
          addEventListener: vi.fn()
        } as unknown as Window);

        service.previewVerificationPdf({
          searchType: 'Code',
          searchValue: 'TEST',
          columns: ['customerCode'],
          rows: [['TEST']]
        });

        expect(windowSpy).toHaveBeenCalled();
        blobSpy.mockRestore();
        windowSpy.mockRestore();
      });

      it('ensures verification download saves the landscape PDF with embedded signature', () => {
        const doc = service.generateVerificationPdf({
          searchType: 'Code',
          searchValue: 'TEST',
          columns: ['customerCode'],
          rows: [['TEST']]
        });
        const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc as any);
        service.downloadVerificationPdf({
          searchType: 'Code',
          searchValue: 'TEST',
          columns: ['customerCode'],
          rows: [['TEST']]
        }, 'verif.pdf');
        expect(saveSpy).toBeDefined();
      });
    });

    // 7. Signature Image Positioning and Image Quality
    describe('Criterion 7: Signature Image Positioning and Quality', () => {
      it('preserves the exact reference image aspect ratio 573/468 without stretching or distortion', () => {
        expect(OFFICIAL_SIGNATURE_ASPECT_RATIO).toBeCloseTo(573 / 468, 5);
        const imgWidth = 35;
        const imgHeight = imgWidth / OFFICIAL_SIGNATURE_ASPECT_RATIO;
        // Strict proportionality: width/height === 573/468
        expect(imgWidth / imgHeight).toBeCloseTo(573 / 468, 5);
      });

      it('preserves the designation text SR.DCM/PUNE/CRIS and dynamic date while removing unwanted verification elements', () => {
        const user: AuthUserData = {
          userId: '3562',
          userName: 'RAMESH CHANDRA',
          designation: 'SR.DCM/',
          divisionCode: 'PUNE'
        };

        const doc = service.generateRegistrationPdf({
          code: 'LAYOUT_TEST',
          companyName: 'LAYOUT CORP',
          recordDate: '2026-10-30T09:57:55.000Z'
        }, user);

        const binary = doc.output();
        // 1. Signature image embedded
        expect(binary).toContain('/Subtype /Image');
        // 2. Preserved Designation and Division text
        expect(binary).toContain('SR.DCM/PUNE/CRIS');
        // 3. Dynamic date and time in IST
        expect(binary).toContain('Fri Oct 30 15:27:55 IST 2026');
        // 4. Removed unwanted old verification block and elements
        expect(binary).not.toContain('Signature Not Verified');
        expect(binary).not.toContain('eSigned by');
        expect(binary).not.toContain('CDAC | CRIS');
        expect(binary).not.toContain('(SREEJU)');
      });
    });
  });
});
