import { ChangeDetectorRef } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HandlingAgentCodeComponent } from './handling-agent-code.component';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { of } from 'rxjs';

describe('HandlingAgentCodeComponent', () => {
  let component: HandlingAgentCodeComponent;
  let customerServiceMock: any;
  let notificationService: NotificationService;
  let routerMock: any;
  let cdrMock: ChangeDetectorRef;

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

    component = new HandlingAgentCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      routerMock,
      cdrMock
    );
  });

  it('should initialize with blank form and empty errors', () => {
    expect(component.form.agentCompanyName).toBe('');
    expect(component.form.panNumber).toBe('');
    expect(component.errors).toEqual({});
    expect(component.loading).toBe(false);
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
    expect(component.errors['city']).toBeDefined();
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

  it('should validate PAN and GSTIN consistency', () => {
    component.form.panNumber = 'ABCDE1234F';
    component.form.gstin = '27XXXXX1234F1Z5'; // Mismatched PAN inside GSTIN
    component.validate();
    expect(component.errors['gstin']).toContain('GSTIN does not match the PAN number');

    component.form.gstin = '27ABCDE1234F1Z5'; // Matching PAN
    component.validate();
    expect(component.errors['gstin']).toBeUndefined();
  });

  it('should submit registration successfully', () => {
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

    component.submit();
    expect(customerServiceMock.registerCustomer).toHaveBeenCalled();
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
});
