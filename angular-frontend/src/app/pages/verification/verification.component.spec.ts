import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { VerificationComponent } from './verification.component';
import { CustomerService } from '../../services/customer.service';
import { PdfGeneratorService } from '../../services/pdf-generator.service';
import { of } from 'rxjs';

describe('VerificationComponent - PDF Generation Integration', () => {
  let component: VerificationComponent;
  let mockCustomerService: any;
  let mockPdfGenerator: any;
  let mockCdr: ChangeDetectorRef;

  beforeEach(() => {
    mockCustomerService = {
      lookupCustomer: vi.fn(),
      lookupGSTIN: vi.fn(),
      lookupGlobalCode: vi.fn(),
      lookupOldCustomerJDBC: vi.fn(),
      lookupCustomerByGstinJDBC: vi.fn(),
      searchHandlingAgentsJDBC: vi.fn(),
      searchOwnershipCodesJDBC: vi.fn()
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
    component.verificationType = 'customer';
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
    component.verificationType = 'customer';
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

  it('resets search fields, results and state on navigation event', () => {
    const routerEvents = new Subject<any>();
    const comp = new VerificationComponent(
      mockCustomerService as CustomerService,
      mockCdr,
      mockPdfGenerator as PdfGeneratorService,
      { events: routerEvents.asObservable() } as any
    );
    comp.ngOnInit();

    comp.code = 'TISCO';
    comp.customers = [{ customerCode: 'TISCO', companyName: 'TATA STEEL' }];
    comp.error = 'Some error';

    routerEvents.next(new NavigationEnd(1, '/verify', '/verify'));

    expect(comp.code).toBe('');
    expect(comp.customers).toBeNull();
    expect(comp.error).toBe('');

    comp.ngOnDestroy();
  });

  it('searches and displays existing one-, two-, and three-character codes', () => {
    mockCustomerService.lookupOldCustomerJDBC.mockReturnValue(of({ customerCode: 'A' }));
    component.code = 'A';
    component.verifyCode();
    expect(mockCustomerService.lookupOldCustomerJDBC).toHaveBeenCalledWith('A', 'CODE');
    expect(component.customers).toEqual([{ customerCode: 'A' }]);

    mockCustomerService.searchHandlingAgentsJDBC.mockReturnValue(of([{ code: 'BD' }]));
    component.setVerificationType('agent');
    component.code = 'BD';
    component.verifyCode();
    expect(mockCustomerService.searchHandlingAgentsJDBC).toHaveBeenCalledWith('BD', 'CODE');
    expect(component.customers).toEqual([{ code: 'BD' }]);

    mockCustomerService.searchOwnershipCodesJDBC.mockReturnValue(of([{ ownershipCode: 'MCC' }]));
    component.setVerificationType('ownership');
    component.code = 'MCC';
    component.verifyCode();
    expect(mockCustomerService.searchOwnershipCodesJDBC).toHaveBeenCalledWith('MCC', 'CODE');
    expect(component.customers).toEqual([{ ownershipCode: 'MCC' }]);
  });

  it('defaults to search by Code and toggles searchMode mutually exclusively', () => {
    expect(component.searchMode).toBe('CODE');

    component.code = 'TEST';
    component.customers = [{ customerCode: 'TEST' }];
    component.error = 'Old error';
    component.verifiedSearchValue = 'TEST';

    component.setSearchMode('NAME');
    expect(component.searchMode).toBe('NAME');
    expect(component.code).toBe('');
    expect(component.customers).toBeNull();
    expect(component.error).toBe('');
    expect(component.verifiedSearchValue).toBe('');

    component.setSearchMode('CODE');
    expect(component.searchMode).toBe('CODE');
    expect(component.code).toBe('');
    expect(component.customers).toBeNull();
  });

  it('resets searchMode to CODE when switching verification types', () => {
    component.setSearchMode('NAME');
    expect(component.searchMode).toBe('NAME');

    component.setVerificationType('agent');
    expect(component.searchMode).toBe('CODE');

    component.setSearchMode('NAME');
    component.setVerificationType('ownership');
    expect(component.searchMode).toBe('CODE');

    component.setSearchMode('NAME');
    component.setVerificationType('customer');
    expect(component.searchMode).toBe('CODE');
  });

  it('searches by company name across Global Customer, Agent, and Ownership sections', () => {
    // 1. Global Customer by Company Name
    mockCustomerService.lookupOldCustomerJDBC.mockReturnValue(of([
      { customerCode: 'TISCO', companyName: 'TATA STEEL' }
    ]));
    component.setVerificationType('customer');
    component.setSearchMode('NAME');
    component.code = 'TATA';
    component.verifyCode();

    expect(mockCustomerService.lookupOldCustomerJDBC).toHaveBeenCalledWith('TATA', 'NAME');
    expect(component.customers).toEqual([{ customerCode: 'TISCO', companyName: 'TATA STEEL' }]);

    // 2. Handling Agent by Company Name
    mockCustomerService.searchHandlingAgentsJDBC.mockReturnValue(of([
      { code: 'AGNT1', companyName: 'LOGISTICS LTD' }
    ]));
    component.setVerificationType('agent');
    component.setSearchMode('NAME');
    component.code = 'LOGISTICS';
    component.verifyCode();

    expect(mockCustomerService.searchHandlingAgentsJDBC).toHaveBeenCalledWith('LOGISTICS', 'NAME');
    expect(component.customers).toEqual([{ code: 'AGNT1', companyName: 'LOGISTICS LTD' }]);

    // 3. Ownership by Company Name
    mockCustomerService.searchOwnershipCodesJDBC.mockReturnValue(of([
      { ownershipCode: 'OWN1', companyName: 'FREIGHT CORP' }
    ]));
    component.setVerificationType('ownership');
    component.setSearchMode('NAME');
    component.code = 'FREIGHT';
    component.verifyCode();

    expect(mockCustomerService.searchOwnershipCodesJDBC).toHaveBeenCalledWith('FREIGHT', 'NAME');
    expect(component.customers).toEqual([{ ownershipCode: 'OWN1', companyName: 'FREIGHT CORP' }]);
  });

  it('handles empty search results with appropriate error messages for each mode and section', () => {
    // Customer search by name with no results
    mockCustomerService.lookupOldCustomerJDBC.mockReturnValue(of([]));
    component.setVerificationType('customer');
    component.setSearchMode('NAME');
    component.code = 'UNKNOWN CORP';
    component.verifyCode();
    expect(component.error).toBe('No record found for this Company Name.');

    // Agent search by name with no results
    mockCustomerService.searchHandlingAgentsJDBC.mockReturnValue(of([]));
    component.setVerificationType('agent');
    component.setSearchMode('NAME');
    component.code = 'UNKNOWN AGENT';
    component.verifyCode();
    expect(component.error).toBe('No Handling Agent Company Name found.');

    // Agent search by code with no results
    component.setSearchMode('CODE');
    component.code = 'NONE';
    component.verifyCode();
    expect(component.error).toBe('No Handling Agent Code found.');

    // Ownership search by name with no results
    mockCustomerService.searchOwnershipCodesJDBC.mockReturnValue(of([]));
    component.setVerificationType('ownership');
    component.setSearchMode('NAME');
    component.code = 'UNKNOWN OWNER';
    component.verifyCode();
    expect(component.error).toBe('No Ownership Company Name found.');

    // Ownership search by code with no results
    component.setSearchMode('CODE');
    component.code = 'NONE';
    component.verifyCode();
    expect(component.error).toBe('No Ownership Code found.');
  });
});
