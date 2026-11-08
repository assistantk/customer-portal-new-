import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationEnd } from '@angular/router';
import { GlobalCustomerCodeComponent } from './global-customer-code.component';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { ZoneDivisionService } from '../../services/zone-division.service';
import { BehaviorSubject, of, Subject } from 'rxjs';

describe('GlobalCustomerCodeComponent', () => {
  let component: GlobalCustomerCodeComponent;
  let customerServiceMock: any;
  let notificationService: NotificationService;
  let routerMock: any;
  let cdrMock: ChangeDetectorRef;
  let authUserSubject: BehaviorSubject<any>;
  let authServiceMock: any;

  beforeEach(() => {
    customerServiceMock = {
      generateUniqueCode: vi.fn().mockReturnValue(of('TSLX')),
      registerCustomer: vi.fn().mockReturnValue(of({ success: true, customerCode: 'TSLX' }))
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

    component = new GlobalCustomerCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      routerMock,
      cdrMock,
      authServiceMock
    );
  });

  it('should initialize with blank form and empty errors', () => {
    expect(component.form.companyName).toBe('');
    expect(component.form.customerCode).toBe('');
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

  it('should generate customer code from company name', () => {
    vi.useFakeTimers();
    component.handleCompanyNameChange('Tata Steel Limited');
    expect(component.form.customerCode).toBe('TATA');
    expect(component.codeConfirmed).toBe(true);

    vi.runAllTimers();
    expect(component.form.customerCode).toBe('TSLX');
    vi.useRealTimers();
  });

  it('should validate required fields', () => {
    const valid = component.validate();
    expect(valid).toBe(false);
    expect(component.errors['companyName']).toBeDefined();
    expect(component.errors['customerCode']).toBeDefined();
    expect(component.errors['panNumber']).toBeDefined();
    expect(component.errors['state']).toBeDefined();
    expect(component.errors['address']).toBeDefined();
    expect(component.errors['city']).toBeUndefined();
    expect(component.errors['pincode']).toBeDefined();
    expect(component.errors['zone']).toBeDefined();
    expect(component.errors['operatingDivision']).toBeDefined();
  });

  it('should reject company names longer than 40 characters', () => {
    component.form.companyName = 'A'.repeat(41);

    expect(component.validate()).toBe(false);
    expect(component.errors['companyName']).toBe('Company name cannot exceed 40 characters.');
  });

  it('should pass validation when all fields are valid', () => {
    component.form = {
      customerCode: 'ABCD',
      companyName: 'Alpha Beta Gamma Delta',
      panNumber: 'ABCDE1234F',
      state: 'Maharashtra',
      address: '123 Main Street',
      city: 'Mumbai',
      pincode: '400001',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: 'test@example.com',
      mobile: '9876543210'
    };

    const valid = component.validate();
    expect(valid).toBe(true);
    expect(Object.keys(component.errors).length).toBe(0);
  });

  it('should allow submission validation when city is blank or whitespace', () => {
    component.form = {
      customerCode: 'ABCD',
      companyName: 'Alpha Beta Gamma Delta',
      panNumber: 'ABCDE1234F',
      state: 'Maharashtra',
      address: '123 Main Street',
      city: '   ',
      pincode: '400001',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: '',
      mobile: ''
    };

    expect(component.validate()).toBe(true);
    expect(component.errors['city']).toBeUndefined();
  });

  it('should validate PAN format', () => {
    component.form.panNumber = 'INVALID_PAN';
    component.validate();
    expect(component.errors['panNumber']).toContain('Enter a valid PAN');

    component.form.panNumber = 'ABCDE1234F';
    component.validate();
    expect(component.errors['panNumber']).toBeUndefined();
  });

  it('should submit registration successfully', () => {
    component.form = {
      customerCode: 'ABCD',
      companyName: 'Alpha Beta Gamma Delta',
      panNumber: 'ABCDE1234F',
      state: 'Maharashtra',
      address: '123 Main Street',
      city: '',
      pincode: '400001',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: 'test@example.com',
      mobile: '9876543210'
    };

    component.submit();
    expect(customerServiceMock.registerCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ city: '' }),
      expect.any(Array)
    );
    expect(component.notice).toContain('Request email sent to DBA');
  });

  it('should reset form fields back to blank', () => {
    component.form.companyName = 'Testing';
    component.form.customerCode = 'TEST';
    component.reset();
    expect(component.form.companyName).toBe('');
    expect(component.form.customerCode).toBe('');
  });

  it('should navigate to /registration when navigateToHome is called', () => {
    component.navigateToHome();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/registration']);
  });

  it('resets all text fields on screen navigation while preserving zone and operating division', () => {
    const routerEvents = new Subject<any>();
    const zoneDivisionService = new ZoneDivisionService();
    zoneDivisionService.setSelection('Central Railway (CR)', 'Mumbai (CSTM)', true);

    const testComponent = new GlobalCustomerCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      { navigate: vi.fn(), events: routerEvents.asObservable() } as any,
      cdrMock,
      authServiceMock,
      zoneDivisionService
    );
    testComponent.ngOnInit();

    testComponent.form.companyName = 'Acme Corp';
    testComponent.form.panNumber = 'ABCDE1234F';
    testComponent.form.address = '123 Test Road';
    testComponent.form.email = 'test@corp.com';
    testComponent.form.mobile = '9876543210';
    testComponent.form.city = 'Mumbai';
    testComponent.form.pincode = '400001';

    expect(testComponent.form.companyName).toBe('Acme Corp');
    expect(testComponent.form.zone).toBe('Central Railway (CR)');
    expect(testComponent.form.operatingDivision).toBe('Mumbai (CSTM)');

    // Simulate navigation event
    routerEvents.next(new NavigationEnd(1, '/registration/global-code', '/registration/global-code'));

    // Text fields must be cleared
    expect(testComponent.form.companyName).toBe('');
    expect(testComponent.form.panNumber).toBe('');
    expect(testComponent.form.address).toBe('');
    expect(testComponent.form.email).toBe('');
    expect(testComponent.form.mobile).toBe('');
    expect(testComponent.form.city).toBe('');
    expect(testComponent.form.pincode).toBe('');

    // Zone and Division MUST be preserved
    expect(testComponent.form.zone).toBe('Central Railway (CR)');
    expect(testComponent.form.operatingDivision).toBe('Mumbai (CSTM)');

    testComponent.ngOnDestroy();
  });
});
