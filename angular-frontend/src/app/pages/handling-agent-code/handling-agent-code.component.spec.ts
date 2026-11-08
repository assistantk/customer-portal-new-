import '@angular/compiler';
import { ChangeDetectorRef } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationEnd } from '@angular/router';
import { HandlingAgentCodeComponent } from './handling-agent-code.component';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { ZoneDivisionService } from '../../services/zone-division.service';
import { BehaviorSubject, of, Subject } from 'rxjs';

describe('HandlingAgentCodeComponent', () => {
  let component: HandlingAgentCodeComponent;
  let customerServiceMock: any;
  let notificationService: NotificationService;
  let routerMock: any;
  let cdrMock: ChangeDetectorRef;
  let authUserSubject: BehaviorSubject<any>;
  let authServiceMock: any;

  beforeEach(() => {
    customerServiceMock = {
      generateUniqueCode: vi.fn().mockReturnValue(of('HAGT')),
      registerCustomer: vi.fn().mockReturnValue(of({ success: true, customerCode: 'HAGT' }))
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

    component = new HandlingAgentCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      routerMock,
      cdrMock,
      authServiceMock
    );
  });

  it('should initialize with blank form and empty errors', () => {
    expect(component.form.agentCompanyName).toBe('');
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

  it('should generate code from company name', () => {
    vi.useFakeTimers();
    component.handleNameChange('Fast Track Logistics');
    expect(component.generatedCode).toBe('FAST');

    vi.runAllTimers();
    expect(component.generatedCode).toBe('HAGT');
    vi.useRealTimers();
  });

  it('should validate required fields', () => {
    const valid = component.validate();
    expect(valid).toBe(false);
    expect(component.errors['agentCompanyName']).toBeDefined();
    expect(component.errors['panNumber']).toBeDefined();
    expect(component.errors['address']).toBeDefined();
    expect(component.errors['city']).toBeUndefined();
    expect(component.errors['pincode']).toBeDefined();
    expect(component.errors['state']).toBeDefined();
    expect(component.errors['zone']).toBeDefined();
    expect(component.errors['operatingDivision']).toBeDefined();
  });

  it('should reject agent/company names longer than 40 characters', () => {
    component.form.agentCompanyName = 'A'.repeat(41);

    expect(component.validate()).toBe(false);
    expect(component.errors['agentCompanyName']).toBe('Agent / Company name cannot exceed 40 characters.');
  });

  it('should pass validation when all required fields are valid', () => {
    component.form = {
      agentCompanyName: 'Super Logistics Private Limited',
      panNumber: 'ABCDE1234F',
      gstin: '27ABCDE1234F1Z5',
      state: 'Maharashtra',
      address: 'Plot 42, Sector 18, Vashi',
      city: 'Navi Mumbai',
      pincode: '400703',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: 'agent@example.com',
      mobile: '9876543210'
    };

    const valid = component.validate();
    expect(valid).toBe(true);
    expect(Object.keys(component.errors).length).toBe(0);
  });

  it('should allow submission validation when city is blank or whitespace', () => {
    component.form = {
      agentCompanyName: 'Super Logistics Private Limited',
      panNumber: 'ABCDE1234F',
      gstin: '',
      state: 'Maharashtra',
      address: 'Plot 42, Sector 18, Vashi',
      city: '   ',
      pincode: '400703',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: '',
      mobile: ''
    };

    expect(component.validate()).toBe(true);
    expect(component.errors['city']).toBeUndefined();
  });

  it('should validate PAN and GSTIN consistency', () => {
    component.form.panNumber = 'ABCDE1234F';
    component.form.gstin = '27XXXXX1234F1Z5'; // Mismatched PAN inside GSTIN
    component.validate();
    expect(component.errors['gstin']).toContain('GSTIN does not match the PAN number');

    component.form.gstin = '27ABCDE1234F1Z5'; // Matching PAN
    component.validate();
    expect(component.errors['gstin']).toBeUndefined();
  });

  it('allows users to type multiple characters, words, and spaces continuously in GST input without restriction', () => {
    component.handleGstinChange('FIRST WORD SECOND WORD 12345');
    expect(component.form.gstin).toBe('FIRST WORD SECOND WORD 12345');
    expect(component.errors['gstin']).toBeUndefined();

    // Supports trailing spaces without stripping them while typing
    component.handleGstinChange('TEST WORD ');
    expect(component.form.gstin).toBe('TEST WORD ');

    // Validates only on blur or submit
    component.handleGstinBlur();
    expect(component.errors['gstin']).toBe('Enter a valid 15-character GSTIN.');

    // Clears error as soon as user types again
    component.handleGstinChange('27ABCDE1234F1Z5');
    expect(component.errors['gstin']).toBeUndefined();

    // Validates correctly on blur with valid GSTIN matching PAN
    component.form.panNumber = 'ABCDE1234F';
    component.handleGstinBlur();
    expect(component.errors['gstin']).toBeUndefined();
  });

  it('should submit registration successfully', () => {
    component.form = {
      agentCompanyName: 'Super Logistics Private Limited',
      panNumber: 'ABCDE1234F',
      gstin: '27ABCDE1234F1Z5',
      state: 'Maharashtra',
      address: 'Plot 42, Sector 18, Vashi',
      city: '',
      pincode: '400703',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: 'agent@example.com',
      mobile: '9876543210'
    };

    component.submit();
    expect(customerServiceMock.registerCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ city: '' }),
      expect.any(Array)
    );
    expect(component.notice).toContain('Handling Agent Code');
  });

  it('should reset form fields back to blank', () => {
    component.form.agentCompanyName = 'Testing Agent';
    component.generatedCode = 'TEST';
    component.reset();
    expect(component.form.agentCompanyName).toBe('');
    expect(component.generatedCode).toBe('');
  });

  it('should navigate to /registration when navigateToHome is called', () => {
    component.navigateToHome();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/registration']);
  });

  it('resets all text fields on screen navigation while preserving zone and operating division', () => {
    const routerEvents = new Subject<any>();
    const zoneDivisionService = new ZoneDivisionService();
    zoneDivisionService.setSelection('Central Railway (CR)', 'Mumbai (CSTM)', true);

    const testComponent = new HandlingAgentCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      { navigate: vi.fn(), events: routerEvents.asObservable() } as any,
      cdrMock,
      authServiceMock,
      zoneDivisionService
    );
    testComponent.ngOnInit();

    testComponent.form.agentCompanyName = 'Handling Logistics Ltd';
    testComponent.form.panNumber = 'ABCDE1234F';
    testComponent.form.address = '456 Freight Road';
    testComponent.form.email = 'handling@logistics.com';
    testComponent.form.mobile = '9876543210';
    testComponent.form.city = 'Pune';
    testComponent.form.pincode = '411001';

    expect(testComponent.form.agentCompanyName).toBe('Handling Logistics Ltd');
    expect(testComponent.form.zone).toBe('Central Railway (CR)');
    expect(testComponent.form.operatingDivision).toBe('Mumbai (CSTM)');

    // Simulate navigation event
    routerEvents.next(new NavigationEnd(1, '/registration/handling-agent', '/registration/handling-agent'));

    // Text fields must be cleared
    expect(testComponent.form.agentCompanyName).toBe('');
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
