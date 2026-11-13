import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationEnd } from '@angular/router';
import { OwnershipCodeComponent } from './ownership-code.component';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { ZoneDivisionService } from '../../services/zone-division.service';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

describe('OwnershipCodeComponent', () => {
  let component: OwnershipCodeComponent;
  let customerServiceMock: any;
  let notificationService: NotificationService;
  let routerMock: any;
  let cdrMock: ChangeDetectorRef;
  let authUserSubject: BehaviorSubject<any>;
  let authServiceMock: any;

  beforeEach(() => {
    customerServiceMock = {
      lookupOwnershipJDBC: vi.fn().mockReturnValue(of({
        found: true,
        data: { ownershipDesc: 'Test Address 1', recordSource: 'EXISTING_OWNERSHIP_RECORD' }
      })),
      checkOwnershipDuplicate: vi.fn().mockReturnValue(of({ duplicate: false })),
      lookupOwnershipPartyJDBC: vi.fn().mockReturnValue(of({
        found: true,
        data: { partyDesc: 'Test Address 2', recordSource: 'EXISTING_OWNERSHIP_RECORD' }
      })),
      checkOwnershipPartyDuplicate: vi.fn().mockReturnValue(of({ duplicate: false })),
      submitOwnershipJDBC: vi.fn().mockReturnValue(of({ success: true, message: 'Request sent to DBA' }))
    };
    notificationService = new NotificationService();
    routerMock = {
      navigate: vi.fn()
    };
    cdrMock = {
      markForCheck: vi.fn(),
      detectChanges: vi.fn(),
      checkNoChanges: vi.fn(),
      detach: vi.fn(),
      reattach: vi.fn()
    } as unknown as ChangeDetectorRef;
    authUserSubject = new BehaviorSubject<any>(null);
    authServiceMock = { currentUser$: authUserSubject.asObservable(), currentUser: null };

    component = new OwnershipCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      routerMock,
      cdrMock,
      authServiceMock
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with blank form and empty errors', () => {
    expect(component.form.ownershipCode).toBe('');
    expect(component.form.panNumber).toBe('');
    expect(component.errors).toEqual({});
    expect(component.loading).toBe(false);
  });

  it('defaults the division from login and keeps manual changes local', () => {
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

  it('should lookup both ownership tables from the single ownership code field', () => {
    vi.useFakeTimers();
    component.handleOwnershipCodeChange('OWN1');
    expect(component.form.ownershipCode).toBe('OWN1');
    expect(component.form.ownershipPartyCode).toBe('OWN1');

    vi.runAllTimers();
    expect(customerServiceMock.lookupOwnershipJDBC).toHaveBeenCalledWith('OWN1');
    expect(customerServiceMock.lookupOwnershipPartyJDBC).toHaveBeenCalledWith('OWN1');
    expect(component.form.ownershipAddress).toBe('Test Address 1');
    expect(component.ownSection1Found).toBe(true);
    expect(component.ownSection2Found).toBe(true);
    vi.useRealTimers();
  });

  it('should lookup ownership party code in Section 2', () => {
    vi.useFakeTimers();
    component.handleOwnershipPartyCodeChange('PRT1');
    expect(component.form.ownershipPartyCode).toBe('PRT1');

    vi.runAllTimers();
    expect(customerServiceMock.lookupOwnershipPartyJDBC).toHaveBeenCalledWith('PRT1');
    expect(component.form.ownershipPartyAddress).toBe('Test Address 2');
    expect(component.ownSection2Found).toBe(true);
    vi.useRealTimers();
  });

  it('should use Global Customer data as a new ownership record source', () => {
    vi.useFakeTimers();
    customerServiceMock.lookupOwnershipJDBC.mockReturnValue(of({
      found: true,
      data: {
        ownershipDesc: 'Global Company',
        address: 'Global Address',
        panNumber: 'ABCDE1234F',
        city: 'Delhi',
        pincode: '110001',
        recordSource: 'NEW_RECORD_FROM_GLOBAL_CUSTOMER'
      }
    }));

    component.handleOwnershipCodeChange('GLB1');
    vi.advanceTimersByTime(500);

    expect(component.ownSection1Source).toBe('NEW_RECORD_FROM_GLOBAL_CUSTOMER');
    expect(component.form.ownershipAddress).toBe('Global Company');
    expect(component.form.address).toBe('Global Address');
    expect(component.form.panNumber).toBe('ABCDE1234F');
    expect(component.form.city).toBe('Delhi');
    expect(component.form.pincode).toBe('110001');
  });

  it.each(['A', 'BD', 'MCC', 'LONG4'])('looks up ownership records for existing code %s', (code) => {
    vi.useFakeTimers();
    component.handleOwnershipCodeChange(code);
    vi.advanceTimersByTime(500);
    expect(customerServiceMock.lookupOwnershipJDBC).toHaveBeenCalledWith(code);
    expect(customerServiceMock.lookupOwnershipPartyJDBC).toHaveBeenCalledWith(code);
    vi.useRealTimers();
  });

  it('should expose backend lookup failures to the user', () => {
    vi.useFakeTimers();
    customerServiceMock.lookupOwnershipJDBC.mockReturnValue(
      throwError(() => ({ error: { message: 'Ownership table lookup failed' } }))
    );

    component.handleOwnershipCodeChange('OWN1');
    vi.advanceTimersByTime(500);

    expect(component.ownSection1LookupError).toBe('Ownership table lookup failed');
  });

  it('should validate required fields in unified form', () => {
    const valid = component.validate();
    expect(valid).toBe(false);
    expect(component.errors['ownershipCode']).toBeDefined();
    expect(component.errors['ownershipAddress']).toBeDefined();
    expect(component.errors['panNumber']).toBeDefined();
    expect(component.errors['city']).toBeUndefined();
    expect(component.errors['pincode']).toBeDefined();
    expect(component.errors['state']).toBeDefined();
    expect(component.errors['zone']).toBeDefined();
    expect(component.errors['operatingDivision']).toBeDefined();
    // The second table lookup is validated against the shared code field.
    expect(component.errors['ownershipPartyCode']).toBeDefined();
    expect(component.errors['ownershipPartyAddress']).toBeUndefined();
  });

  it('should submit unified form and supply entered company info to both database operations', () => {
    component.ownSection1Source = 'EXISTING_OWNERSHIP_RECORD';
    component.ownSection2Source = 'EXISTING_OWNERSHIP_RECORD';
    component.form = {
      ownershipCode: 'OWN1',
      ownershipAddress: 'Address 1',
      panNumber: 'ABCDE1234F',
      address: '123 Main Street',
      city: 'Mumbai',
      pincode: '400001',
      state: 'Maharashtra',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: 'owner@example.com',
      mobile: '9876543210',
      ownershipPartyCode: 'OWN1',
      ownershipPartyAddress: 'Different party name'
    };

    component.submit();
    expect(component.showReviewModal).toBe(true);
    component.onReviewConfirm();
    expect(customerServiceMock.submitOwnershipJDBC).toHaveBeenCalledWith(
      'OWN1',
      'Address 1',
      'OWN1',
      'Address 1'
    );
    expect(component.notice).toContain('Request sent to DBA');
  });

  it('should allow submission validation when city is blank or whitespace in unified form', () => {
    component.ownSection1Source = 'EXISTING_OWNERSHIP_RECORD';
    component.ownSection2Source = 'EXISTING_OWNERSHIP_RECORD';
    component.form = {
      ownershipCode: 'OWN1',
      ownershipAddress: 'Address 1',
      panNumber: 'ABCDE1234F',
      address: '123 Main Street',
      city: '   ',
      pincode: '400001',
      state: 'Maharashtra',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: '',
      mobile: '',
      ownershipPartyCode: 'OWN1',
      ownershipPartyAddress: 'Address 1'
    };

    expect(component.validate()).toBe(true);
    expect(component.errors['city']).toBeUndefined();
  });

  it('should reset form fields back to blank', () => {
    component.form.ownershipCode = 'OWN1';
    component.reset();
    expect(component.form.ownershipCode).toBe('');
    expect(component.form.ownershipAddress).toBe('');
  });

  it('should navigate to /registration when navigateToHome is called', () => {
    component.navigateToHome();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/registration']);
  });

  it('resets all text fields on screen navigation while preserving zone and operating division', () => {
    const routerEvents = new Subject<any>();
    const zoneDivisionService = new ZoneDivisionService();
    zoneDivisionService.setSelection('Central Railway (CR)', 'Mumbai (CSTM)', true);

    const testComponent = new OwnershipCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      { navigate: vi.fn(), events: routerEvents.asObservable() } as any,
      cdrMock,
      authServiceMock,
      zoneDivisionService
    );
    testComponent.ngOnInit();

    testComponent.form.ownershipCode = 'OWN9';
    testComponent.form.ownershipAddress = '999 Industrial Area';
    testComponent.form.panNumber = 'ABCDE1234F';
    testComponent.form.ownershipPartyCode = 'PRT9';
    testComponent.form.ownershipPartyAddress = 'Party Address 999';
    testComponent.form.city = 'Nagpur';
    testComponent.form.pincode = '440001';

    expect(testComponent.form.ownershipCode).toBe('OWN9');
    expect(testComponent.form.zone).toBe('Central Railway (CR)');
    expect(testComponent.form.operatingDivision).toBe('Mumbai (CSTM)');

    // Simulate navigation event
    routerEvents.next(new NavigationEnd(1, '/registration/ownership', '/registration/ownership'));

    // Text fields must be cleared
    expect(testComponent.form.ownershipCode).toBe('');
    expect(testComponent.form.ownershipAddress).toBe('');
    expect(testComponent.form.panNumber).toBe('');
    expect(testComponent.form.ownershipPartyCode).toBe('');
    expect(testComponent.form.ownershipPartyAddress).toBe('');
    expect(testComponent.form.city).toBe('');
    expect(testComponent.form.pincode).toBe('');

    // Zone and Division MUST be preserved
    expect(testComponent.form.zone).toBe('Central Railway (CR)');
    expect(testComponent.form.operatingDivision).toBe('Mumbai (CSTM)');

    testComponent.ngOnDestroy();
  });

  describe('Submit Request conditional button disabling and validation', () => {
    function setupValidForm() {
      component.ownSection1Source = 'EXISTING_OWNERSHIP_RECORD';
      component.ownSection1Loading = false;
      component.ownSection2Source = 'EXISTING_OWNERSHIP_RECORD';
      component.ownSection2Loading = false;
      component.form = {
        ownershipCode: 'OWN1',
        ownershipAddress: 'Valid Ownership Address',
        panNumber: 'ABCDE1234F',
        address: '123 Valid Street',
        city: 'Mumbai',
        pincode: '400001',
        state: 'Maharashtra',
        zone: 'Central Railway (CR)',
        operatingDivision: 'Mumbai (CSTM)',
        email: 'test@example.com',
        mobile: '9876543210',
        ownershipPartyCode: 'OWN1',
        ownershipPartyAddress: 'Valid Party Address'
      };
    }

    it('keeps Submit Request disabled by default when screen is opened', () => {
      expect(component.isFormValid).toBe(false);
    });

    it('rejects whitespace-only values for mandatory fields', () => {
      setupValidForm();
      expect(component.isFormValid).toBe(true);

      component.form.ownershipAddress = '    ';
      expect(component.isFormValid).toBe(false);

      component.form.ownershipAddress = 'Valid Ownership Address';
      component.form.ownershipPartyCode = 'PRT1';
      expect(component.isFormValid).toBe(false);

      component.form.ownershipPartyCode = 'OWN1';
      component.form.panNumber = '          ';
      expect(component.isFormValid).toBe(false);

      component.form.panNumber = 'ABCDE1234F';
      component.form.pincode = '      ';
      expect(component.isFormValid).toBe(false);

      component.form.pincode = '400001';
      component.form.state = '   ';
      expect(component.isFormValid).toBe(false);

      component.form.state = 'Maharashtra';
      component.form.zone = '   ';
      expect(component.isFormValid).toBe(false);

      component.form.zone = 'Central Railway (CR)';
      component.form.operatingDivision = '   ';
      expect(component.isFormValid).toBe(false);
    });

    it('enables Submit Request when all required fields are correctly filled', () => {
      setupValidForm();
      expect(component.isFormValid).toBe(true);
    });

    it('immediately disables Submit Request if a previously valid field becomes invalid', () => {
      setupValidForm();
      expect(component.isFormValid).toBe(true);

      component.handlePanChange('INVALIDPAN');
      expect(component.isFormValid).toBe(false);

      component.handlePanChange('ABCDE1234F');
      expect(component.isFormValid).toBe(true);

      component.handlePincodeChange('123');
      expect(component.isFormValid).toBe(false);

      component.handlePincodeChange('400001');
      expect(component.isFormValid).toBe(true);

      component.handleEmailChange('invalid-email');
      expect(component.isFormValid).toBe(false);

      component.handleEmailChange('valid@example.com');
      expect(component.isFormValid).toBe(true);

      component.handleMobileChange('12345');
      expect(component.isFormValid).toBe(false);

      component.handleMobileChange('9876543210');
      expect(component.isFormValid).toBe(true);
    });

    it('prevents form submission via Enter key or direct call when invalid', () => {
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as Event;

      component.submit(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(customerServiceMock.submitOwnershipJDBC).not.toHaveBeenCalled();
    });
  });
});
