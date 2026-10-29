import { ChangeDetectorRef } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalCustomerCodeComponent } from './global-customer-code.component';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { of } from 'rxjs';

describe('GlobalCustomerCodeComponent', () => {
  let component: GlobalCustomerCodeComponent;
  let customerServiceMock: any;
  let notificationService: NotificationService;
  let routerMock: any;
  let cdrMock: ChangeDetectorRef;

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

    component = new GlobalCustomerCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      routerMock,
      cdrMock
    );
  });

  it('should initialize with blank form and empty errors', () => {
    expect(component.form.companyName).toBe('');
    expect(component.form.customerCode).toBe('');
    expect(component.errors).toEqual({});
    expect(component.loading).toBe(false);
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
    expect(component.errors['city']).toBeDefined();
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
      city: 'Mumbai',
      pincode: '400001',
      zone: 'Central Railway (CR)',
      operatingDivision: 'Mumbai (CSTM)',
      email: 'test@example.com',
      mobile: '9876543210'
    };

    component.submit();
    expect(customerServiceMock.registerCustomer).toHaveBeenCalled();
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
});
