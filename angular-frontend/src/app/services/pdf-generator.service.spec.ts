import { describe, it, expect, beforeEach } from 'vitest';
import { PdfGeneratorService, formatIstTimestamp, RegistrationPdfData } from './pdf-generator.service';
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

    it('safely handles missing division and name without fabricating values', () => {
      mockAuthService.setCurrentUser({
        userId: '9999'
      });

      const sig = service.resolveSignatureDetails();
      expect(sig.signerIdentity).toBe('9999, 9999');
      expect(sig.designationDivisionOrg).toBe('SR.DCM/CSTM/CRIS');
      expect(sig.verifiedStatus).toBe('Signature Not Verified');
    });

    it('allows explicit user override for testing synthetic users', () => {
      const syntheticUser: AuthUserData = {
        userId: '8877',
        userName: 'PRIYA SHARMA',
        designation: 'SR.DCM',
        divisionCode: 'HWH',
        userRole: 'SR-DCM'
      };

      const sig = service.resolveSignatureDetails(syntheticUser, new Date('2026-10-30T09:57:55.000Z'));
      expect(sig.signerIdentity).toBe('PRIYA SHARMA, 8877');
      expect(sig.designationDivisionOrg).toBe('SR.DCM/HWH/CRIS');
    });
  });

  describe('PDF Generation', () => {
    it('generates a valid PDF with correct content and signature block', () => {
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
        generatedAt: new Date('2026-10-30T09:57:55.000Z')
      };

      const doc = service.generateRegistrationPdf(data);
      expect(doc).toBeDefined();

      const output = doc.output('arraybuffer');
      expect(output.byteLength).toBeGreaterThan(1000);

      // Verify the text content in the generated PDF buffer
      const text = String.fromCharCode(...new Uint8Array(output));
      expect(text).toContain('Signature Not Verified');
      expect(text).toContain('eSigned by');
      expect(text).toContain('SREEJU KRISHNAN, 5219');
      expect(text).toContain('SR.DCM/CSTM/CRIS');
      expect(text).toContain('Fri Oct 30 15:27:55 IST 2026');
    });

    it('generates a landscape verification report with retained fields and omits contact details and pincode', () => {
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
