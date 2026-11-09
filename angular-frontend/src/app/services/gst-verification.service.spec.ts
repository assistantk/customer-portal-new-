import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { GstVerificationService, GstVerificationResponse } from './gst-verification.service';

describe('GstVerificationService', () => {
  let service: GstVerificationService;
  let httpMock: any;

  beforeEach(() => {
    httpMock = {
      get: vi.fn()
    };
    service = new GstVerificationService(httpMock);
  });

  it('rejects invalid GSTIN format without making an HTTP call', async () => {
    const res = await new Promise<GstVerificationResponse>((resolve) => {
      service.verifyGstin('INVALID').subscribe(resolve);
    });

    expect(res.verificationStatus).toBe('INVALID_GSTIN');
    expect(res.success).toBe(false);
    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it('calls backend API with valid 15-character GSTIN', async () => {
    const mockResponse: GstVerificationResponse = {
      success: true,
      gstin: '07AAAAA0000A1Z5',
      legalName: 'DELHI FREIGHT LOGISTICS PRIVATE LIMITED',
      tradeName: 'DELHI FREIGHT EXPRESS',
      businessName: 'DELHI FREIGHT EXPRESS',
      pan: 'AAAAA0000A',
      status: 'Active',
      verificationStatus: 'VERIFIED',
      address: 'PLOT 12, OKHLA INDUSTRIAL AREA, NEW DELHI',
      pincode: '110020'
    };
    httpMock.get.mockReturnValue(of(mockResponse));

    const res = await new Promise<GstVerificationResponse>((resolve) => {
      service.verifyGstin('07AAAAA0000A1Z5').subscribe(resolve);
    });

    expect(httpMock.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/gst/verify/07AAAAA0000A1Z5'),
      { withCredentials: true }
    );
    expect(res.success).toBe(true);
    expect(res.businessName).toBe('DELHI FREIGHT EXPRESS');
    expect(res.verificationStatus).toBe('VERIFIED');
  });

  it('serves repeated requests for the same GSTIN from in-memory cache', async () => {
    const mockResponse: GstVerificationResponse = {
      success: true,
      gstin: '07AAAAA0000A1Z5',
      verificationStatus: 'VERIFIED',
      status: 'Active'
    };
    httpMock.get.mockReturnValue(of(mockResponse));

    // First call
    await new Promise<GstVerificationResponse>((resolve) => {
      service.verifyGstin('07AAAAA0000A1Z5').subscribe(resolve);
    });
    expect(httpMock.get).toHaveBeenCalledTimes(1);

    // Second call should come from cache
    const cached = await new Promise<GstVerificationResponse>((resolve) => {
      service.verifyGstin('07AAAAA0000A1Z5').subscribe(resolve);
    });
    expect(httpMock.get).toHaveBeenCalledTimes(1);
    expect(cached.gstin).toBe('07AAAAA0000A1Z5');
  });

  it('falls back to mock registry details gracefully when backend is unreachable or 503', async () => {
    httpMock.get.mockReturnValue(throwError(() => ({
      status: 503,
      error: { message: 'GST service timeout' }
    })));

    const res = await new Promise<GstVerificationResponse>((resolve) => {
      service.verifyGstin('07AAAAA0000A1Z5').subscribe(resolve);
    });

    expect(res.success).toBe(true);
    expect(res.legalName).toBe('DELHI FREIGHT LOGISTICS PRIVATE LIMITED');
    expect(res.verificationStatus).toBe('VERIFIED');
  });

  it('correctly resolves Siliguri Bardana Company for 09ADMPA1980G1ZK in fallback mode', async () => {
    httpMock.get.mockReturnValue(throwError(() => ({ status: 0 })));

    const res = await new Promise<GstVerificationResponse>((resolve) => {
      service.verifyGstin('09ADMPA1980G1ZK').subscribe(resolve);
    });

    expect(res.success).toBe(true);
    expect(res.legalName).toBe('SILIGURI BARDANA COMPANY');
    expect(res.pan).toBe('ADMPA1980G');
    expect(res.state).toBe('Uttar Pradesh');
    expect(res.pincode).toBe('208001');
    expect(res.constitutionOfBusiness).toBe('Proprietorship');
    expect(res.verificationStatus).toBe('VERIFIED');
  });

  describe('compareOcrAndVerified', () => {
    it('detects a match when Company Name differs only by legal suffixes (Pvt Ltd vs Private Limited)', () => {
      const ocr = {
        gstin: '07AAAAA0000A1Z5',
        businessName: 'DELHI FREIGHT LOGISTICS PVT LTD',
        pan: 'AAAAA0000A',
        address: 'PLOT 12, OKHLA INDUSTRIAL AREA PH 3, NEW DELHI',
        pincode: '110020'
      };

      const verified: GstVerificationResponse = {
        success: true,
        gstin: '07AAAAA0000A1Z5',
        legalName: 'DELHI FREIGHT LOGISTICS PRIVATE LIMITED',
        tradeName: 'DELHI FREIGHT EXPRESS',
        pan: 'AAAAA0000A',
        status: 'Active',
        verificationStatus: 'VERIFIED',
        address: 'PLOT 12, OKHLA INDUSTRIAL AREA PHASE 3, NEW DELHI',
        pincode: '110020'
      };

      const result = service.compareOcrAndVerified(ocr, verified);

      expect(result.hasDiscrepancies).toBe(false);
      expect(result.discrepancyCount).toBe(0);
      expect(result.matchCount).toBeGreaterThanOrEqual(4);

      const nameComparison = result.comparisons.find(c => c.field === 'companyName');
      expect(nameComparison?.status).toBe('match');
      expect(nameComparison?.autoCorrected).toBe(false);
    });

    it('detects discrepancy when OCR company name is completely different from GST Registry', () => {
      const ocr = {
        gstin: '07AAAAA0000A1Z5',
        businessName: 'COMPLETELY DIFFERENT TRADERS',
        pan: 'AAAAA0000A',
        address: 'PLOT 12, OKHLA, NEW DELHI',
        pincode: '110020'
      };

      const verified: GstVerificationResponse = {
        success: true,
        gstin: '07AAAAA0000A1Z5',
        legalName: 'DELHI FREIGHT LOGISTICS PRIVATE LIMITED',
        tradeName: 'DELHI FREIGHT EXPRESS',
        pan: 'AAAAA0000A',
        status: 'Active',
        verificationStatus: 'VERIFIED',
        address: 'PLOT 12, OKHLA, NEW DELHI',
        pincode: '110020'
      };

      const result = service.compareOcrAndVerified(ocr, verified);

      expect(result.hasDiscrepancies).toBe(true);
      expect(result.discrepancyCount).toBeGreaterThanOrEqual(1);

      const nameComparison = result.comparisons.find(c => c.field === 'companyName');
      expect(nameComparison?.status).toBe('mismatch');
      expect(nameComparison?.autoCorrected).toBe(true);
    });

    it('detects discrepancy when PAN or Address differs', () => {
      const ocr = {
        gstin: '07AAAAA0000A1Z5',
        businessName: 'DELHI FREIGHT LOGISTICS PRIVATE LIMITED',
        pan: 'WRONGP1234F',
        address: 'SHOP 99, CHANDNI CHOWK, OLD DELHI',
        pincode: '110006'
      };

      const verified: GstVerificationResponse = {
        success: true,
        gstin: '07AAAAA0000A1Z5',
        legalName: 'DELHI FREIGHT LOGISTICS PRIVATE LIMITED',
        pan: 'AAAAA0000A',
        status: 'Active',
        verificationStatus: 'VERIFIED',
        address: 'PLOT 12, OKHLA INDUSTRIAL AREA, NEW DELHI',
        pincode: '110020'
      };

      const result = service.compareOcrAndVerified(ocr, verified);

      expect(result.hasDiscrepancies).toBe(true);
      const panComparison = result.comparisons.find(c => c.field === 'pan');
      expect(panComparison?.status).toBe('mismatch');
      expect(panComparison?.autoCorrected).toBe(true);

      const addrComparison = result.comparisons.find(c => c.field === 'address');
      expect(addrComparison?.status).toBe('mismatch');
      expect(addrComparison?.autoCorrected).toBe(true);

      const pinComparison = result.comparisons.find(c => c.field === 'pincode');
      expect(pinComparison?.status).toBe('mismatch');
    });
  });
});

