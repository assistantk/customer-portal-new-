import { ChangeDetectorRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnershipCodeComponent } from './ownership-code.component';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { of, throwError } from 'rxjs';

describe('OwnershipCodeComponent', () => {
  let component: OwnershipCodeComponent;
  let customerServiceMock: any;
  let notificationService: NotificationService;
  let routerMock: any;
  let cdrMock: ChangeDetectorRef;

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

    component = new OwnershipCodeComponent(
      customerServiceMock as CustomerService,
      notificationService,
      routerMock,
      cdrMock
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

  it('should lookup ownership code in Section 1', () => {
    vi.useFakeTimers();
    component.handleOwnershipCodeChange('OWN1');
    expect(component.form.ownershipCode).toBe('OWN1');

    vi.runAllTimers();
    expect(customerServiceMock.lookupOwnershipJDBC).toHaveBeenCalledWith('OWN1');
    expect(component.form.ownershipAddress).toBe('Test Address 1');
    expect(component.ownSection1Found).toBe(true);
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

  it('should wait for all four code characters before requesting ownership data', () => {
    vi.useFakeTimers();
    component.handleOwnershipCodeChange('OWN');
    vi.advanceTimersByTime(500);
    expect(customerServiceMock.lookupOwnershipJDBC).not.toHaveBeenCalled();

    component.handleOwnershipCodeChange('OWN1');
    vi.advanceTimersByTime(500);
    expect(customerServiceMock.lookupOwnershipJDBC).toHaveBeenCalledWith('OWN1');
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

  it('should validate required fields', () => {
    const valid = component.validate();
    expect(valid).toBe(false);
    expect(component.errors['ownershipCode']).toBeDefined();
    expect(component.errors['ownershipAddress']).toBeDefined();
    expect(component.errors['panNumber']).toBeDefined();
    expect(component.errors['city']).toBeDefined();
    expect(component.errors['pincode']).toBeDefined();
    expect(component.errors['state']).toBeDefined();
    expect(component.errors['zone']).toBeDefined();
    expect(component.errors['operatingDivision']).toBeDefined();
    expect(component.errors['ownershipPartyCode']).toBeDefined();
    expect(component.errors['ownershipPartyAddress']).toBeDefined();
  });

  it('should submit registration successfully', () => {
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
      ownershipPartyCode: 'PRT1',
      ownershipPartyAddress: 'Address 2'
    };

    component.submit();
    expect(customerServiceMock.submitOwnershipJDBC).toHaveBeenCalledWith(
      'OWN1',
      'Address 1',
      'PRT1',
      'Address 2'
    );
    expect(component.notice).toContain('Request sent to DBA');
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
});
