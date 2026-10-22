import { ChangeDetectorRef } from '@angular/core';
import { CustomerRegistrationComponent } from './customer-registration.component';
import { CustomerService } from '../../services/customer.service';
import { PanOcrService } from '../../services/pan-ocr.service';
import { NotificationService } from '../../services/notification.service';
import { of, throwError, Subject } from 'rxjs';

describe('CustomerRegistrationComponent - Submission and Loading State', () => {
  let component: CustomerRegistrationComponent;
  let customerServiceMock: any;
  let panOcrServiceMock: any;
  let notificationService: NotificationService;
  let cdrMock: ChangeDetectorRef;

  beforeEach(() => {
    customerServiceMock = {
      registerCustomer: vi.fn(),
      updateOldCustomerJDBC: vi.fn(),
      submitOwnershipJDBC: vi.fn(),
      lookupOldCustomerJDBC: vi.fn().mockReturnValue(of({})),
      lookupHandlingAgentJDBC: vi.fn().mockReturnValue(of({}))
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

    component = new CustomerRegistrationComponent(
      customerServiceMock as CustomerService,
      panOcrServiceMock as PanOcrService,
      notificationService,
      cdrMock
    );
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
  });

  describe('Ownership Flow (mode: ownership)', () => {
    beforeEach(() => {
      component.mode = 'ownership';
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
});
