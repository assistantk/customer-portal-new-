import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { VerificationComponent } from './verification.component';
import { CustomerService } from '../../services/customer.service';
import { PdfGeneratorService } from '../../services/pdf-generator.service';

describe('VerificationComponent - PDF Generation Integration', () => {
  let component: VerificationComponent;
  let mockCustomerService: any;
  let mockPdfGenerator: any;
  let mockCdr: ChangeDetectorRef;

  beforeEach(() => {
    mockCustomerService = {
      lookupCustomer: vi.fn(),
      lookupGSTIN: vi.fn(),
      lookupGlobalCode: vi.fn()
    };
    mockPdfGenerator = {
      generateVerificationPdf: vi.fn(),
      previewVerificationPdf: vi.fn(),
      downloadVerificationPdf: vi.fn()
    };
    mockCdr = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn()
    } as unknown as ChangeDetectorRef;

    component = new VerificationComponent(
      mockCustomerService as CustomerService,
      mockCdr,
      mockPdfGenerator as PdfGeneratorService
    );
  });

  it('correctly passes recordDate from creationDate to pdfGeneratorService on preview', () => {
    component.verificationType = 'code';
    component.verifiedSearchValue = 'TISCO';
    component.customers = [{
      customerCode: 'TISCO',
      companyName: 'TATA STEEL LIMITED',
      division: 'SR.DCM/CSTM',
      creationDate: '2026-10-30T09:57:55.000Z',
      panNumber: 'AAACT2727Q'
    }];

    component.printVerificationPreview();

    expect(mockPdfGenerator.previewVerificationPdf).toHaveBeenCalledTimes(1);
    const calledData = mockPdfGenerator.previewVerificationPdf.mock.calls[0][0];
    expect(calledData.searchValue).toBe('TISCO');
    expect(calledData.recordDate).toBe('2026-10-30T09:57:55.000Z');
  });

  it('correctly passes recordDate and formatted filename on download', () => {
    component.verificationType = 'code';
    component.verifiedSearchValue = 'TISCO';
    component.customers = [{
      customerCode: 'TISCO',
      companyName: 'TATA STEEL LIMITED',
      creationDate: '2026-10-30T09:57:55.000Z'
    }];

    component.downloadVerificationPdf();

    expect(mockPdfGenerator.downloadVerificationPdf).toHaveBeenCalledTimes(1);
    const [calledData, filename] = mockPdfGenerator.downloadVerificationPdf.mock.calls[0];
    expect(calledData.recordDate).toBe('2026-10-30T09:57:55.000Z');
    expect(filename).toBe('Global_Customer_Verification_TISCO.pdf');
  });

  it('falls back to null recordDate when record does not have a date', () => {
    component.verificationType = 'gstin';
    component.verifiedSearchValue = '27AAACT2727Q1ZT';
    component.customers = [{
      customerCode: 'TISCO',
      companyName: 'TATA STEEL LIMITED'
      // no date
    }];

    component.downloadVerificationPdf();

    expect(mockPdfGenerator.downloadVerificationPdf).toHaveBeenCalledTimes(1);
    const [calledData, filename] = mockPdfGenerator.downloadVerificationPdf.mock.calls[0];
    expect(calledData.recordDate).toBeNull();
    expect(filename).toBe('GST_Verification_27AAACT2727Q1ZT.pdf');
  });
});

