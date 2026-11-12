import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationEnd } from '@angular/router';
import '../../app-module';
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
      checkOwnershipPartyDuplicate: vi.fn().mockReturnValue(of({ duplicate: false })),
      ocrImage: vi.fn(),
      verifySemGstin: vi.fn().mockReturnValue(of({
        verified: false,
        status: 'UNAVAILABLE',
        message: 'ℹ Verification Unavailable – Unable to connect to office database.'
      }))
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

  it('starts the GSTIN card expanded and preserves manual expand and collapse controls', () => {
    expect(component.gstinCardExpanded).toBe(true);
    expect(component.gstinCollapsed).toBe(false);

    component.toggleGstinExpand();
    expect(component.gstinCardExpanded).toBe(false);
    component.toggleGstinExpand();
    expect(component.gstinCardExpanded).toBe(true);

    component.toggleGstinCollapse();
    expect(component.gstinCollapsed).toBe(true);
    component.toggleGstinCollapse();
    expect(component.gstinCollapsed).toBe(false);
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

  it('updates division reactively across login, logout, and subsequent login with different divisions without browser refresh', () => {
    // 1. Login with TKD
    const userTkd = { divisionCode: 'TKD' };
    authServiceMock.currentUser = userTkd;
    authUserSubject.next(userTkd);

    component.ngOnInit();
    expect(component.form.operatingDivision).toBe('Tughlakabad / Delhi Area (TKD)');
    expect(component.form.zone).toBe('Northern Railway (NR)');

    // 2. Logout: clear session state
    authServiceMock.currentUser = null;
    authUserSubject.next(null);
    expect(component.form.operatingDivision).toBe('');
    expect(component.form.zone).toBe('');

    // 3. Login with DLI: immediately updates to DLI without refresh
    const userDli = { divisionCode: 'DLI' };
    authServiceMock.currentUser = userDli;
    authUserSubject.next(userDli);
    expect(component.form.operatingDivision).toBe('Delhi (DLI)');
    expect(component.form.zone).toBe('Northern Railway (NR)');

    // 4. Logout: clear session state
    authServiceMock.currentUser = null;
    authUserSubject.next(null);
    expect(component.form.operatingDivision).toBe('');
    expect(component.form.zone).toBe('');

    // 5. Login with CSTM: immediately updates to CSTM without refresh
    const userCstm = { divisionCode: 'CSTM' };
    authServiceMock.currentUser = userCstm;
    authUserSubject.next(userCstm);
    expect(component.form.operatingDivision).toBe('Mumbai (CSTM)');
    expect(component.form.zone).toBe('Central Railway (CR)');

    // 6. Logout: clear session state
    authServiceMock.currentUser = null;
    authUserSubject.next(null);
    expect(component.form.operatingDivision).toBe('');
    expect(component.form.zone).toBe('');

    // 7. Login with NGP: immediately updates to NGP without refresh
    const userNgp = { divisionCode: 'NGP' };
    authServiceMock.currentUser = userNgp;
    authUserSubject.next(userNgp);
    expect(component.form.operatingDivision).toBe('Nagpur (NGP)');
    expect(component.form.zone).toBe('Central Railway (CR)');

    component.ngOnDestroy();
  });

  it('uppercases entered customer codes, GSTINs, and PAN in form state', () => {
    vi.useFakeTimers();
    component.triggerOldLookup('ab12', 'GLOBAL');
    component.handleGstinChange(0, { gstin: '27abcde1234f1z5' });
    component.handlePanChange('abcde1234f');

    expect(component.form.customerCode).toBe('AB12');
    expect(component.gstins[0].gstin).toBe('27ABCDE1234F1Z5');
    expect(component.form.panNumber).toBe('ABCDE1234F');

    component.ngOnDestroy();
    vi.useRealTimers();
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
      component.lookupDone = true;
      component.verifiedCustomerCode = 'OLD1';
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
        expect.any(Array),
        expect.any(Array)
      );
      expect(customerServiceMock.updateOldCustomerJDBC.mock.calls[0][0].operatingDivision).toBeUndefined();
    });

    it('rejects repeated GSTINs in an existing-record update', () => {
      component.gstins.push({
        state: 'Maharashtra',
        gstin: '27ABCDE1234F1Z5',
        file: null,
        existingFileName: '',
        scanning: false,
        scanStatus: 'idle',
        scanError: ''
      });

      expect(component.validate()).toBe(false);
      expect(component.errors['gstin_1_gstin']).toBe('GSTIN already added');

      component.submit();
      expect(customerServiceMock.updateOldCustomerJDBC).not.toHaveBeenCalled();
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
        expect.any(Array),
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
      component.selectedGstinAddressIndex = 1;
      component.handleOldCodeChange('SAEB');
      vi.advanceTimersByTime(800);

      expect(component.selectedGstinAddressIndex).toBe(0);
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

    it('maps each returned GSTIN address independently and keeps State separate', () => {
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of({
        companyName: 'Legacy Company',
        customerCode: 'SAEB',
        address: 'Head Office Road',
        city: 'Delhi',
        pincode: '110001',
        panNumber: 'ABCDE1234F',
        gstinNumbers: '27ABCDE1234F1Z5,07ABCDE1234F1Z5',
        gstins: [
          {
            gstin: '27ABCDE1234F1Z5',
            state: 'Maharashtra',
            registeredAddress: 'Location One, Industrial Road'
          },
          {
            gstin: '07ABCDE1234F1Z5',
            state: 'Delhi',
            registeredAddress: 'Location Two, Railway Colony'
          }
        ]
      }));

      vi.useFakeTimers();
      component.handleOldCodeChange('SAEB');
      vi.advanceTimersByTime(800);

      expect(component.gstins.map(({ state, registeredAddress }) => ({ state, registeredAddress }))).toEqual([
        { state: 'Maharashtra', registeredAddress: 'Location One, Industrial Road' },
        { state: 'Delhi', registeredAddress: 'Location Two, Railway Colony' }
      ]);
      expect(component.form.address).toBe('Location One, Industrial Road');

      component.onSelectGstinAddress(1);
      expect(component.form.address).toBe('Location Two, Railway Colony');
      expect(component.gstins[0].registeredAddress).toBe('Location One, Industrial Road');
      expect(component.gstins[1].state).toBe('Delhi');

      component.onSelectGstinAddress(0);
      expect(component.form.address).toBe('Location One, Industrial Road');
      expect(component.gstins[1].registeredAddress).toBe('Location Two, Railway Colony');
      vi.useRealTimers();
    });

    it.each([
      ['Global Customer', 'MSGG', 'lookupOldCustomerJDBC'],
      ['Handling Agent', 'HA123', 'lookupHandlingAgentJDBC']
    ])('loads the exact GSTIN detail after duplicate %s detection', (recordType, code, lookupMethod) => {
      const targetGstin = '07ABCDE1234F1Z5';
      const lookupResult = {
        customerCode: code,
        companyName: 'Existing Company',
        address: 'Parent-table address',
        city: 'Parent city',
        pincode: '000000',
        panNumber: 'ABCDE1234F',
        gstinNumbers: '19ABCDE1234F1Z5,07ABCDE1234F1Z5',
        gstins: [
          {
            gstin: '19ABCDE1234F1Z5',
            registeredAddress: 'Kolkata address',
            city: 'Kolkata',
            pincode: '700001',
            effectiveFrom: '2020-01-01',
            effectiveTo: ''
          },
          {
            gstin: targetGstin,
            registeredAddress: 'Delhi address',
            city: 'Delhi',
            pincode: '110064',
            implementationDate: '2024-01-01',
            effectiveFrom: '2024-02-01',
            effectiveTo: '2025-01-31'
          }
        ]
      };
      customerServiceMock[lookupMethod].mockReturnValue(of(lookupResult));
      component.mode = 'new';
      vi.useFakeTimers();

      component.onGstinUpdateExistingRecord({
        recordType,
        existingCode: code,
        gstin: targetGstin,
        pan: 'ABCDE1234F'
      });
      vi.advanceTimersByTime(800);

      expect(component.mode).toBe('old');
      expect(component.codeType).toBe(recordType === 'Handling Agent' ? 'HANDLING_AGENT' : 'GLOBAL');
      expect(component.form.customerCode).toBe(code);
      expect(component.gstins[component.selectedGstinAddressIndex].gstin).toBe(targetGstin);
      expect(component.form.address).toBe('Delhi address');
      expect(component.form.city).toBe('Delhi');
      expect(component.form.pincode).toBe('110064');
      expect(component.gstins[1]).toMatchObject({
        implementationDate: '2024-01-01',
        effectiveFrom: '2024-02-01',
        effectiveTo: '2025-01-31'
      });
      expect(component.form.panNumber).toBe('ABCDE1234F');
      expect(customerServiceMock[lookupMethod]).toHaveBeenCalledWith(code);

      vi.useRealTimers();
    });

    it('does not select an arbitrary GSTIN for a PAN update with multiple GSTIN details', () => {
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of({
        customerCode: 'MSGG',
        companyName: 'Existing Company',
        panNumber: 'ABCDE1234F',
        gstins: [
          { gstin: '19ABCDE1234F1Z5', registeredAddress: 'Kolkata address', city: 'Kolkata', pincode: '700001' },
          { gstin: '07ABCDE1234F1Z5', registeredAddress: 'Delhi address', city: 'Delhi', pincode: '110064' }
        ]
      }));
      component.mode = 'new';
      component.form.panNumber = 'ABCDE1234F';
      vi.useFakeTimers();

      component.onPanUpdateExistingDetails({
        recordType: 'Global Customer',
        codeType: 'global',
        companyCode: 'MSGG',
        companyName: 'Existing Company',
        pan: 'ABCDE1234F',
        gstins: []
      });
      vi.advanceTimersByTime(800);

      expect(component.form.customerCode).toBe('MSGG');
      expect(component.form.panNumber).toBe('ABCDE1234F');
      expect(component.selectedGstinAddressIndex).toBe(-1);
      expect(component.form.address).toBe('');
      expect(component.form.city).toBe('');
      expect(component.form.pincode).toBe('');
      expect(component.lookupDone).toBe(true);

      vi.useRealTimers();
    });

    it('restores a pending duplicate-update handoff after the registration component is recreated', () => {
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of({
        customerCode: 'MSGG',
        companyName: 'Existing Company',
        panNumber: 'ABCDE1234F',
        gstins: [
          { gstin: '19ABCDE1234F1Z5', registeredAddress: 'Kolkata address', city: 'Kolkata', pincode: '700001' },
          { gstin: '07ABCDE1234F1Z5', registeredAddress: 'Delhi address', city: 'Delhi', pincode: '110064' }
        ]
      }));
      component.mode = 'new';
      vi.useFakeTimers();

      component.onGstinUpdateExistingRecord({
        recordType: 'Global Customer',
        existingCode: 'MSGG',
        gstin: '07ABCDE1234F1Z5',
        pan: 'ABCDE1234F'
      });
      component.ngOnDestroy();

      const recreatedComponent = new CustomerRegistrationComponent(
        customerServiceMock as CustomerService,
        panOcrServiceMock as PanOcrService,
        notificationService,
        cdrMock,
        undefined,
        undefined,
        authServiceMock
      );
      recreatedComponent.ngOnInit();
      vi.advanceTimersByTime(800);

      expect(recreatedComponent.form.customerCode).toBe('MSGG');
      expect(recreatedComponent.gstins[recreatedComponent.selectedGstinAddressIndex].gstin).toBe('07ABCDE1234F1Z5');
      expect(recreatedComponent.form.address).toBe('Delhi address');

      recreatedComponent.ngOnDestroy();
      vi.useRealTimers();
    });

    it.each([
      ['A', 'a'],
      ['BD', 'BD'],
      ['MCC', 'MCC'],
      ['LONG4', 'LONG4']
    ])('looks up and preserves the stored code for existing code %s', (enteredCode, storedCode) => {
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of({
        customerCode: storedCode,
        companyName: 'Legacy Company'
      }));

      vi.useFakeTimers();
      component.handleOldCodeChange(enteredCode);
      vi.advanceTimersByTime(800);

      expect(customerServiceMock.lookupOldCustomerJDBC).toHaveBeenCalledWith(enteredCode.toUpperCase());
      expect(component.verifiedCustomerCode).toBe(storedCode);
      expect(component.form.customerCode).toBe(storedCode);
      expect(component.lookupDone).toBe(true);
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
        gstinNumbers: ''
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

      component.handleGstinChange(0, { gstin: '27ABCDE1234F1Z5' });
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
        ]),
        []
      );
    });

    it('confirms a specific persisted GSTIN removal and submits it without altering other GSTINs', () => {
      component.isOldGstDisabled = true;
      component.gstins = [
        ['27ABCDE1234F1Z5', '2025-01-01 10:00:00'],
        ['29ABCDE1234F1Z7', '2025-01-02 10:00:00'],
        ['06ABCDE1234F1Z3', '2025-01-03 10:00:00'],
        ['07ABCDE1234F1Z4', '2025-01-04 10:00:00']
      ].map(([gstin, effectiveFrom], index) => ({
        state: `State ${index}`,
        gstin,
        gstinId: `detail-${index}`,
        effectiveFrom,
        persistedDetail: true,
        registeredAddress: `Address ${index}`,
        file: null
      }));
      customerServiceMock.updateOldCustomerJDBC.mockReturnValue(of({ success: true }));
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      component.requestGstinRemoval(component.gstins[1]);

      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('29ABCDE1234F1Z7'));
      expect(component.pendingGstinRemovals).toEqual([{
        gstin: '29ABCDE1234F1Z7',
        effectiveFrom: '2025-01-02 10:00:00'
      }]);
      expect(component.gstins).toHaveLength(4);
      expect(component.canRequestGstinRemoval(component.gstins[0])).toBe(true);

      component.submit();

      expect(customerServiceMock.updateOldCustomerJDBC).toHaveBeenCalledWith(
        expect.objectContaining({ customerCode: 'OLD1' }),
        expect.arrayContaining([
          expect.objectContaining({ gstin: '27ABCDE1234F1Z5' }),
          expect.objectContaining({ gstin: '29ABCDE1234F1Z7' }),
          expect.objectContaining({ gstin: '06ABCDE1234F1Z3' }),
          expect.objectContaining({ gstin: '07ABCDE1234F1Z4' })
        ]),
        [{ gstin: '29ABCDE1234F1Z7', effectiveFrom: '2025-01-02 10:00:00' }]
      );
      confirmSpy.mockRestore();
    });

    it('loads per-GSTIN effective dates for the existing Update removal controls', () => {
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of({
        customerCode: 'OLD1',
        companyName: 'Old User Logistics',
        address: '456 Railway Road',
        panNumber: 'ABCDE1234F',
        gstinNumbers: '27ABCDE1234F1Z5,29ABCDE1234F1Z7',
        gstins: [
          { gstin: '27ABCDE1234F1Z5', address: 'Delhi Road', effectiveFrom: '2025-01-01 10:00:00' },
          { gstin: '29ABCDE1234F1Z7', address: 'Karnataka Road', effectiveFrom: '2025-01-02 10:00:00' }
        ]
      }));
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      vi.useFakeTimers();
      component.handleOldCodeChange('OLD1');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.gstins).toHaveLength(2);
      expect(component.gstins[1]).toMatchObject({
        gstin: '29ABCDE1234F1Z7',
        registeredAddress: 'Karnataka Road',
        effectiveFrom: '2025-01-02 10:00:00',
        persistedDetail: true
      });

      component.requestGstinRemoval(component.gstins[1]);
      expect(component.pendingGstinRemovals).toEqual([{
        gstin: '29ABCDE1234F1Z7',
        effectiveFrom: '2025-01-02 10:00:00'
      }]);
      confirmSpy.mockRestore();
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

      it('fetches ownership data for a short existing code', () => {
        component.handleOwnershipCodeChange('a');
        expect(customerServiceMock.lookupOwnershipJDBC).not.toHaveBeenCalled();
        expect(customerServiceMock.lookupOwnershipPartyJDBC).not.toHaveBeenCalled();

        vi.advanceTimersByTime(600);

        expect(customerServiceMock.lookupOwnershipJDBC).toHaveBeenCalledWith('A');
        expect(customerServiceMock.lookupOwnershipPartyJDBC).toHaveBeenCalledWith('A');
        expect(component.form.ownershipAddress).toBe('Railway Division');
        expect(component.ownSection1Found).toBe(true);
        expect(component.ownSection1Loading).toBe(false);
        expect(component.ownSection2Loading).toBe(false);
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
        ownershipPartyCode: 'OWN1',
        ownershipPartyAddress: 'Ownership Desc 1'
      };
    });

    it('submits the same code and company name for both Ownership tables', () => {
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
        'OWN1',
        'Ownership Desc 1'
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
      panOcrServiceMock.extractGstinFromFile.mockRejectedValue(new Error('Unable to open this PDF for OCR. Please upload a valid, unprotected PDF or convert it to an image.'));
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
      expect(component.gstins[0].scanError).toBe('Unable to open this PDF for OCR. Please upload a valid, unprotected PDF or convert it to an image.');
      expect(component.errors['gstin_0_gstin']).toBe('Unable to open this PDF for OCR. Please upload a valid, unprotected PDF or convert it to an image.');
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
    });

    it('keeps scanning status until OCR resolves and forwards page progress to the form', async () => {
      component.mode = 'new';
      let resolveOcr: (value: any) => void;
      const pendingOcr = new Promise((resolve) => { resolveOcr = resolve; });
      panOcrServiceMock.extractGstinFromFile.mockImplementation((_file: File, reportProgress: (message: string) => void) => {
        reportProgress('Scanning page 2 of 3...');
        return pendingOcr;
      });

      const file = new File(['pdf'], 'multi-page.pdf', { type: 'application/pdf' });
      const scan = component.handleGstinFileChange(0, {
        target: { files: [file] }
      } as unknown as Event);

      expect(component.gstins[0].scanning).toBe(true);
      expect(component.gstins[0].scanProgress).toBe('Scanning page 2 of 3...');
      expect(component.gstins[0].scanStatus).toBe('processing');

      resolveOcr!({
        gstin: '27BBBBB2222B1Z2',
        businessName: 'Company B',
        tradeName: 'Company B',
        pan: 'BBBBB2222B',
        city: 'Mumbai'
      });
      await scan;

      expect(component.gstins[0].scanning).toBe(false);
      expect(component.gstins[0].scanStatus).toBe('success');
      expect(component.gstins[0].scanProgress).toBe('');
      expect(component.form.panNumber).toBe('BBBBB2222B');
      expect(component.form.city).toBe('Mumbai');
    });

    it('processes PNG image upload via backend OCR and auto-fills registration form', async () => {
      component.mode = 'new';
      const pngFile = new File(['fake-png-bytes'], 'gst_cert.png', { type: 'image/png' });
      customerServiceMock.ocrImage.mockReturnValue(of({
        success: true,
        gstin: '07AAAAA0000A1Z4',
        pan: 'AAAAA0000A',
        tradeName: 'ACME LOGISTICS',
        businessName: 'ACME LOGISTICS',
        address: '123 CONNAUGHT PLACE, NEW DELHI',
        city: 'Delhi',
        pincode: '110001',
        state: 'Delhi',
        stateName: 'Delhi'
      }));

      await component.handleGstinFileChange(0, {
        target: { files: [pngFile] }
      } as unknown as Event);

      expect(customerServiceMock.ocrImage).toHaveBeenCalledWith(pngFile);
      expect(panOcrServiceMock.extractGstinFromFile).not.toHaveBeenCalled();
      expect(component.gstins[0].gstin).toBe('07AAAAA0000A1Z4');
      expect(component.gstins[0].scanStatus).toBe('success');
      expect(component.form.companyName).toBe('ACME LOGISTICS');
      expect(component.form.panNumber).toBe('AAAAA0000A');
      expect(component.form.address).toBe('123 CONNAUGHT PLACE,NEW DELHI');
      expect(component.form.city).toBe('Delhi');
      expect(component.form.pincode).toBe('110001');
      expect(component.gstins[0].state).toBe('Delhi');
    });

    it('processes JPG/JPEG image upload via backend OCR and auto-fills registration form', async () => {
      component.mode = 'new';
      const jpgFile = new File(['fake-jpg-bytes'], 'gst_certificate.jpg', { type: 'image/jpeg' });
      customerServiceMock.ocrImage.mockReturnValue(of({
        success: true,
        gstin: '27BBBBB2222B1Z2',
        pan: 'BBBBB2222B',
        tradeName: 'BOMBAY CARRIERS',
        businessName: 'BOMBAY CARRIERS',
        address: '456 NARIMAN POINT, MUMBAI',
        city: 'Mumbai',
        pincode: '400021',
        state: 'Maharashtra',
        stateName: 'Maharashtra'
      }));

      await component.handleGstinFileChange(0, {
        target: { files: [jpgFile] }
      } as unknown as Event);

      expect(customerServiceMock.ocrImage).toHaveBeenCalledWith(jpgFile);
      expect(panOcrServiceMock.extractGstinFromFile).not.toHaveBeenCalled();
      expect(component.gstins[0].gstin).toBe('27BBBBB2222B1Z2');
      expect(component.gstins[0].scanStatus).toBe('success');
      expect(component.form.companyName).toBe('BOMBAY CARRIERS');
      expect(component.form.panNumber).toBe('BBBBB2222B');
      expect(component.form.address).toBe('456 NARIMAN POINT,MUMBAI');
      expect(component.form.city).toBe('Mumbai');
      expect(component.form.pincode).toBe('400021');
    });

    it('falls back to client-side OCR if backend Tesseract is unconfigured on the host', async () => {
      component.mode = 'new';
      const pngFile = new File(['fake-png-bytes'], 'gst_cert.png', { type: 'image/png' });
      customerServiceMock.ocrImage.mockReturnValue(of({
        success: false,
        tesseractMissing: true,
        message: 'Tesseract executable is missing'
      }));
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '07AAAAA0000A1Z4',
        pan: 'AAAAA0000A',
        tradeName: 'CLIENT FALLBACK CORP',
        address: '789 FALLBACK ROAD',
        city: 'Delhi',
        pincode: '110001',
        stateName: 'Delhi'
      });

      await component.handleGstinFileChange(0, {
        target: { files: [pngFile] }
      } as unknown as Event);

      expect(customerServiceMock.ocrImage).toHaveBeenCalledWith(pngFile);
      expect(panOcrServiceMock.extractGstinFromFile).toHaveBeenCalledWith(pngFile, expect.any(Function));
      expect(component.gstins[0].gstin).toBe('07AAAAA0000A1Z4');
      expect(component.gstins[0].scanStatus).toBe('success');
      expect(component.form.companyName).toBe('CLIENT FALLBACK CORP');
    });

    it('preserves PDF workflow without calling backend image OCR', async () => {
      component.mode = 'new';
      const pdfFile = new File(['fake-pdf-bytes'], 'gst_document.pdf', { type: 'application/pdf' });
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '07AAAAA0000A1Z4',
        pan: 'AAAAA0000A',
        tradeName: 'PDF LOGISTICS',
        address: '100 PDF WAY',
        city: 'Delhi',
        pincode: '110001',
        stateName: 'Delhi'
      });

      await component.handleGstinFileChange(0, {
        target: { files: [pdfFile] }
      } as unknown as Event);

      expect(customerServiceMock.ocrImage).not.toHaveBeenCalled();
      expect(panOcrServiceMock.extractGstinFromFile).toHaveBeenCalledWith(pdfFile, expect.any(Function));
      expect(component.gstins[0].gstin).toBe('07AAAAA0000A1Z4');
      expect(component.form.companyName).toBe('PDF LOGISTICS');
    });

    it('rejects unsupported file formats like .bmp or .txt', () => {
      const txtFile = new File(['hello'], 'doc.txt', { type: 'text/plain' });
      expect(component.checkFile(txtFile)).toBe('Only PDF, JPG, JPEG, and PNG files are allowed');

      const bmpFile = new File(['fake-bmp'], 'image.bmp', { type: 'image/bmp' });
      expect(component.checkFile(bmpFile)).toBe('Only PDF, JPG, JPEG, and PNG files are allowed');

      const validPng = new File(['fake-png'], 'image.png', { type: 'image/png' });
      expect(component.checkFile(validPng)).toBe('');

      const validJpg = new File(['fake-jpg'], 'image.jpg', { type: 'image/jpeg' });
      expect(component.checkFile(validJpg)).toBe('');

      const validJpeg = new File(['fake-jpeg'], 'image.jpeg', { type: 'image/jpeg' });
      expect(component.checkFile(validJpeg)).toBe('');

      const validPdf = new File(['fake-pdf'], 'doc.pdf', { type: 'application/pdf' });
      expect(component.checkFile(validPdf)).toBe('');
    });

    describe('Office Database (SEM_GSTIN) Verification', () => {
      beforeEach(() => {
        component.mode = 'new';
        component.form = {
          companyName: 'ACME LOGISTICS',
          customerCode: 'ACME',
          address: '123 CONNAUGHT PLACE, NEW DELHI',
          city: 'Delhi',
          pincode: '110001',
          panNumber: 'AAAAA0000A',
          operatingDivision: 'DLI',
          zone: 'NR',
          codeType: 'GLOBAL'
        };
        component.gstins = [{
          state: 'Delhi',
          gstin: '07AAAAA0000A1Z4',
          file: new File(['fake'], 'cert.pdf', { type: 'application/pdf' })
        }];
      });

      it('Case 1: displays Verified when GSTIN and company details match office database', () => {
        customerServiceMock.verifySemGstin.mockReturnValue(of({
          verified: true,
          status: 'VERIFIED',
          message: '✓ Verified – Details matched with office database.',
          gstin: '07AAAAA0000A1Z4',
          dbCompanyName: 'ACME LOGISTICS',
          dbAddress: '123 CONNAUGHT PLACE, NEW DELHI'
        }));

        component.verifySemGstinForIndex(0);

        expect(customerServiceMock.verifySemGstin).toHaveBeenCalledWith(
          '07AAAAA0000A1Z4', 'ACME LOGISTICS', '123 CONNAUGHT PLACE, NEW DELHI'
        );
        expect(component.gstins[0].dbVerificationStatus).toBe('verified');
        expect(component.gstins[0].dbVerificationMessage).toBe('✓ Verified – Details matched with office database.');
        expect(component.errors['gstin_0_gstin']).toBeUndefined();
        // Crucial requirement: User MUST still be able to validate/submit form
        expect(component.validate()).toBe(true);
      });

      it('Case 2: displays Verification Failed when GSTIN exists but details differ, without blocking submission', () => {
        customerServiceMock.verifySemGstin.mockReturnValue(of({
          verified: false,
          status: 'MISMATCH',
          message: '⚠ Verification Failed – Entered details do not match office database.',
          gstin: '07AAAAA0000A1Z4',
          dbCompanyName: 'DIFFERENT FIRM',
          companyNameMatched: false
        }));

        component.verifySemGstinForIndex(0);

        expect(component.gstins[0].dbVerificationStatus).toBe('mismatch');
        expect(component.gstins[0].dbVerificationMessage).toBe('⚠ Verification Failed – Entered details do not match office database.');
        // Submission must NOT be blocked by mismatch
        expect(component.validate()).toBe(true);
        expect(component.isFormValid).toBe(true);
      });

      it('Case 3: displays Verification Unavailable when GSTIN is not found in database, without blocking submission', () => {
        customerServiceMock.verifySemGstin.mockReturnValue(of({
          verified: false,
          status: 'NOT_FOUND',
          message: 'ℹ Verification Unavailable – GSTIN not found in office database.',
          gstin: '07AAAAA0000A1Z4'
        }));

        component.verifySemGstinForIndex(0);

        expect(component.gstins[0].dbVerificationStatus).toBe('not_found');
        expect(component.gstins[0].dbVerificationMessage).toBe('ℹ Verification Unavailable – GSTIN not found in office database.');
        // Submission must NOT be blocked
        expect(component.validate()).toBe(true);
        expect(component.isFormValid).toBe(true);
      });

      it('Case 4: displays Verification Unavailable when database or connection is inaccessible, without blocking submission', () => {
        customerServiceMock.verifySemGstin.mockReturnValue(of({
          verified: false,
          status: 'UNAVAILABLE',
          message: 'ℹ Verification Unavailable – Unable to connect to office database.',
          gstin: '07AAAAA0000A1Z4'
        }));

        component.verifySemGstinForIndex(0);

        expect(component.gstins[0].dbVerificationStatus).toBe('unavailable');
        expect(component.gstins[0].dbVerificationMessage).toBe('ℹ Verification Unavailable – Unable to connect to office database.');
        // Submission must NOT be blocked
        expect(component.validate()).toBe(true);
        expect(component.isFormValid).toBe(true);
      });

      it('clears previous verification status when GSTIN changes', () => {
        component.gstins[0].dbVerificationStatus = 'verified';
        component.gstins[0].dbVerificationMessage = '✓ Verified – Details matched with office database.';

        component.handleGstinInput(0, '07BBBBB1111B1Z9');

        expect(component.gstins[0].dbVerificationStatus).toBeUndefined();
        expect(component.gstins[0].dbVerificationMessage).toBeUndefined();
      });

      it('re-verifies GSTIN when company name changes', () => {
        vi.useFakeTimers();
        customerServiceMock.verifySemGstin.mockReturnValue(of({
          verified: true,
          status: 'VERIFIED',
          message: '✓ Verified – Details matched with office database.'
        }));

        component.handleNewCompanyNameChange('NEW ACME CORP');
        vi.advanceTimersByTime(350);

        expect(customerServiceMock.verifySemGstin).toHaveBeenCalledWith(
          '07AAAAA0000A1Z4', 'NEW ACME CORP', '123 CONNAUGHT PLACE, NEW DELHI'
        );
        vi.useRealTimers();
      });
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

    it('normalizes whitespace in GSTIN input and validates the normalized value on blur', () => {
      component.gstins = [{ gstin: '', state: '' }];

      // Whitespace is removed from GSTINs before validation.
      component.handleGstinChange(0, { gstin: 'FIRST WORD SECOND WORD 12345' });
      expect(component.gstins[0].gstin).toBe('FIRSTWORDSECONDWORD12345');
      expect(component.errors['gstin_0_gstin']).toBeUndefined();

      component.handleGstinChange(0, { gstin: '27 ABCDE ' });
      expect(component.gstins[0].gstin).toBe('27ABCDE');

      component.handleGstinBlur(0);
      expect(component.errors['gstin_0_gstin']).toBe('Enter a valid 15-character GSTIN.');

      component.handleGstinChange(0, { gstin: '27ABCDE1234F1Z5' });
      expect(component.errors['gstin_0_gstin']).toBeUndefined();

      // 5. Validating on blur with matching PAN passes
      component.form.panNumber = 'ABCDE1234F';
      component.handleGstinBlur(0);
      expect(component.errors['gstin_0_gstin']).toBeUndefined();
    });

    it('allows address that exceeds 100 characters with comma spaces but fits within 100 characters when normalized', () => {
      component.mode = 'old';
      component.lookupDone = true;
      component.verifiedCustomerCode = 'TEST';
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
      expect(component.currentLogoAlt).toBe('Freight Customer Code');

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

    it('Global Code lookup fetches full details and displays Verification screen table structure', () => {
      component.mode = 'delete';
      component.deleteCodeType = 'GLOBAL_CUSTOMER';
      component.deleteCode = 'ACME01';
      customerServiceMock.verifyDeleteRequest.mockReturnValue(of({
        success: true,
        found: true,
        code: 'ACME01',
        companyName: 'Acme Logistics'
      }));
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of({
        customerCode: 'ACME01',
        companyName: 'Acme Logistics',
        address: '100 Industrial Area, Delhi',
        panNumber: 'AAACA1234D',
        gstinNumbers: '07AAACA1234D1Z5',
        division: 'DELHI',
        creationDate: '2025-03-01'
      }));

      component.verifyDeleteCode();

      expect(component.deleteRecordDetails).toEqual({
        customerCode: 'ACME01',
        companyName: 'Acme Logistics',
        address: '100 Industrial Area, Delhi',
        panNumber: 'AAACA1234D',
        gstinNumbers: '07AAACA1234D1Z5',
        division: 'DELHI',
        creationDate: '2025-03-01'
      });
      expect(component.getDeleteGstinList(component.deleteRecordDetails)).toEqual(['07AAACA1234D1Z5']);
      expect(component.deleteVerificationMessage).toContain('Please enter the exact company name shown above');
    });

    it('Handling Agent Code lookup fetches full details and populates agent details', () => {
      component.mode = 'delete';
      component.deleteCodeType = 'HANDLING_AGENT';
      component.deleteCode = 'HNDG01';
      customerServiceMock.verifyDeleteRequest.mockReturnValue(of({
        success: true,
        found: true,
        code: 'HNDG01',
        companyName: 'Handling Solutions Corp'
      }));
      customerServiceMock.lookupHandlingAgentJDBC.mockReturnValue(of({
        code: 'HNDG01',
        companyName: 'Handling Solutions Corp',
        address: '200 Cargo Hub, Mumbai',
        panNumber: 'BBBCB5678E',
        gstinNumbers: '27BBBCB5678E1Z9',
        division: 'MUMBAI',
        creationDate: '2025-03-10'
      }));

      component.verifyDeleteCode();

      expect(component.deleteRecordDetails.companyName).toBe('Handling Solutions Corp');
      expect(component.deleteRecordDetails.division).toBe('MUMBAI');
      expect(component.getDeleteGstinList(component.deleteRecordDetails)).toEqual(['27BBBCB5678E1Z9']);
    });

    it('validates company name strictly: disables Delete Request on partial or mismatch, enables on exact match', () => {
      component.mode = 'delete';
      component.verifiedDeleteRecord = {
        codeType: 'GLOBAL_CUSTOMER',
        code: 'ACME01',
        companyName: 'Acme Logistics'
      };

      // Empty
      component.deleteCompanyName = '';
      expect(component.isDeleteCompanyNameMatched()).toBe(false);

      // Partial
      component.deleteCompanyName = 'Acme';
      expect(component.isDeleteCompanyNameMatched()).toBe(false);

      // Case mismatch
      component.deleteCompanyName = 'acme logistics';
      expect(component.isDeleteCompanyNameMatched()).toBe(false);

      // Incorrect
      component.deleteCompanyName = 'Another Company';
      expect(component.isDeleteCompanyNameMatched()).toBe(false);

      // Exact match
      component.deleteCompanyName = 'Acme Logistics';
      expect(component.isDeleteCompanyNameMatched()).toBe(true);

      // Exact match with whitespace trimming allowed
      component.deleteCompanyName = '  Acme Logistics  ';
      expect(component.isDeleteCompanyNameMatched()).toBe(true);
    });

    it('clears previous verification result and record details when code changes', () => {
      component.mode = 'delete';
      component.deleteCode = 'ACME01';
      component.verifiedDeleteRecord = { codeType: 'GLOBAL_CUSTOMER', code: 'ACME01', companyName: 'Acme Logistics' };
      component.deleteRecordDetails = { customerCode: 'ACME01', companyName: 'Acme Logistics' };
      component.deleteCompanyName = 'Acme Logistics';

      component.onDeleteCodeChange({ target: { value: 'ACME02' } } as unknown as Event);

      expect(component.verifiedDeleteRecord).toBeNull();
      expect(component.deleteRecordDetails).toBeNull();
      expect(component.deleteCompanyName).toBe('');
      expect(component.isDeleteCompanyNameMatched()).toBe(false);
    });

    it('clears all unsaved lookup and confirmation data when leaving Disable Code mode', () => {
      component.mode = 'delete';
      component.deleteCodeType = 'GLOBAL_CUSTOMER';
      component.deleteCode = 'ACME01';
      component.verifiedDeleteRecord = { codeType: 'GLOBAL_CUSTOMER', code: 'ACME01', companyName: 'Acme Logistics' };
      component.deleteRecordDetails = { customerCode: 'ACME01', companyName: 'Acme Logistics' };
      component.deleteCompanyName = 'Acme Logistics';

      component.switchMode('new');

      expect(component.mode).toBe('new');
      expect(component.deleteCodeType).toBe('');
      expect(component.deleteCode).toBe('');
      expect(component.verifiedDeleteRecord).toBeNull();
      expect(component.deleteRecordDetails).toBeNull();
      expect(component.deleteCompanyName).toBe('');
    });
  });

  describe('Code Type Toggle & Dynamic Logo Switching', () => {
    it('should default to GLOBAL codeType with Global Customer Code logo in old mode', () => {
      component.mode = 'old';
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/portal-logo.webp');
      expect(component.currentLogoAlt).toBe('Freight Customer Code');
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
      expect(component.currentLogoAlt).toBe('Freight Customer Code');
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

  describe('Submit Request conditional button disabling and validation', () => {
    describe('New Mode', () => {
      beforeEach(() => {
        component.mode = 'new';
        component.form = {
          companyName: '',
          customerCode: '',
          address: '',
          city: '',
          pincode: '',
          panNumber: '',
          operatingDivision: '',
          zone: '',
          email: '',
          mobile: '',
          codeType: 'GLOBAL',
          ownershipCode: '',
          ownershipAddress: '',
          ownershipPartyCode: '',
          ownershipPartyAddress: ''
        };
        component.gstins = [];
      });

      function setupValidNewForm() {
        component.form = {
          companyName: 'Valid New Company',
          customerCode: 'VNEW',
          address: '123 Valid Street',
          city: 'Mumbai',
          pincode: '400001',
          panNumber: 'ABCDE1234F',
          operatingDivision: 'Mumbai (CSTM)',
          zone: 'Central Railway (CR)',
          email: 'valid@example.com',
          mobile: '9876543210',
          codeType: 'GLOBAL',
          ownershipCode: '',
          ownershipAddress: '',
          ownershipPartyCode: '',
          ownershipPartyAddress: ''
        };
        component.codeChecking = false;
        component.gstins = [
          {
            state: 'Maharashtra',
            gstin: '27ABCDE1234F1Z5',
            file: null,
            existingFileName: 'valid_gstin.pdf',
            scanning: false,
            scanStatus: 'idle',
            scanError: ''
          }
        ];
      }

      it('is disabled by default when new mode is opened', () => {
        expect(component.isFormValid).toBe(false);
      });

      it('rejects whitespace-only values in mandatory fields', () => {
        setupValidNewForm();
        expect(component.isFormValid).toBe(true);

        component.form.companyName = '   ';
        expect(component.isFormValid).toBe(false);

        component.form.companyName = 'Valid New Company';
        component.form.address = '   ';
        expect(component.isFormValid).toBe(false);

        component.form.address = '123 Valid Street';
        component.form.panNumber = '          ';
        expect(component.isFormValid).toBe(false);

        component.form.panNumber = 'ABCDE1234F';
        component.form.zone = '   ';
        expect(component.isFormValid).toBe(false);

        component.form.zone = 'Central Railway (CR)';
        component.form.operatingDivision = '   ';
        expect(component.isFormValid).toBe(false);
      });

      it('enables Submit Request when all required fields are correctly filled', () => {
        setupValidNewForm();
        expect(component.isFormValid).toBe(true);
      });

      it('immediately disables Submit Request if a previously valid field becomes invalid', () => {
        setupValidNewForm();
        expect(component.isFormValid).toBe(true);

        component.handlePanChange('INVALID');
        expect(component.isFormValid).toBe(false);

        component.handlePanChange('ABCDE1234F');
        expect(component.isFormValid).toBe(true);

        component.handlePincodeChange('123');
        expect(component.isFormValid).toBe(false);

        component.handlePincodeChange('400001');
        expect(component.isFormValid).toBe(true);

        component.form.email = 'not-an-email';
        expect(component.isFormValid).toBe(false);

        component.form.email = 'test@example.com';
        expect(component.isFormValid).toBe(true);

        component.form.mobile = '12345';
        expect(component.isFormValid).toBe(false);

        component.form.mobile = '9876543210';
        expect(component.isFormValid).toBe(true);
      });

      it('prevents submission when Enter is pressed on an invalid form', () => {
        const mockEvent = {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn()
        } as unknown as Event;

        component.submit(mockEvent);

        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(customerServiceMock.registerCustomer).not.toHaveBeenCalled();
      });
    });

    describe('Old Mode', () => {
      beforeEach(() => {
        component.mode = 'old';
        component.form = {
          companyName: '',
          customerCode: '',
          address: '',
          city: '',
          pincode: '',
          panNumber: '',
          operatingDivision: '',
          zone: '',
          email: '',
          mobile: '',
          codeType: 'GLOBAL',
          ownershipCode: '',
          ownershipAddress: '',
          ownershipPartyCode: '',
          ownershipPartyAddress: ''
        };
        component.gstins = [
          {
            gstinId: null,
            state: '',
            stateCode: '',
            gstin: '',
            file: null,
            existingFileName: '',
            scanning: false,
            scanStatus: 'idle',
            scanError: ''
          }
        ];
      });

      function setupValidOldForm() {
        component.form = {
          companyName: 'Old Legacy Company',
          customerCode: 'OLD1',
          address: '456 Railway Road',
          city: 'Mumbai',
          pincode: '400001',
          panNumber: 'ABCDE1234F',
          operatingDivision: 'Mumbai (CSTM)',
          zone: 'Central Railway (CR)',
          email: 'old@example.com',
          mobile: '9876543210',
          codeType: 'GLOBAL',
          ownershipCode: '',
          ownershipAddress: '',
          ownershipPartyCode: '',
          ownershipPartyAddress: ''
        };
        component.lookupLoading = false;
        component.lookupDone = true;
        component.lookupError = '';
        component.verifiedCustomerCode = 'OLD1';
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
      }

      it('is disabled by default when old mode is opened', () => {
        expect(component.isFormValid).toBe(false);
      });

      it('enables Submit Request when valid old customer record is verified and fields filled', () => {
        setupValidOldForm();
        expect(component.isFormValid).toBe(true);
      });

      it('immediately disables if verified customer code is cleared or modified', () => {
        setupValidOldForm();
        expect(component.isFormValid).toBe(true);

        component.form.customerCode = 'DIFF';
        expect(component.isFormValid).toBe(false);
      });
    });

    describe('Ownership Mode', () => {
      function setupValidOwnershipForm() {
        component.mode = 'ownership';
        component.ownSection1Source = 'EXISTING_OWNERSHIP_RECORD';
        component.ownSection1Loading = false;
        component.ownSection2Source = 'EXISTING_OWNERSHIP_RECORD';
        component.ownSection2Loading = false;
        component.form = {
          companyName: '',
          customerCode: '',
          address: '',
          city: '',
          pincode: '',
          panNumber: '',
          ownershipCode: 'OWN1',
          ownershipAddress: 'Valid Ownership Address',
          ownershipPartyCode: 'OWN1',
          ownershipPartyAddress: 'Valid Ownership Address'
        };
      }

      it('is disabled by default when ownership mode is opened', () => {
        component.mode = 'ownership';
        expect(component.isFormValid).toBe(false);
      });

      it('enables when both table lookups use the unified code and company name', () => {
        setupValidOwnershipForm();
        expect(component.isFormValid).toBe(true);
      });

      it('disables when mandatory ownership address is empty or whitespace', () => {
        setupValidOwnershipForm();
        expect(component.isFormValid).toBe(true);

        component.form.ownershipAddress = '   ';
        expect(component.isFormValid).toBe(false);
      });
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
      expect(component.isFormValid).toBe(false);
    });

    it('isFormValid rejects company name that is whitespace or > 40 chars', () => {
      component.switchMode('new');
      component.form.companyName = '   ';
      expect(component.isFormValid).toBe(false);

      component.form.companyName = 'A'.repeat(41);
      expect(component.isFormValid).toBe(false);
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
      expect(component.isFormValid).toBe(false);

      // 11 chars
      component.form.panNumber = 'ABCDE1234FA';
      expect(component.isFormValid).toBe(false);

      // invalid format
      component.form.panNumber = '12345ABCDE';
      expect(component.isFormValid).toBe(false);
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
      expect(component.isFormValid).toBe(false);

      // GSTIN with different PAN: 27XYZWE1234F1Z5 vs ABCDE1234F
      component.gstins[0].gstin = '27XYZWE1234F1Z5';
      expect(component.isFormValid).toBe(false);

      // Correct matching GSTIN
      component.gstins[0].gstin = '27ABCDE1234F1Z5';
      expect(component.isFormValid).toBe(true);
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

      expect(component.isFormValid).toBe(true);
    });
  });

  describe('Conditional PAN and GST Field Editability in Old Entry Section', () => {
    beforeEach(() => {
      component.switchMode('old');
      component.form.customerCode = '';
      component.form.companyName = '';
      component.form.address = '';
      component.form.panNumber = '';
      component.gstins = [{ ...component.gstins[0], gstin: '', state: '' }];
      component.isOldPanDisabled = false;
      component.isOldGstDisabled = false;
    });

    it('Case 1: Both PAN and GST available in DB -> auto-populates, disables both fields, prevents mutations', () => {
      const existingCustomer = {
        companyName: 'Heavy Engineering Corp',
        address: 'Ranchi Industrial Area',
        panNumber: 'AAACH1234K',
        gstinNumbers: '20AAACH1234K1Z2'
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(existingCustomer));

      vi.useFakeTimers();
      component.handleOldCodeChange('HECK');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.form.companyName).toBe('Heavy Engineering Corp');
      expect(component.form.address).toBe('Ranchi Industrial Area');
      expect(component.form.panNumber).toBe('AAACH1234K');
      expect(component.gstins[0].gstin).toBe('20AAACH1234K1Z2');
      expect(component.isPanDisabled).toBe(true);
      expect(component.isGstDisabled).toBe(true);

      // Attempt to modify PAN via handlePanChange
      component.handlePanChange('BBBB1234K');
      expect(component.form.panNumber).toBe('AAACH1234K');

      // Attempt to modify GST via handleGstinChange, handleGstinInput, handleGstinStateChange
      component.handleGstinChange(0, { gstin: '27AAACH1234K1Z9' });
      expect(component.gstins[0].gstin).toBe('20AAACH1234K1Z2');

      component.handleGstinInput(0, '27AAACH1234K1Z9');
      expect(component.gstins[0].gstin).toBe('20AAACH1234K1Z2');

      component.handleGstinStateChange(0, 'Maharashtra');
      expect(component.gstins[0].state).not.toBe('Maharashtra');

      // Existing GSTIN rows stay locked, but another state-wise GSTIN can be added.
      component.addGstin();
      expect(component.gstins.length).toBe(2);
      expect(component.isGstinEntryDisabled(0)).toBe(true);
      expect(component.isGstinEntryDisabled(1)).toBe(false);

      component.removeGstin(0);
      expect(component.gstins.length).toBe(2);
    });

    it('Case 2: Both PAN and GST missing in DB -> company name & address populated, both fields editable', () => {
      const existingCustomer = {
        companyName: 'Legacy Workshop',
        address: 'Old Railway Yard',
        panNumber: null,
        gstinNumbers: ''
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(existingCustomer));

      vi.useFakeTimers();
      component.handleOldCodeChange('LWSK');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.form.companyName).toBe('Legacy Workshop');
      expect(component.form.address).toBe('Old Railway Yard');
      expect(component.form.panNumber).toBe('');
      expect(component.isPanDisabled).toBe(false);
      expect(component.isGstDisabled).toBe(false);

      // User enters missing PAN and GST
      component.handlePanChange('AAACL5678M');
      expect(component.form.panNumber).toBe('AAACL5678M');

      component.handleGstinChange(0, { gstin: '07AAACL5678M1Z1', state: 'Delhi' });
      expect(component.gstins[0].gstin).toBe('07AAACL5678M1Z1');
      expect(component.gstins[0].state).toBe('Delhi');

      // User can add another GSTIN row when missing
      component.addGstin();
      expect(component.gstins.length).toBe(2);
    });

    it('Case 2 (Edge Cases): treats "null", "undefined", "[]", and whitespace as missing PAN and GST', () => {
      const edgeCustomer = {
        companyName: 'Edge Case Logistics',
        address: 'Dock 4, Port Area',
        panNumber: '   undefined   ',
        gstinNumbers: ' [ "null" ] '
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(edgeCustomer));

      vi.useFakeTimers();
      component.handleOldCodeChange('EDGL');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.form.companyName).toBe('Edge Case Logistics');
      expect(component.form.panNumber).toBe('');
      expect(component.isPanDisabled).toBe(false);
      expect(component.isGstDisabled).toBe(false);
    });

    it('Case 3: Only PAN available in DB -> PAN populated & disabled, GST enabled & editable', () => {
      const existingCustomer = {
        companyName: 'Central Logistics Ltd',
        address: 'Sector 5, Salt Lake',
        panNumber: 'AAACC9876Z',
        gstinNumbers: null
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(existingCustomer));

      vi.useFakeTimers();
      component.handleOldCodeChange('CLLT');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.form.panNumber).toBe('AAACC9876Z');
      expect(component.isPanDisabled).toBe(true);
      expect(component.isGstDisabled).toBe(false);

      // PAN cannot be edited
      component.handlePanChange('ZZZZ9999Z');
      expect(component.form.panNumber).toBe('AAACC9876Z');

      // Missing GST can be entered
      component.handleGstinChange(0, { gstin: '19AAACC9876Z1Z8', state: 'West Bengal' });
      expect(component.gstins[0].gstin).toBe('19AAACC9876Z1Z8');
      expect(component.gstins[0].state).toBe('West Bengal');

      // Another GSTIN row can be added
      component.addGstin();
      expect(component.gstins.length).toBe(2);
    });

    it('Case 4: Only GST available in DB -> GST populated & disabled, PAN enabled & editable', () => {
      const existingCustomer = {
        companyName: 'Eastern Shipping',
        address: 'Wharf Road, Kolkata',
        panNumber: '',
        gstinNumbers: '19AAACE1111E1Z3'
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(existingCustomer));

      vi.useFakeTimers();
      component.handleOldCodeChange('ESHP');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.gstins[0].gstin).toBe('19AAACE1111E1Z3');
      expect(component.isPanDisabled).toBe(false);
      expect(component.isGstDisabled).toBe(true);

      // Existing GSTIN cannot be changed, while an additional state GSTIN can be added.
      component.handleGstinChange(0, { gstin: '27AAACE1111E1Z5' });
      expect(component.gstins[0].gstin).toBe('19AAACE1111E1Z3');
      component.addGstin();
      expect(component.gstins.length).toBe(2);
      expect(component.isGstinEntryDisabled(0)).toBe(true);
      expect(component.isGstinEntryDisabled(1)).toBe(false);

      component.handleGstinStateChange(1, 'Maharashtra');
      component.handleGstinChange(1, { gstin: '27AAACE1111E1Z5' });
      expect(component.gstins[1].state).toBe('Maharashtra');
      expect(component.gstins[1].gstin).toBe('27AAACE1111E1Z5');

      // Missing PAN can be entered
      component.handlePanChange('AAACE1111E');
      expect(component.form.panNumber).toBe('AAACE1111E');
    });

    it('resets field disabled states when a different code is typed or code type changes', () => {
      const existingCustomer = {
        companyName: 'Initial Test Corp',
        address: 'Initial Address',
        panNumber: 'AAACI2222J',
        gstinNumbers: '27AAACI2222J1Z4'
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(existingCustomer));

      vi.useFakeTimers();
      component.handleOldCodeChange('INIT');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.isPanDisabled).toBe(true);
      expect(component.isGstDisabled).toBe(true);

      // Typing a different customer code resets the disabled states immediately
      component.handleOldCodeChange('DIFF');
      expect(component.isOldPanDisabled).toBe(false);
      expect(component.isOldGstDisabled).toBe(false);
      expect(component.isPanDisabled).toBe(false);
      expect(component.isGstDisabled).toBe(false);

      // Changing old code type also resets disabled states
      component.isOldPanDisabled = true;
      component.isOldGstDisabled = true;
      component.handleOldCodeTypeChange('HANDLING_AGENT');
      expect(component.isOldPanDisabled).toBe(false);
      expect(component.isOldGstDisabled).toBe(false);
    });

    it('handles lookup failure cleanly and leaves fields enabled for manual retry', () => {
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(throwError(() => ({
        status: 404,
        error: { message: 'Customer code not found' }
      })));

      vi.useFakeTimers();
      component.handleOldCodeChange('NOTF');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.lookupLoading).toBe(false);
      expect(component.lookupError).toBe('Customer code not found');
      expect(component.isPanDisabled).toBe(false);
      expect(component.isGstDisabled).toBe(false);
    });

    it('ensures New Entry Section (mode: new) is never affected by old field disabled states', () => {
      component.switchMode('new');
      component.isOldPanDisabled = true;
      component.isOldGstDisabled = true;

      // In new mode, isPanDisabled and isGstDisabled must always be false
      expect(component.isPanDisabled).toBe(false);
      expect(component.isGstDisabled).toBe(false);
    });

    it('re-evaluates editability dynamically after form submission when DB updates', () => {
      const initial = {
        companyName: 'Updatable Customer',
        address: 'Station Road',
        panNumber: 'AAACU3333R',
        gstinNumbers: ''
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(initial));

      vi.useFakeTimers();
      component.handleOldCodeChange('UPDT');
      vi.advanceTimersByTime(800);
      vi.useRealTimers();

      expect(component.isPanDisabled).toBe(true);
      expect(component.isGstDisabled).toBe(false);

      // User adds missing GSTIN and submits
      component.handleGstinChange(0, { gstin: '27AAACU3333R1Z9', state: 'Maharashtra' });
      customerServiceMock.updateOldCustomerJDBC.mockReturnValue(of({ success: true, message: 'Updated' }));

      // Mock refreshed DB record returning both PAN and newly saved GST
      const refreshed = {
        ...initial,
        gstinNumbers: '27AAACU3333R1Z9'
      };
      customerServiceMock.lookupOldCustomerJDBC.mockReturnValue(of(refreshed));

      component.submit();

      // After successful update and DB refresh, both PAN and GST are now available in DB and disabled
      expect(component.isPanDisabled).toBe(true);
      expect(component.isGstDisabled).toBe(true);
      expect(component.gstins[0].gstin).toBe('27AAACU3333R1Z9');
    });
  });
});
