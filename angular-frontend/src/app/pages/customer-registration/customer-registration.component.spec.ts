import { ChangeDetectorRef } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      verifyDeleteRequest: vi.fn().mockReturnValue(of({
        found: true,
        code: 'ACME01',
        companyName: 'Acme Logistics'
      })),
      submitDeleteRequest: vi.fn().mockReturnValue(of({ message: 'Delete request sent.' })),
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

  describe('Address OCR autofill', () => {
    it('keeps a manually edited address when OCR finishes', async () => {
      component.mode = 'new';
      component.form.companyName = 'Test Corporation';
      component.form.address = 'Manual business address';
      component.handleAddressInput();
      panOcrServiceMock.extractGstinFromFile.mockResolvedValue({
        gstin: '07ABCDE1234F1Z5',
        address: 'Extracted address from GST certificate, 110001',
        city: 'Delhi',
        pincode: '110001',
        stateName: 'Delhi'
      });
      const file = new File(['pdf'], 'gst.pdf', { type: 'application/pdf' });

      await component.handleGstinFileChange(0, {
        target: { files: [file] }
      } as unknown as Event);

      expect(component.addressManuallyEdited).toBe(true);
      expect(component.form.address).toBe('Manual business address');
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
  });

  describe('Delete Request Mode', () => {
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
      expect(component.currentLogo).toBe('assets/glbl_transparent.png');
      expect(component.currentLogoAlt).toBe('Global Customer Code Logo');
    });

    it('should dynamically switch logo when toggling to HANDLING_AGENT in old mode', () => {
      component.mode = 'old';
      component.handleOldCodeTypeChange('HANDLING_AGENT');

      expect(component.codeType).toBe('HANDLING_AGENT');
      expect(component.oldCodeType).toBe('HANDLING_AGENT');
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.png');
      expect(component.currentLogoAlt).toBe('Handling Agent Code Logo');

      // Switch back to GLOBAL
      component.handleOldCodeTypeChange('GLOBAL');
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/glbl_transparent.png');
      expect(component.currentLogoAlt).toBe('Global Customer Code Logo');
    });

    it('should dynamically switch logo when toggling codeType in new mode', () => {
      component.mode = 'new';
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/glbl_transparent.png');

      component.handleNewCodeTypeChange('HANDLING_AGENT');
      expect(component.codeType).toBe('HANDLING_AGENT');
      expect(component.newCodeType).toBe('HANDLING_AGENT');
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.png');
      expect(component.currentLogoAlt).toBe('Handling Agent Code Logo');

      component.handleNewCodeTypeChange('GLOBAL');
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/glbl_transparent.png');
    });

    it('should keep Old User and New Entry codeType independent', () => {
      // Set Old User to HANDLING_AGENT
      component.mode = 'old';
      component.handleOldCodeTypeChange('HANDLING_AGENT');
      expect(component.codeType).toBe('HANDLING_AGENT');
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.png');

      // Switch to New Entry (default GLOBAL)
      component.mode = 'new';
      expect(component.codeType).toBe('GLOBAL');
      expect(component.currentLogo).toBe('assets/glbl_transparent.png');

      // Switch back to Old User (should remain HANDLING_AGENT)
      component.mode = 'old';
      expect(component.codeType).toBe('HANDLING_AGENT');
      expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.png');
    });
  });
});
