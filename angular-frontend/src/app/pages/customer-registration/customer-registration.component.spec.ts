import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationEnd } from '@angular/router';
import { CustomerRegistrationComponent } from './customer-registration.component';
import { CustomerService } from '../../services/customer.service';
import { PanOcrService } from '../../services/pan-ocr.service';
import { NotificationService } from '../../services/notification.service';
import { ZoneDivisionService } from '../../services/zone-division.service';
import { BehaviorSubject, of, throwError, Subject } from 'rxjs';

describe('CustomerRegistrationComponent - Submission and Loading State', () => {
  let component: CustomerRegistrationComponent;
  let customerServiceMock: any;
  let panOcrServiceMock: any;
  let notificationService: NotificationService;
  let cdrMock: ChangeDetectorRef;
  let authUserSubject: BehaviorSubject<any>;
  let authServiceMock: any;

  beforeEach(() => {
    customerServiceMock = {
      registerCustomer: vi.fn(),
      updateOldCustomerJDBC: vi.fn(),
      submitOwnershipJDBC: vi.fn(),
      verifyDeleteRequest: vi.fn().mockReturnValue(of({
        found: true,
        code: 'ACME01',
        companyName: 'Acme Logistics'
      })),
      submitDeleteRequest: vi.fn().mockReturnValue(of({ message: 'Delete request sent.' })),
      lookupOldCustomerJDBC: vi.fn().mockReturnValue(of({})),
      lookupHandlingAgentJDBC: vi.fn().mockReturnValue(of({})),
      lookupOwnershipJDBC: vi.fn().mockReturnValue(of({
        found: true,
        data: {
          ownershipDesc: 'Railway Division',
          recordSource: 'EXISTING_OWNERSHIP_RECORD'
        }
      })),
      checkOwnershipDuplicate: vi.fn().mockReturnValue(of({ duplicate: false })),
      lookupOwnershipPartyJDBC: vi.fn().mockReturnValue(of({
        found: true,
        data: {
          partyDesc: 'Sample Ownership Address',
          recordSource: 'EXISTING_OWNERSHIP_RECORD'
        }
      })),
      checkOwnershipPartyDuplicate: vi.fn().mockReturnValue(of({ duplicate: false }))
    };
    panOcrServiceMock = {
      extractGstinFromFile: vi.fn()
    };
    notificationService = new NotificationService();
    cdrMock = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn(),
      checkNoChanges: vi.fn(),
      detach: vi.fn(),
      reattach: vi.fn()
    } as unknown as ChangeDetectorRef;
    authUserSubject = new BehaviorSubject<any>(null);
    authServiceMock = { currentUser$: authUserSubject.asObservable(), currentUser: null };

    component = new CustomerRegistrationComponent(
      customerServiceMock as CustomerService,
      panOcrServiceMock as PanOcrService,
      notificationService,
      cdrMock,
      undefined,
      undefined,
      authServiceMock
    );
  });

  it('defaults registration division from login and preserves a manual form choice', () => {
    const loginUser = { divisionCode: 'TKD' };
    authServiceMock.currentUser = loginUser;
    authUserSubject.next(loginUser);

    component.ngOnInit();

    expect(component.form.zone).toBe('Northern Railway (NR)');
    expect(component.form.operatingDivision).toBe('Tughlakabad / Delhi Area (TKD)');
    expect(component.divisions).toContain('Tughlakabad / Delhi Area (TKD)');

    component.chooseZone('Central Railway (CR)');
    authUserSubject.next({ divisionCode: 'DLI' });
    expect(component.form.zone).toBe('Central Railway (CR)');
    expect(component.form.operatingDivision).toBe('');
    expect(loginUser.divisionCode).toBe('TKD');
    component.ngOnDestroy();
  });

  describe('New Entry Flow (mode: new)', () => {
    beforeEach(() => {
      component.mode = 'new';
      component.form = {
        companyName: 'Test Corporation',
        customerCode: 'TCOR',
        address: '123 Main Street',
        city: 'Delhi',
        pincode: '110001',
        panNumber: 'ABCDE1234F',
        operatingDivision: 'Delhi (DLI)',
        zone: 'Northern Railway (NR)',
        email: 'test@example.com',
        mobile: '9876543210'
      };
      component.gstins = [
        {
          state: 'Delhi',
          gstin: '07ABCDE1234F1Z5',
          file: null,
          existingFileName: 'gstin_delhi.pdf',
          scanning: false,
          scanStatus: 'idle',
          scanError: ''
        }
      ];
    });

    it('should set loading to true while request in flight and reset to false on success', () => {
      const responseSubject = new Subject<any>();
      customerServiceMock.registerCustomer.mockReturnValue(responseSubject.asObservable());

      const successSpy = vi.spyOn(notificationService, 'success');

      component.submit();

      // While in flight
      expect(component.loading).toBe(true);
      expect(customerServiceMock.registerCustomer).toHaveBeenCalled();

      // Complete request
      responseSubject.next({
        success: true,
        message: 'Request email sent to DBA. Database changes are pending DBA execution.',
        customerCode: 'TCOR'
      });
      responseSubject.complete();

      // After completion
      expect(component.loading).toBe(false);
      expect(successSpy).toHaveBeenCalledWith(
        'Request Submitted Successfully',
        'Your request has been submitted successfully, and the SQL query has been sent to the DBA for execution.'
      );
      expect(component.notice).toContain('TCOR');
    });

    it('rejects company names longer than 40 characters', () => {
      component.form.companyName = 'A'.repeat(41);

      expect(component.validate()).toBe(false);
      expect(component.errors['companyName']).toBe('Company name cannot exceed 40 characters.');
    });

    it('allows a new registration when city is blank or whitespace', () => {
      component.form.city = '   ';

      expect(component.validate()).toBe(true);
      expect(component.errors['city']).toBeUndefined();
    });

    it('submits a new registration when city is empty', () => {
      component.form.city = '';
      customerServiceMock.registerCustomer.mockReturnValue(of({ success: true, customerCode: 'TCOR' }));

      component.submit();

      expect(customerServiceMock.registerCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ city: '' }),
        expect.any(Array)
      );
    });

    it('should reset loading to false and display error notification on HTTP error', () => {
      customerServiceMock.registerCustomer.mockReturnValue(
        throwError(() => ({
          status: 500,
          error: { message: 'Failed to send DBA email: Mail server timeout' }
        }))
      );

      const errorSpy = vi.spyOn(notificationService, 'error');

      component.submit();

      expect(component.loading).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        'Submission Failed',
        'Failed to send DBA email: Mail server timeout'
      );
      expect(component.notice).toContain('Failed to send DBA email');
    });

    it('should display friendly message on network failure (status 0) and reset loading', () => {
      customerServiceMock.registerCustomer.mockReturnValue(
        throwError(() => ({
          status: 0,
          message: 'Http failure response for /api/customers/new-register: 0 Unknown Error'
        }))
      );

      const errorSpy = vi.spyOn(notificationService, 'error');

      component.submit();

      expect(component.loading).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        'Submission Failed',
        'Unable to connect to the server. Please check your network connection and try again.'
      );
    });

    it('should prevent duplicate submission while already submitting', () => {
      const responseSubject = new Subject<any>();
      customerServiceMock.registerCustomer.mockReturnValue(responseSubject.asObservable());

      component.submit();
      expect(component.loading).toBe(true);
      expect(customerServiceMock.registerCustomer).toHaveBeenCalledTimes(1);

      // Attempt second submission
      component.submit();
      expect(customerServiceMock.registerCustomer).toHaveBeenCalledTimes(1);

      responseSubject.next({ success: true });
      responseSubject.complete();
      expect(component.loading).toBe(false);
    });
  });

  describe('Old User Flow (mode: old)', () => {
    beforeEach(() => {
      component.mode = 'old';
      component.form = {
        companyName: 'Old User Logistics',
        customerCode: 'OLD1',
        address: '456 Railway Road',
        city: 'Mumbai',
        pincode: '400001',
        panNumber: 'ABCDE1234F',
        email: 'old@example.com',
        mobile: '9876543210'
      };
      component.gstins = [
        {
          state: 'Maharashtra',
          gstin: '27ABCDE1234F1Z5',
          file: null,
          existingFileName: '',
          scanning: false,
          scanStatus: 'idle',
          scanError: ''
        }
      ];
    });

    it('submits an existing-record update when city is empty', () => {
      component.form.city = '   ';
      customerServiceMock.updateOldCustomerJDBC.mockReturnValue(of({ success: true }));

      expect(component.validate()).toBe(true);
      component.submit();

      expect(customerServiceMock.updateOldCustomerJDBC).toHaveBeenCalledWith(
        expect.objectContaining({ city: '   ' }),
        expect.any(Array)
      );
      expect(customerServiceMock.updateOldCustomerJDBC.mock.calls[0][0].operatingDivision).toBeUndefined();
    });

    it('sends the division only after the user changes it', () => {
      customerServiceMock.updateOldCustomerJDBC.mockReturnValue(of({ success: true }));
      component.chooseDivision('Mumbai (CSTM)');

      component.submit();

      expect(customerServiceMock.updateOldCustomerJDBC).toHaveBeenCalledWith(
        expect.objectContaining({
          pincode: '400001',
          operatingDivision: 'Mumbai (CSTM)'
        }),
        expect.any(Array)
      );
    });

    it('loads the legacy customer details after entering a four-character code', () => {
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of({
        companyName: 'Legacy Company',
        address: 'Railway Road',
        city: 'Delhi',
        pincode: '110001',
        panNumber: 'ABCDE1234F',
        gstinNumbers: '07ABCDE1234F1Z5',
        division: 'SR.DCM/RNY'
      }));

      vi.useFakeTimers();
      component.handleOldCodeChange('SAEB');
      vi.advanceTimersByTime(800);

      expect(customerServiceMock.lookupOldCustomerJDBC).toHaveBeenCalledWith('SAEB');
      expect(component.form.companyName).toBe('Legacy Company');
      expect(component.form.address).toBe('Railway Road');
      expect(component.form.city).toBe('Delhi');
      expect(component.form.pincode).toBe('110001');
      expect(component.form.zone).toBe('Northeast Frontier Railway (NFR)');
      expect(component.form.operatingDivision).toBe('Rangiya (RNY)');
      expect(component.form.panNumber).toBe('ABCDE1234F');
      expect(component.verifiedCustomerCode).toBe('SAEB');
      expect(component.lookupDone).toBe(true);
      expect(component.lookupLoading).toBe(false);
      vi.useRealTimers();
    });

    it('preserves the verified customer and code through GSTIN edits and submits using that code', () => {
      const customer = {
        companyName: 'Verified Legacy Company',
        address: 'Verified Railway Road',
        city: 'Delhi',
        pincode: '110001',
        panNumber: 'ABCDE1234F',
        email: 'verified@example.com',
        mobile: '9876543210',
        gstinNumbers: '27ABCDE1234F1Z5'
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(customer));
      customerServiceMock.updateOldCustomerJDBC.mockReturnValue(of({
        success: true,
        message: 'Request email sent to DBA.'
      }));

      vi.useFakeTimers();
      component.handleOldCodeChange('SAEB');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      component.addGstin();
      component.handleGstinChange(1, { gstin: '07ABCDE1234F1Z5' });
      component.addGstin();
      component.handleGstinChange(2, { gstin: '29ABCDE1234F1Z5' });
      component.addGstin();
      component.handleGstinChange(3, { gstin: '06ABCDE1234F1Z5' });
      component.removeGstin(2);

      expect(component.verifiedCustomerCode).toBe('SAEB');
      expect(component.form.customerCode).toBe('SAEB');
      expect(component.form.companyName).toBe(customer.companyName);
      expect(component.form.address).toBe(customer.address);
      expect(component.form.panNumber).toBe(customer.panNumber);
      expect(component.gstins.map((entry) => entry.gstin)).toEqual([
        '27ABCDE1234F1Z5',
        '07ABCDE1234F1Z5',
        '06ABCDE1234F1Z5'
      ]);

      component.submit();

      expect(customerServiceMock.updateOldCustomerJDBC).toHaveBeenCalledWith(
        expect.objectContaining({ customerCode: 'SAEB', companyName: customer.companyName }),
        expect.arrayContaining([
          expect.objectContaining({ gstin: '27ABCDE1234F1Z5' }),
          expect.objectContaining({ gstin: '07ABCDE1234F1Z5' }),
          expect.objectContaining({ gstin: '06ABCDE1234F1Z5' })
        ])
      );
    });

    it('keeps fetched Old User details and all GSTIN rows when OCR scans another GSTIN', async () => {
      component.verifiedCustomerCode = 'SAEB';
      component.form = {
        ...component.form,
        customerCode: 'SAEB',
        companyName: 'Verified Legacy Company',
        address: 'Verified Railway Road',
        city: 'Delhi',
        pincode: '110001',
        panNumber: 'ABCDE1234F'
      };
      component.addGstin();
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '07ABCDE1234F1Z5',
        businessName: 'OCR Company',
        pan: 'ABCDE1234F',
        address: 'OCR Address',
        city: 'Mumbai',
        pincode: '400001',
        stateName: 'Delhi'
      });
      const file = new File(['pdf'], 'gstin.pdf', { type: 'application/pdf' });

      await component.handleGstinFileChange(1, {
        target: { files: [file], value: 'gstin.pdf' }
      } as unknown as Event);

      expect(component.verifiedCustomerCode).toBe('SAEB');
      expect(component.form.customerCode).toBe('SAEB');
      expect(component.form.companyName).toBe('Verified Legacy Company');
      expect(component.form.address).toBe('Verified Railway Road');
      expect(component.form.city).toBe('Delhi');
      expect(component.form.pincode).toBe('110001');
      expect(component.form.panNumber).toBe('ABCDE1234F');
      expect(component.gstins).toHaveLength(2);
      expect(component.gstins[1].gstin).toBe('07ABCDE1234F1Z5');
    });

    it('shows a lookup error and clears loading state when the legacy lookup fails', () => {
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(throwError(() => ({
        status: 500,
        error: { message: 'Database lookup failed' }
      })));

      vi.useFakeTimers();
      component.handleOldCodeChange('SAEB');
      vi.advanceTimersByTime(800);

      expect(component.lookupError).toBe('Database lookup failed');
      expect(component.lookupLoading).toBe(false);
      vi.useRealTimers();
    });

    it('should reset loading to false and display success notification on Old User update', () => {
      customerServiceMock.updateOldCustomerJDBC.mockReturnValue(
        of({
          success: true,
          message: 'Request email sent to DBA. Database changes are pending DBA execution.'
        })
      );

      const successSpy = vi.spyOn(notificationService, 'success');

      component.submit();

      expect(component.loading).toBe(false);
      expect(customerServiceMock.updateOldCustomerJDBC).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalledWith(
        'Request Submitted Successfully',
        'Your request has been submitted successfully, and the SQL query has been sent to the DBA for execution.'
      );
    });

    it('should reset loading to false and display error notification on Old User update failure', () => {
      customerServiceMock.updateOldCustomerJDBC.mockReturnValue(
        throwError(() => ({
          status: 400,
          error: { message: 'Customer code not found in database' }
        }))
      );

      const errorSpy = vi.spyOn(notificationService, 'error');

      component.submit();

      expect(component.loading).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        'Submission Failed',
        'Customer code not found in database'
      );
    });

    describe('Ownership lookup flow', () => {
      beforeEach(() => {
        component.mode = 'ownership';
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('fetches ownership section 1 data for a complete four-character code', () => {
        component.handleOwnershipCodeChange('own1');
        expect(customerServiceMock.lookupOwnershipJDBC).not.toHaveBeenCalled();

        vi.advanceTimersByTime(600);

        expect(customerServiceMock.lookupOwnershipJDBC).toHaveBeenCalledWith('OWN1');
        expect(component.form.ownershipAddress).toBe('Railway Division');
        expect(component.ownSection1Found).toBe(true);
        expect(component.ownSection1Loading).toBe(false);
      });

      it('fetches ownership section 2 data for a complete four-character code', () => {
        component.handleOwnershipPartyCodeChange('prt1');

        vi.advanceTimersByTime(600);

        expect(customerServiceMock.lookupOwnershipPartyJDBC).toHaveBeenCalledWith('PRT1');
        expect(component.form.ownershipPartyAddress).toBe('Sample Ownership Address');
        expect(component.ownSection2Found).toBe(true);
        expect(component.ownSection2Loading).toBe(false);
      });

      it('populates global-customer details and marks the record for insertion', () => {
        customerServiceMock.lookupOwnershipJDBC.mockReturnValue(of({
          found: true,
          data: {
            recordSource: 'NEW_RECORD_FROM_GLOBAL_CUSTOMER',
            ownershipDesc: 'Global Company',
            address: 'Global Address',
            panNumber: 'ABCDE1234F',
            city: 'Delhi',
            pincode: '110001',
            gstinNumbers: '07ABCDE1234F1Z5'
          }
        }));

        component.handleOwnershipCodeChange('GLB1');
        vi.advanceTimersByTime(600);

        expect(component.ownSection1Source).toBe('NEW_RECORD_FROM_GLOBAL_CUSTOMER');
        expect(component.form.ownershipAddress).toBe('Global Company');
        expect(component.form.address).toBe('Global Address');
        expect(component.form.panNumber).toBe('ABCDE1234F');
        expect(component.form.city).toBe('Delhi');
        expect(component.form.pincode).toBe('110001');
        expect(component.gstins[0].gstin).toBe('07ABCDE1234F1Z5');
      });

      it('blocks submission when the code is absent from both source tables', () => {
        customerServiceMock.lookupOwnershipJDBC.mockReturnValue(of({ found: false }));
        component.handleOwnershipCodeChange('MISS');
        vi.advanceTimersByTime(600);

        expect(component.ownSection1Source).toBe('INVALID_CODE');
        expect(component.ownSection1LookupError).toContain('does not exist in the Ownership table or Global Customer table');
        expect(component.validate()).toBe(false);
        expect(component.errors['ownershipCode']).toBe(component.ownSection1LookupError);
      });

      it('shows ownership lookup errors instead of silently reporting no record', () => {
        customerServiceMock.lookupOwnershipJDBC.mockReturnValue(throwError(() => ({
          error: { message: 'Ownership lookup unavailable' }
        })));

        component.handleOwnershipCodeChange('OWN1');
        vi.advanceTimersByTime(600);

        expect(component.ownSection1LookupError).toBe('Ownership lookup unavailable');
      });
    });
  });

  describe('Ownership Flow (mode: ownership)', () => {
    beforeEach(() => {
      component.mode = 'ownership';
      component.ownSection1Source = 'EXISTING_OWNERSHIP_RECORD';
      component.ownSection2Source = 'EXISTING_OWNERSHIP_RECORD';
      component.form = {
        companyName: '',
        customerCode: '',
        address: '',
        city: '',
        pincode: '',
        panNumber: '',
        ownershipCode: 'OWN1',
        ownershipAddress: 'Ownership Desc 1',
        ownershipPartyCode: 'PTY1',
        ownershipPartyAddress: 'Party Desc 1'
      };
    });

    it('should reset loading to false and display success notification on Ownership submit', () => {
      customerServiceMock.submitOwnershipJDBC.mockReturnValue(
        of({
          success: true,
          message: 'Request email sent to DBA. Database changes are pending DBA execution.'
        })
      );

      const successSpy = vi.spyOn(notificationService, 'success');

      component.submit();

      expect(component.loading).toBe(false);
      expect(customerServiceMock.submitOwnershipJDBC).toHaveBeenCalledWith(
        'OWN1',
        'Ownership Desc 1',
        'PTY1',
        'Party Desc 1'
      );
      expect(successSpy).toHaveBeenCalledWith(
        'Request Submitted Successfully',
        'Your request has been submitted successfully, and the SQL query has been sent to the DBA for execution.'
      );
    });

    it('should reset loading to false and display error notification on Ownership failure', () => {
      customerServiceMock.submitOwnershipJDBC.mockReturnValue(
        throwError(() => ({
          status: 500,
          error: { message: 'Could not send the request email: SMTP connection failed' }
        }))
      );

      const errorSpy = vi.spyOn(notificationService, 'error');

      component.submit();

      expect(component.loading).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        'Submission Failed',
        'Could not send the request email: SMTP connection failed'
      );
    });
  });

  describe('Address OCR autofill', () => {
    it('displays validation error and does not truncate when OCR extracts company name > 40 chars', async () => {
      component.mode = 'new';
      component.form.companyName = '';
      const longName = 'BHARAT HEAVY LOGISTICS ENTERPRISES PRIVATE LIMITED';
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '07ABCDE1234F1Z5',
        businessName: longName,
        tradeName: longName,
        companyNameTooLong: true,
        address: '10 Industrial Area, Delhi',
        city: 'Delhi',
        pincode: '110001',
        stateName: 'Delhi'
      });
      const file = new File(['pdf'], 'gst.pdf', { type: 'application/pdf' });

      await component.handleGstinFileChange(0, {
        target: { files: [file] }
      } as unknown as Event);

      expect(component.form.companyName).toBe(longName);
      expect(component.errors['companyName']).toBe(
        'Company name exceeds the maximum allowed length of 40 characters. Please verify and shorten it manually.'
      );
    });

    it('displays validation error when OCR extracts a PAN that mismatches GSTIN', async () => {
      component.mode = 'new';
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '07ABCDE1234F1Z5',
        pan: 'XYZAB9999K',
        panMismatch: true,
        businessName: 'Valid Co',
        tradeName: 'Valid Co',
        companyNameTooLong: false,
        address: '10 Industrial Area, Delhi',
        city: 'Delhi',
        pincode: '110001',
        stateName: 'Delhi'
      });
      const file = new File(['pdf'], 'gst.pdf', { type: 'application/pdf' });

      await component.handleGstinFileChange(0, {
        target: { files: [file] }
      } as unknown as Event);

      expect(component.errors['panNumber']).toBe('Extracted PAN does not match the GSTIN.');
    });

    it('clears previous OCR data and populates new certificate data when uploading a certificate', async () => {
      component.mode = 'new';
      // Previously populated Company A data
      component.form.companyName = 'Company A';
      component.form.customerCode = 'COMA';
      component.form.panNumber = 'AAAAA1111A';
      component.form.address = 'Old Address A';
      component.form.city = 'Old City A';
      component.form.pincode = '111111';
      component.gstins[0].gstin = '07AAAAA1111A1Z1';

      // Uploading Certificate B
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '27BBBBB2222B1Z2',
        businessName: 'Company B',
        tradeName: 'Company B',
        pan: 'BBBBB2222B',
        address: 'New Address B, 400001',
        city: 'Mumbai',
        pincode: '400001',
        stateName: 'Maharashtra'
      });
      const fileB = new File(['pdf'], 'cert_b.pdf', { type: 'application/pdf' });
      const mockInput = { files: [fileB], value: 'cert_b.pdf' };

      await component.handleGstinFileChange(0, {
        target: mockInput
      } as unknown as Event);

      // All fields should now contain Company B information only
      expect(component.gstins[0].gstin).toBe('27BBBBB2222B1Z2');
      expect(component.form.companyName).toBe('Company B');
      expect(component.form.panNumber).toBe('BBBBB2222B');
      expect(component.form.address).toContain('New Address B');
      expect(component.form.city).toBe('Mumbai');
      expect(component.form.pincode).toBe('400001');
      expect(mockInput.value).toBe('');
    });

    it('clears previous data and leaves fields empty when new certificate OCR fails', async () => {
      component.mode = 'new';
      // Previously populated Company A data
      component.form.companyName = 'Company A';
      component.form.panNumber = 'AAAAA1111A';
      component.form.address = 'Old Address A';
      component.form.city = 'Old City A';
      component.form.pincode = '111111';
      component.gstins[0].gstin = '07AAAAA1111A1Z1';

      // Certificate B fails OCR
      panOcrServiceMock.extractGstinFromFile.mockRejectedValue(new Error('Corrupt document'));
      const file = new File(['pdf'], 'corrupt.pdf', { type: 'application/pdf' });

      await component.handleGstinFileChange(0, {
        target: { files: [file] }
      } as unknown as Event);

      // Previous data should NOT be retained; all fields must remain empty
      expect(component.form.companyName).toBe('');
      expect(component.form.panNumber).toBe('');
      expect(component.form.address).toBe('');
      expect(component.form.city).toBe('');
      expect(component.form.pincode).toBe('');
      expect(component.gstins[0].gstin).toBe('');
      expect(component.errors['gstin_0_gstin']).toContain('GSTIN could not be extracted');
    });

    it('discards results of older OCR requests when a newer upload is initiated', async () => {
      component.mode = 'new';
      let resolveSlowOcr: (val: any) => void;
      const slowPromise = new Promise((resolve) => { resolveSlowOcr = resolve; });

      panOcrServiceMock.extractGstinFromFile.mockReturnValueOnce(slowPromise);
      const fileA = new File(['pdf'], 'cert_a.pdf', { type: 'application/pdf' });
      const promiseA = component.handleGstinFileChange(0, { target: { files: [fileA] } } as unknown as Event);

      // Now upload Certificate B which resolves quickly
      panOcrServiceMock.extractGstinFromFile.mockResolvedValueOnce({
        gstin: '27BBBBB2222B1Z2',
        businessName: 'Company B',
        pan: 'BBBBB2222B',
        address: 'Address B',
        city: 'Mumbai',
        pincode: '400001'
      });
      const fileB = new File(['pdf'], 'cert_b.pdf', { type: 'application/pdf' });
      await component.handleGstinFileChange(0, { target: { files: [fileB] } } as unknown as Event);

      // Now Certificate A resolves after Certificate B
      resolveSlowOcr!({
        gstin: '07AAAAA1111A1Z1',
        businessName: 'Company A',
        pan: 'AAAAA1111A',
        address: 'Address A',
        city: 'Delhi',
        pincode: '110001'
      });
      await promiseA;

      // Only Company B information should be present in the form
      expect(component.gstins[0].gstin).toBe('27BBBBB2222B1Z2');
      expect(component.form.companyName).toBe('Company B');
      expect(component.form.panNumber).toBe('BBBBB2222B');
      expect(component.form.city).toBe('Mumbai');
    });

    it('rejects a manually entered address longer than 100 characters', () => {
      component.mode = 'old';
      component.form.companyName = 'Test Corporation';
      component.form.customerCode = 'TEST';
      component.form.address = 'A'.repeat(101);
      component.form.city = 'Delhi';
      component.form.panNumber = 'ABCDE1234F';

      expect(component.validate()).toBe(false);
      expect(component.errors['address']).toBe('Address cannot exceed 100 characters.');
    });

    it('calculates normalized address length and removes spaces after commas on blur and submit', () => {
      const enteredAddress = 'SHOP NO 209, EDGE COMMERCIAL COMPLEX, VIDHANSHABHA ROAD, MOWA, RAIPUR, CHHATTISGARH, 492004';
      component.form.address = enteredAddress;
      component.handleAddressInput();
      expect(component.form.address).toBe(enteredAddress);
      expect(component.normalizedAddressLength).toBe(85);

      component.handleAddressBlur();
      expect(component.form.address).toBe('SHOP NO 209,EDGE COMMERCIAL COMPLEX,VIDHANSHABHA ROAD,MOWA,RAIPUR,CHHATTISGARH,492004');

      component.form.address = ' 123 MAIN ST,  APT 4B, NEW DELHI ';
      component.handleAddressBlur();
      expect(component.form.address).toBe('123 MAIN ST,APT 4B,NEW DELHI');
    });

    it('allows typing multiple words and spaces continuously in the GST input field without restriction', () => {
      component.gstins = [{ gstin: '', state: '' }];

      // 1. User can type continuous characters and multiple words with spaces
      component.handleGstinChange(0, { gstin: 'FIRST WORD SECOND WORD 12345' });
      expect(component.gstins[0].gstin).toBe('FIRST WORD SECOND WORD 12345');
      // No validation error during typing
      expect(component.errors['gstin_0_gstin']).toBeUndefined();

      // 2. Spaces and partial editing are retained without being stripped
      component.handleGstinChange(0, { gstin: '27 ABCDE ' });
      expect(component.gstins[0].gstin).toBe('27 ABCDE ');

      // 3. Validation occurs on blur
      component.handleGstinBlur(0);
      expect(component.errors['gstin_0_gstin']).toBe('Enter a valid 15-character GSTIN.');

      // 4. Typing again clears the validation error
      component.handleGstinChange(0, { gstin: '27ABCDE1234F1Z5' });
      expect(component.errors['gstin_0_gstin']).toBeUndefined();

      // 5. Validating on blur with matching PAN passes
      component.form.panNumber = 'ABCDE1234F';
      component.handleGstinBlur(0);
      expect(component.errors['gstin_0_gstin']).toBeUndefined();
    });

    it('allows address that exceeds 100 characters with comma spaces but fits within 100 characters when normalized', () => {
      component.mode = 'old';
      component.form.companyName = 'Test Corporation';
      component.form.customerCode = 'TEST';
      const rawAddress = 'SHOP NO 209, EDGE COMMERCIAL COMPLEX, VIDHANSHABHA ROAD, MOWA, RAIPUR, CHHATTISGARH, 492004, SUITE 101';
      expect(rawAddress.length).toBeGreaterThan(100);
      component.form.address = rawAddress;
      component.form.city = 'Raipur';
      component.form.panNumber = 'ABCDE1234F';

      expect(component.validate()).toBe(true);
      expect(component.errors['address']).toBeUndefined();
      expect(component.form.address.length).toBeLessThanOrEqual(100);
      expect(component.form.address).toBe('SHOP NO 209,EDGE COMMERCIAL COMPLEX,VIDHANSHABHA ROAD,MOWA,RAIPUR,CHHATTISGARH,492004,SUITE 101');
    });
  });

  describe('Delete Request Mode', () => {
    it('shows the selected code-type logo and switches immediately between both delete options', () => {
      component.mode = 'delete';
      expect(component.currentLogo).toBe('assets/portal-logo.webp');
      expect(component.currentLogoAlt).toBe('Freight Code Generator');

      component.onDeleteCodeTypeChange({ target: { value: 'GLOBAL_CUSTOMER' } } as unknown as Event);
      expect(component.currentLogo).toBe('assets/glbl_transparent.webp');
      expect(component.currentLogoAlt).toBe('Global Customer Code Logo');

      component.onDeleteCodeTypeChange({ target: { value: 'HANDLING_AGENT' } } as unknown as Event);
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');
      expect(component.currentLogoAlt).toBe('Handling Agent Code Logo');

      component.onDeleteCodeTypeChange({ target: { value: 'GLOBAL_CUSTOMER' } } as unknown as Event);
      expect(component.currentLogo).toBe('assets/glbl_transparent.webp');
    });

    it('shows a missing-logo fallback and retries the image after changing code type', () => {
      component.mode = 'delete';
      component.onDeleteCodeTypeChange({ target: { value: 'GLOBAL_CUSTOMER' } } as unknown as Event);
      component.deleteCode = 'ACME01';

      component.onCurrentLogoError();

      expect(component.deleteLogoMissing).toBe(true);
      expect(component.deleteCode).toBe('ACME01');

      component.onDeleteCodeTypeChange({ target: { value: 'HANDLING_AGENT' } } as unknown as Event);

      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');
      expect(component.deleteLogoMissing).toBe(false);
    });

    it('verifies a code and requires the company name to match before sending', () => {
      component.mode = 'delete';
      component.deleteCodeType = 'GLOBAL_CUSTOMER';
      component.deleteCode = 'ACME01';

      component.verifyDeleteCode();

      expect(customerServiceMock.verifyDeleteRequest).toHaveBeenCalledWith('GLOBAL_CUSTOMER', 'ACME01');
      expect(component.verifiedDeleteRecord).toEqual({
        codeType: 'GLOBAL_CUSTOMER',
        code: 'ACME01',
        companyName: 'Acme Logistics'
      });

      component.deleteCompanyName = 'Different Company';
      component.sendDeleteRequest();
      expect(customerServiceMock.submitDeleteRequest).not.toHaveBeenCalled();

      component.deleteCompanyName = 'Acme Logistics';
      component.sendDeleteRequest();
      expect(customerServiceMock.submitDeleteRequest).toHaveBeenCalledWith(
        'GLOBAL_CUSTOMER',
        'ACME01',
        'Acme Logistics'
      );
      expect(component.deleteSuccessMessage).toBe('Delete request sent.');
    });

    it('shows the server authorization error instead of reporting a database lookup failure', () => {
      component.mode = 'delete';
      component.deleteCodeType = 'GLOBAL_CUSTOMER';
      component.deleteCode = 'ACME01';
      customerServiceMock.verifyDeleteRequest.mockReturnValue(
        throwError(() => ({ error: { message: 'Access denied. Administrator privileges required.' } }))
      );

      component.verifyDeleteCode();

      expect(component.deleteErrorMessage)
        .toBe('Access denied. Administrator privileges required.');
    });
  });

  describe('Code Type Toggle & Dynamic Logo Switching', () => {
    it('should default to GLOBAL codeType with Global Customer Code logo in old mode', () => {
      component.mode = 'old';
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/portal-logo.webp');
      expect(component.currentLogoAlt).toBe('Freight Code Generator');
    });

    it('should dynamically switch logo when toggling to HANDLING_AGENT in old mode', () => {
      component.mode = 'old';
      component.handleOldCodeTypeChange('HANDLING_AGENT');

      expect(component.codeType).toBe('HANDLING_AGENT');
      expect(component.oldCodeType).toBe('HANDLING_AGENT');
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');
      expect(component.currentLogoAlt).toBe('Handling Agent Code Logo');

      // Switch back to GLOBAL
      component.handleOldCodeTypeChange('GLOBAL');
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/portal-logo.webp');
      expect(component.currentLogoAlt).toBe('Freight Code Generator');
    });

    it('should dynamically switch logo when toggling codeType in new mode', () => {
      component.mode = 'new';
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/glbl_transparent.webp');
      expect(component.currentLogoAlt).toBe('Global Customer Code Logo');

      component.handleNewCodeTypeChange('HANDLING_AGENT');
      expect(component.codeType).toBe('HANDLING_AGENT');
      expect(component.newCodeType).toBe('HANDLING_AGENT');
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');
      expect(component.currentLogoAlt).toBe('Handling Agent Code Logo');

      component.handleNewCodeTypeChange('GLOBAL');
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/glbl_transparent.webp');
    });

    it('should keep Old User and New Entry codeType independent', () => {
      // Set Old User to HANDLING_AGENT
      component.mode = 'old';
      component.handleOldCodeTypeChange('HANDLING_AGENT');
      expect(component.codeType).toBe('HANDLING_AGENT');
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');

      // Switch to New Entry (default GLOBAL)
      component.mode = 'new';
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/glbl_transparent.webp');

      // Switch back to Old User (should remain HANDLING_AGENT)
      component.mode = 'old';
      expect(component.codeType).toBe('HANDLING_AGENT');
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');
    });

    it('resets all text fields on screen navigation while preserving zone and operating division', () => {
      const routerEvents = new Subject<any>();
      const zoneDivisionService = new ZoneDivisionService();
      zoneDivisionService.setSelection('Northern Railway (NR)', 'Delhi (DLI)', true);

      const navRouter = {
        navigate: vi.fn(),
        events: routerEvents.asObservable()
      } as any;

      const testComponent = new CustomerRegistrationComponent(
        customerServiceMock,
        panOcrServiceMock,
        notificationService,
        cdrMock,
        navRouter,
        undefined,
        authServiceMock,
        zoneDivisionService
      );
      testComponent.ngOnInit();

      testComponent.form.companyName = 'Delhi Logistics Pvt Ltd';
      testComponent.form.panNumber = 'ABCDE1234F';
      testComponent.form.address = 'Connaught Place';
      testComponent.form.city = 'New Delhi';
      testComponent.form.pincode = '110001';
      testComponent.form.email = 'delhi@logistics.com';
      testComponent.form.mobile = '9876543210';

      expect(testComponent.form.companyName).toBe('Delhi Logistics Pvt Ltd');
      expect(testComponent.form.zone).toBe('Northern Railway (NR)');
      expect(testComponent.form.operatingDivision).toBe('Delhi (DLI)');

      // Simulate navigation event
      routerEvents.next(new NavigationEnd(1, '/registration', '/registration?reset=true'));

      // Normal text fields should be cleared
      expect(testComponent.form.companyName).toBe('');
      expect(testComponent.form.panNumber).toBe('');
      expect(testComponent.form.address).toBe('');
      expect(testComponent.form.city).toBe('');
      expect(testComponent.form.pincode).toBe('');
      expect(testComponent.form.email).toBe('');
      expect(testComponent.form.mobile).toBe('');

      // Zone and Division MUST be preserved
      expect(testComponent.form.zone).toBe('Northern Railway (NR)');
      expect(testComponent.form.operatingDivision).toBe('Delhi (DLI)');

      testComponent.ngOnDestroy();
    });

    it('preserves zone and division when switching modes between new, old, and ownership', () => {
      component.mode = 'new';
      component.form.zone = 'Western Railway (WR)';
      component.form.operatingDivision = 'Mumbai Central (BCT)';
      component.form.companyName = 'Western Traders';
      component.form.address = 'Marine Drive';

      // Switch mode to old
      component.switchMode('old');

      // Text fields cleared
      expect(component.form.companyName).toBe('');
      expect(component.form.address).toBe('');

      // Zone and Division preserved
      expect(component.form.zone).toBe('Western Railway (WR)');
      expect(component.form.operatingDivision).toBe('Mumbai Central (BCT)');
    });
  });
});
