import { ChangeDetectorRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerRegistrationComponent } from './customer-registration.component';
import { CustomerService } from '../../services/customer.service';
import { PanOcrService } from '../../services/pan-ocr.service';
import { NotificationService } from '../../services/notification.service';
import { BehaviorSubject, of, throwError, Subject } from 'rxjs';

describe('CustomerRegistrationComponent - Submission and Loading State', () => {
  let component: CustomerRegistrationComponent;
  let customerServiceMock: any;
  let panOcrServiceMock: any;
  let notificationService: NotificationService;
  let cdrMock: ChangeDetectorRef;
  let authUserSubject: BehaviorSubject<any>;
  let authServiceMock: any;
  let gstVerificationServiceMock: any;

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
      expect(component.errors['gstin_0_gstin']).toBe('GSTIN could not be detected. Please enter your GSTIN manually to fetch your registered details.');
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
  });

  describe('GSTIN Verification and Automatic Data Fetching', () => {
    beforeEach(() => {
      gstVerificationServiceMock = {
        verifyGstin: vi.fn().mockImplementation((gstin: string) => of({
          success: true,
          gstin,
          legalName: 'RELIANCE INDUSTRIES LIMITED',
          tradeName: 'RELIANCE',
          businessName: 'RELIANCE INDUSTRIES LIMITED',
          pan: gstin.substring(2, 12),
          status: 'Active',
          registrationDate: '01/07/2017',
          constitutionOfBusiness: 'Public Limited Company',
          taxpayerType: 'Regular',
          address: '3RD FLOOR, MAKER CHAMBER IV, 222 NARIMAN POINT, MUMBAI, 400021',
          city: 'MUMBAI',
          state: 'Maharashtra',
          pincode: '400021',
          verificationStatus: 'VERIFIED'
        })),
        compareOcrAndVerified: vi.fn().mockImplementation((ocr, verified) => {
          const comparisons = [
            {
              field: 'gstin',
              label: 'GSTIN',
              ocrValue: ocr.gstin || '',
              verifiedValue: verified.gstin || '',
              status: ocr.gstin === verified.gstin ? 'match' : 'mismatch',
              autoCorrected: false
            },
            {
              field: 'companyName',
              label: 'Legal / Trade Name',
              ocrValue: ocr.businessName || ocr.tradeName || ocr.legalName || '',
              verifiedValue: verified.businessName || verified.legalName || verified.tradeName || '',
              status: (ocr.legalName === verified.legalName) ? 'match' : 'mismatch',
              autoCorrected: true
            }
          ];
          const hasDiscrepancies = comparisons.some((c: any) => c.status === 'mismatch');
          return {
            gstin: verified.gstin,
            verificationStatus: verified.verificationStatus,
            registrationStatus: verified.status || 'Active',
            hasDiscrepancies,
            discrepancyCount: hasDiscrepancies ? 1 : 0,
            matchCount: hasDiscrepancies ? 1 : 2,
            comparisons,
            verifiedData: verified,
            ocrData: ocr
          };
        })
      };

      component = new CustomerRegistrationComponent(
        customerServiceMock as CustomerService,
        panOcrServiceMock as PanOcrService,
        notificationService,
        cdrMock,
        undefined,
        undefined,
        authServiceMock,
        gstVerificationServiceMock
      );
    });

    it('should automatically initiate GSTIN verification after successful OCR and populate form fields', async () => {
      component.mode = 'new';
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '27AAACR7157R1ZR',
        stateName: 'Maharashtra',
        address: 'MAKER CHAMBERS IV, NARIMAN POINT',
        city: 'MUMBAI',
        pincode: '400021',
        tradeName: 'RELIANCE',
        legalName: 'RELIANCE INDUSTRIES LIMITED',
        businessName: 'RELIANCE INDUSTRIES LIMITED',
        pan: 'AAACR7157R',
        panMismatch: false,
        companyNameTooLong: false
      });

      const fakeFile = new File(['dummy-content'], 'gst-cert.pdf', { type: 'application/pdf' });
      const fakeEvent = { target: { files: [fakeFile], value: '' } } as unknown as Event;

      await component.handleGstinFileChange(0, fakeEvent);

      expect(gstVerificationServiceMock.verifyGstin).toHaveBeenCalledWith('27AAACR7157R1ZR', expect.anything());
      expect(component.form.companyName).toBe('RELIANCE');
      expect(component.form.panNumber).toBe('AAACR7157R');
      expect(component.gstins[0].verificationState).toBe('verified');
      expect(component.gstins[0].verificationData?.status).toBe('Active');
    });

    it('should detect discrepancies between OCR data and GST registry, flagging discrepancy state', async () => {
      component.mode = 'new';
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '27AAACR7157R1ZR',
        stateName: 'Maharashtra',
        address: 'TAMPERED ADDRESS STREET 99',
        city: 'MUMBAI',
        pincode: '400021',
        tradeName: 'ALTERED TRADERS',
        legalName: 'ALTERED LEGAL NAME PRIVATE LIMITED',
        businessName: 'ALTERED BUSINESS',
        pan: 'AAACR7157R',
        panMismatch: false,
        companyNameTooLong: false
      });

      const fakeFile = new File(['dummy-content'], 'tampered-cert.pdf', { type: 'application/pdf' });
      const fakeEvent = { target: { files: [fakeFile], value: '' } } as unknown as Event;

      await component.handleGstinFileChange(0, fakeEvent);

      expect(component.gstins[0].verificationState).toBe('discrepancy');
      expect(component.gstins[0].crossCheckResult?.hasDiscrepancies).toBe(true);
      expect(component.activeCrossCheck).toBeDefined();
    });

    it('should allow manual GSTIN verification via verifyGstinAtIndex', () => {
      component.mode = 'new';
      component.gstins[0].gstin = '27AAACR7157R1ZR';

      component.verifyGstinAtIndex(0, false);

      expect(gstVerificationServiceMock.verifyGstin).toHaveBeenCalledWith('27AAACR7157R1ZR');
      expect(component.gstins[0].verificationState).toBe('verified');
      expect(component.form.companyName).toBe('RELIANCE');
      expect(component.form.panNumber).toBe('AAACR7157R');
    });

    it('should reject manual verification if GSTIN format is invalid', () => {
      component.mode = 'new';
      component.gstins[0].gstin = 'INVALID_GST';

      component.verifyGstinAtIndex(0, false);

      expect(gstVerificationServiceMock.verifyGstin).not.toHaveBeenCalled();
      expect(component.errors['gstin_0_gstin']).toBe('Enter a valid 15-character GSTIN.');
    });

    it('should flag cancelled GSTINs and set verificationState to cancelled', () => {
      gstVerificationServiceMock.verifyGstin.mockReturnValue(of({
        success: true,
        gstin: '27CANCL1234F1Z5',
        legalName: 'CANCELLED BUSINESS PVT LTD',
        status: 'Cancelled',
        verificationStatus: 'CANCELLED'
      }));

      component.mode = 'new';
      component.gstins[0].gstin = '27CANCL1234F1Z5';
      component.verifyGstinAtIndex(0, false);

      expect(component.gstins[0].verificationState).toBe('cancelled');
    });

    it('should flag suspended GSTINs and set verificationState to suspended', () => {
      gstVerificationServiceMock.verifyGstin.mockReturnValue(of({
        success: true,
        gstin: '27SUSPN1234F1Z5',
        legalName: 'SUSPENDED BUSINESS PVT LTD',
        status: 'Suspended',
        verificationStatus: 'SUSPENDED'
      }));

      component.mode = 'new';
      component.gstins[0].gstin = '27SUSPN1234F1Z5';
      component.verifyGstinAtIndex(0, false);

      expect(component.gstins[0].verificationState).toBe('suspended');
    });

    it('should enforce 40-character limit with a warning message without silent truncation', () => {
      const longName = 'RELIANCE INDUSTRIAL INFRASTRUCTURE TRANSPORT LOGISTICS SERVICE LIMITED';
      gstVerificationServiceMock.verifyGstin.mockReturnValue(of({
        success: true,
        gstin: '27AAACR7157R1ZR',
        legalName: longName,
        businessName: longName,
        status: 'Active',
        verificationStatus: 'VERIFIED'
      }));

      component.mode = 'new';
      component.gstins[0].gstin = '27AAACR7157R1ZR';
      component.verifyGstinAtIndex(0, false);

      expect(component.form.companyName).toBe(longName);
      expect(component.errors['companyName']).toContain('Company name exceeds the maximum allowed length of 40 characters');
    });

    it('should preserve user manual edits when auto-filling verified data', () => {
      component.mode = 'new';
      component.handleNewCompanyNameChange('My Manually Entered Company', true);

      component.gstins[0].gstin = '27AAACR7157R1ZR';
      component.verifyGstinAtIndex(0, false);

      expect(component.form.companyName).toBe('My Manually Entered Company');
    });

    it('should gracefully handle verification service failure without breaking form submission', () => {
      gstVerificationServiceMock.verifyGstin.mockReturnValue(of({
        success: false,
        gstin: '27AAACR7157R1ZR',
        verificationStatus: 'SERVICE_UNAVAILABLE',
        message: 'GST verification service unreachable.'
      }));

      component.mode = 'new';
      component.form.companyName = 'Existing Preserved Company';
      component.gstins[0].gstin = '27AAACR7157R1ZR';

      component.verifyGstinAtIndex(0, false);

      expect(component.gstins[0].verificationState).toBe('unavailable');
      expect(component.form.companyName).toBe('Existing Preserved Company');
    });

    it('should toggle and dismiss cross-check inspection panel', () => {
      component.gstins[0].verificationData = {
        success: true,
        gstin: '27AAACR7157R1ZR',
        legalName: 'TEST CORP',
        verificationStatus: 'VERIFIED'
      };

      component.toggleCrossCheckView(0);
      expect(component.activeCrossCheckIndex).toBe(0);

      component.dismissCrossCheck();
      expect(component.activeCrossCheckIndex).toBeNull();
      expect(component.activeCrossCheck).toBeNull();
    });

    it('Scenario B: should display fallback error message when OCR fails to detect GSTIN and allow manual entry and verification', async () => {
      component.mode = 'new';
      // Simulate OCR failing to extract a valid GSTIN
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '',
        stateName: '',
        address: '',
        city: '',
        pincode: '',
        tradeName: '',
        legalName: '',
        businessName: '',
        pan: '',
        panMismatch: false,
        companyNameTooLong: false
      });

      const fakeFile = new File(['dummy-content'], 'unclear-gst-cert.pdf', { type: 'application/pdf' });
      const fakeEvent = { target: { files: [fakeFile], value: '' } } as unknown as Event;

      await component.handleGstinFileChange(0, fakeEvent);

      // Verify exact fallback message is shown and scanStatus is set
      expect(component.gstins[0].scanStatus).toBe('notfound');
      expect(component.gstins[0].scanError).toBe('GSTIN could not be detected. Please enter your GSTIN manually to fetch your registered details.');
      expect(component.errors['gstin_0_gstin']).toBe('GSTIN could not be detected. Please enter your GSTIN manually to fetch your registered details.');

      // Now user manually enters the 15-character GSTIN
      component.handleGstinChange(0, { gstin: '09ADMPA1980G1ZK' });
      expect(component.gstins[0].gstin).toBe('09ADMPA1980G1ZK');

      // User clicks "Verify GSTIN"
      gstVerificationServiceMock.verifyGstin.mockReturnValue(of({
        success: true,
        gstin: '09ADMPA1980G1ZK',
        tradeName: 'SILIGURI BARDANA CO',
        legalName: 'SILIGURI BARDANA COMPANY PRIVATE LIMITED',
        businessName: 'SILIGURI BARDANA COMPANY',
        pan: 'ADMPA1980G',
        address: '74/32, Collector Ganj, Kanpur, Uttar Pradesh, 208001',
        city: 'Kanpur',
        pincode: '208001',
        state: 'Uttar Pradesh',
        status: 'Active',
        verificationStatus: 'VERIFIED'
      }));

      const successSpy = vi.spyOn(notificationService, 'success');

      component.verifyGstinAtIndex(0, false);

      expect(gstVerificationServiceMock.verifyGstin).toHaveBeenCalledWith('09ADMPA1980G1ZK');
      expect(component.gstins[0].verificationState).toBe('verified');
      // Preference: Trade Name is preferred over Legal Name
      expect(component.form.companyName).toBe('SILIGURI BARDANA CO');
      expect(component.form.panNumber).toBe('ADMPA1980G');
      expect(component.form.city).toBe('Kanpur');
      expect(component.form.pincode).toBe('208001');
      expect(component.form.address).toBe('74/32,Collector Ganj,Kanpur,Uttar Pradesh,208001');
      expect(successSpy).toHaveBeenCalledWith('GSTIN Verified', 'Official GST registration details retrieved and form populated.');
      expect(component.errors['gstin_0_gstin']).toBeUndefined();
    });

    it('should fall back to Legal Business Name when Trade Name is empty', () => {
      component.mode = 'new';
      component.gstins[0].gstin = '09ADMPA1980G1ZK';

      gstVerificationServiceMock.verifyGstin.mockReturnValue(of({
        success: true,
        gstin: '09ADMPA1980G1ZK',
        tradeName: '',
        legalName: 'LEGAL ENTERPRISE PVT LTD',
        businessName: 'LEGAL ENTERPRISE',
        pan: 'ADMPA1980G',
        status: 'Active',
        verificationStatus: 'VERIFIED'
      }));

      component.verifyGstinAtIndex(0, false);

      expect(component.form.companyName).toBe('LEGAL ENTERPRISE PVT LTD');
    });
  });

  describe('Form Data Isolation and Section Navigation', () => {
    it('clears all unsaved form values and dynamic GSTINs when switching modes', () => {
      authServiceMock.currentUser = { divisionCode: 'TKD' };
      authUserSubject.next(authServiceMock.currentUser);
      component.ngOnInit();

      component.switchMode('new');
      component.form.companyName = 'Acme Steel Works';
      component.form.panNumber = 'ABCDE1234F';
      component.form.address = '123 Industrial Area, Block B';
      component.form.customerCode = 'ACME';
      component.form.state = 'Maharashtra';
      component.addGstin();
      component.gstins[0].gstin = '27ABCDE1234F1Z5';
      component.gstins[0].state = 'Maharashtra';
      component.errors['companyName'] = 'Sample error';

      // Switch to 'old' mode
      component.switchMode('old');

      // Old mode form should be completely clean
      expect(component.form.companyName).toBe('');
      expect(component.form.panNumber).toBe('');
      expect(component.form.address).toBe('');
      expect(component.form.customerCode).toBe('');
      expect(component.gstins.length).toBe(1);
      expect(component.gstins[0].gstin).toBe('');
      expect(component.errors).toEqual({});

      // Entering data in 'old' mode
      component.form.customerCode = 'OLD1';
      component.form.companyName = 'Old Corporation';

      // Switch back to 'new' mode
      component.switchMode('new');
      expect(component.form.companyName).toBe('');
      expect(component.form.customerCode).toBe('');
      // Login division default is reapplied
      expect(component.form.operatingDivision).toBe('Tughlakabad / Delhi Area (TKD)');
    });

    it('cancels pending async timers and clears lookup state on mode switch', () => {
      component.switchMode('old');
      component.lookupLoading = true;
      component.lookupError = 'Previous lookup error';
      component.verifiedCustomerCode = 'TEST';

      component.switchMode('ownership');

      expect(component.lookupLoading).toBe(false);
      expect(component.lookupError).toBe('');
      expect(component.verifiedCustomerCode).toBeNull();
    });
  });

  describe('Submit Request Validation and Enablement (isFormValid)', () => {
    it('isFormValid returns false by default for an empty form', () => {
      component.switchMode('new');
      expect(component.isFormValid()).toBe(false);
    });

    it('isFormValid rejects company name that is whitespace or > 40 chars', () => {
      component.switchMode('new');
      component.form.companyName = '   ';
      expect(component.isFormValid()).toBe(false);

      component.form.companyName = 'A'.repeat(41);
      expect(component.isFormValid()).toBe(false);
    });

    it('isFormValid rejects invalid PAN format or length', () => {
      component.switchMode('new');
      component.form.companyName = 'Valid Company';
      component.form.address = 'Valid Address 123';
      component.form.customerCode = 'VALI';
      component.form.zone = 'Northern Railway (NR)';
      component.form.operatingDivision = 'Tughlakabad / Delhi Area (TKD)';
      component.gstins = [{
        ...component.gstins[0],
        gstin: '27ABCDE1234F1Z5',
        state: 'Maharashtra',
        file: new File(['dummy'], 'cert.pdf', { type: 'application/pdf' })
      }];

      // 9 chars
      component.form.panNumber = 'ABCDE1234';
      expect(component.isFormValid()).toBe(false);

      // 11 chars
      component.form.panNumber = 'ABCDE1234FA';
      expect(component.isFormValid()).toBe(false);

      // invalid format
      component.form.panNumber = '12345ABCDE';
      expect(component.isFormValid()).toBe(false);
    });

    it('isFormValid rejects GSTIN if length != 15 or does not match PAN', () => {
      component.switchMode('new');
      component.form.companyName = 'Valid Company';
      component.form.address = 'Valid Address 123';
      component.form.customerCode = 'VALI';
      component.form.zone = 'Northern Railway (NR)';
      component.form.operatingDivision = 'Tughlakabad / Delhi Area (TKD)';
      component.form.panNumber = 'ABCDE1234F';

      // GSTIN length 14
      component.gstins = [{
        ...component.gstins[0],
        gstin: '27ABCDE1234F1Z',
        state: 'Maharashtra',
        file: new File(['dummy'], 'cert.pdf', { type: 'application/pdf' })
      }];
      expect(component.isFormValid()).toBe(false);

      // GSTIN with different PAN: 27XYZWE1234F1Z5 vs ABCDE1234F
      component.gstins[0].gstin = '27XYZWE1234F1Z5';
      expect(component.isFormValid()).toBe(false);

      // Correct matching GSTIN
      component.gstins[0].gstin = '27ABCDE1234F1Z5';
      expect(component.isFormValid()).toBe(true);
    });

    it('isFormValid returns true when all mandatory fields and validations pass', () => {
      component.switchMode('new');
      component.form.companyName = 'Tata Steel Limited';
      component.form.address = 'Bombay House, 24 Homi Mody Street';
      component.form.customerCode = 'TATA';
      component.form.zone = 'Northern Railway (NR)';
      component.form.operatingDivision = 'Tughlakabad / Delhi Area (TKD)';
      component.form.panNumber = 'AAACT2727Q';
      component.gstins = [{
        ...component.gstins[0],
        gstin: '27AAACT2727Q1ZW',
        state: 'Maharashtra',
        file: new File(['dummy'], 'gst_cert.pdf', { type: 'application/pdf' })
      }];

      expect(component.isFormValid()).toBe(true);
    });
  });
});
