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
  });
});

