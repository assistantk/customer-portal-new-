import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { CustomerService } from '../../services/customer.service';
import { DeleteRequestComponent } from './delete-request.component';

describe('DeleteRequestComponent', () => {
  let component: DeleteRequestComponent;
  let customerService: {
    verifyDeleteRequest: ReturnType<typeof vi.fn>;
    submitDeleteRequest: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    customerService = {
      verifyDeleteRequest: vi.fn(),
      submitDeleteRequest: vi.fn()
    };
    component = new DeleteRequestComponent(customerService as unknown as CustomerService);
  });

  it('initializes with default generic page title, no code-type logo, and requires selecting a code type', () => {
    expect(component.codeType).toBe('');
    expect(component.pageTitle).toBe('Disable Code');
    expect(component.currentLogo).toBe('assets/portal-logo.webp');
    expect(component.currentLogoAlt).toBe('Freight Code Generator');

    component.code = 'AEIP';
    component.verifyCode();

    expect(customerService.verifyDeleteRequest).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('Please select a code type.');
  });

  it('dynamically displays Global Customer Code logo and heading when Global Code is selected', () => {
    component.codeType = 'GLOBAL_CUSTOMER';

    expect(component.pageTitle).toBe('Global Customer Code - Disable Code');
    expect(component.currentLogo).toBe('assets/glbl_transparent.webp');
    expect(component.currentLogoAlt).toBe('Global Customer Code Logo');
  });

  it('dynamically displays Handling Agent logo and heading when Handling Agent Code is selected', () => {
    component.codeType = 'HANDLING_AGENT';

    expect(component.pageTitle).toBe('Handling Agent Code - Disable Code');
    expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');
    expect(component.currentLogoAlt).toBe('Handling Agent Code Logo');
  });

  it('switches the logo on every selection change and resets image fallback state', () => {
    component.onCodeTypeChange({ target: { value: 'GLOBAL_CUSTOMER' } } as unknown as Event);
    expect(component.currentLogo).toBe('assets/glbl_transparent.webp');

    component.onLogoError();
    expect(component.logoLoadFailed).toBe(true);

    component.onCodeTypeChange({ target: { value: 'HANDLING_AGENT' } } as unknown as Event);
    expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');
    expect(component.logoLoadFailed).toBe(false);

    component.onCodeTypeChange({ target: { value: 'GLOBAL_CUSTOMER' } } as unknown as Event);
    expect(component.currentLogo).toBe('assets/glbl_transparent.webp');
    expect(component.logoLoadFailed).toBe(false);
  });

  it('handles a missing selected logo without affecting the delete form state', () => {
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';

    component.onLogoError();

    expect(component.logoLoadFailed).toBe(true);
    expect(component.code).toBe('AEIP');
    expect(component.currentLogo).toBe('assets/glbl_transparent.webp');
  });

  it('clears code, company name, messages, and verification when switching code types', () => {
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';
    customerService.verifyDeleteRequest.mockReturnValue(of({
      success: true,
      found: true,
      code: 'AEIP',
      companyName: 'Example Company'
    }));
    component.verifyCode();
    component.companyName = 'Example Company';
    expect(component.verifiedRecord).not.toBeNull();

    // Switch to Handling Agent Code
    const mockSelectEvent = {
      target: { value: 'HANDLING_AGENT' }
    } as unknown as Event;
    component.onCodeTypeChange(mockSelectEvent);

    expect(component.codeType).toBe('HANDLING_AGENT');
    expect(component.code).toBe('');
    expect(component.companyName).toBe('');
    expect(component.verifiedRecord).toBeNull();
    expect(component.verificationMessage).toBe('');
    expect(component.errorMessage).toBe('');
    expect(component.successMessage).toBe('');
    expect(component.pageTitle).toBe('Handling Agent Code - Disable Code');
    expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.webp');

    component.sendRequest();
    expect(customerService.submitDeleteRequest).not.toHaveBeenCalled();
  });

  it('requires a verified code and matching company name before submitting', () => {
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';
    customerService.verifyDeleteRequest.mockReturnValue(of({
      success: true,
      found: true,
      code: 'AEIP',
      companyName: 'Example Company'
    }));
    component.verifyCode();
    component.companyName = 'Other Company';

    component.sendRequest();

    expect(component.errorMessage)
      .toBe('Company name does not match the selected code. Please verify the company name.');
    expect(customerService.submitDeleteRequest).not.toHaveBeenCalled();
  });

  it('clears verification when the code changes and requires a fresh lookup', () => {
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';
    customerService.verifyDeleteRequest.mockReturnValue(of({
      success: true,
      found: true,
      code: 'AEIP',
      companyName: 'Example Company'
    }));
    component.verifyCode();

    component.code = 'NEWCODE';
    component.onCodeChange();
    component.companyName = 'Example Company';
    component.sendRequest();

    expect(customerService.submitDeleteRequest).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('Verify the current code');
  });

  it('displays not-found and lookup failure as distinct outcomes', () => {
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';
    customerService.verifyDeleteRequest.mockReturnValue(of({ success: true, found: false }));
    component.verifyCode();
    expect(component.verificationMessage)
      .toBe('This code is not present in the records, so it cannot be deleted.');

    customerService.verifyDeleteRequest.mockReturnValue(throwError(() => new Error('offline')));
    component.verifyCode();
    expect(component.errorMessage)
      .toBe('Unable to verify the code at this time. Please try again later.');
  });

  it('prevents duplicate submissions while a request is in flight', () => {
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';
    customerService.verifyDeleteRequest.mockReturnValue(of({
      success: true,
      found: true,
      code: 'AEIP',
      companyName: 'Example Company'
    }));
    component.verifyCode();
    component.companyName = 'Example Company';
    const request = new Subject<{ message: string }>();
    customerService.submitDeleteRequest.mockReturnValue(request.asObservable());

    component.sendRequest();
    component.sendRequest();

    expect(customerService.submitDeleteRequest).toHaveBeenCalledTimes(1);
    request.next({ message: 'sent' });
    request.complete();
    expect(component.submitting).toBe(false);
  });

  it('resets the submission state after email delivery fails so the user can retry', () => {
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';
    customerService.verifyDeleteRequest.mockReturnValue(of({
      success: true,
      found: true,
      code: 'AEIP',
      companyName: 'Example Company'
    }));
    component.verifyCode();
    component.companyName = 'Example Company';
    customerService.submitDeleteRequest.mockReturnValue(
      throwError(() => ({ error: { message: 'Email delivery failed' } }))
    );

    component.sendRequest();

    expect(component.submitting).toBe(false);
    expect(component.errorMessage).toBe('Email delivery failed');
    expect(component.verifiedRecord).not.toBeNull();
  });

  describe('Full-Detail Table and Exact Confirmation (Disable Code)', () => {
    it('Global Code lookup fetches and displays full details matching Verification screen structure', () => {
      (customerService as any).lookupOldCustomerJDBC = vi.fn().mockReturnValue(of({
        customerCode: 'GLBL01',
        companyName: 'Global Logistics Ltd',
        address: '123 Main St, New Delhi',
        panNumber: 'ABCDE1234F',
        gstinNumbers: '07ABCDE1234F1Z5,08ABCDE1234F1Z6',
        division: 'DELHI',
        creationDate: '2025-01-15'
      }));
      customerService.verifyDeleteRequest.mockReturnValue(of({
        success: true,
        found: true,
        code: 'GLBL01',
        companyName: 'Global Logistics Ltd'
      }));

      component.codeType = 'GLOBAL_CUSTOMER';
      component.code = 'GLBL01';
      component.verifyCode();

      expect(customerService.verifyDeleteRequest).toHaveBeenCalledWith('GLOBAL_CUSTOMER', 'GLBL01');
      expect((customerService as any).lookupOldCustomerJDBC).toHaveBeenCalledWith('GLBL01');
      expect(component.recordDetails).toEqual({
        customerCode: 'GLBL01',
        companyName: 'Global Logistics Ltd',
        address: '123 Main St, New Delhi',
        panNumber: 'ABCDE1234F',
        gstinNumbers: '07ABCDE1234F1Z5,08ABCDE1234F1Z6',
        division: 'DELHI',
        creationDate: '2025-01-15'
      });
      expect(component.getGstinList(component.recordDetails)).toEqual([
        '07ABCDE1234F1Z5',
        '08ABCDE1234F1Z6'
      ]);
      expect(component.verificationMessage).toContain('Please enter the exact company name shown above');
    });

    it('Handling Agent Code lookup fetches and displays full details matching Verification screen structure', () => {
      (customerService as any).lookupHandlingAgentJDBC = vi.fn().mockReturnValue(of({
        code: 'AGNT01',
        companyName: 'Express Handling Agency',
        address: '456 Port Road, Mumbai',
        panNumber: 'MNOPQ5678R',
        gstinNumbers: '27MNOPQ5678R1Z1',
        division: 'MUMBAI',
        creationDate: '2025-02-20'
      }));
      customerService.verifyDeleteRequest.mockReturnValue(of({
        success: true,
        found: true,
        code: 'AGNT01',
        companyName: 'Express Handling Agency'
      }));

      component.codeType = 'HANDLING_AGENT';
      component.code = 'AGNT01';
      component.verifyCode();

      expect(customerService.verifyDeleteRequest).toHaveBeenCalledWith('HANDLING_AGENT', 'AGNT01');
      expect((customerService as any).lookupHandlingAgentJDBC).toHaveBeenCalledWith('AGNT01');
      expect(component.recordDetails.companyName).toBe('Express Handling Agency');
      expect(component.recordDetails.division).toBe('MUMBAI');
      expect(component.getGstinList(component.recordDetails)).toEqual(['27MNOPQ5678R1Z1']);
    });

    it('keeps Delete Request disabled for incorrect or partial company name, and enables only on exact match', () => {
      component.verifiedRecord = {
        codeType: 'GLOBAL_CUSTOMER',
        code: 'GLBL01',
        companyName: 'Global Logistics Ltd'
      };

      // Empty
      component.companyName = '';
      expect(component.isCompanyNameMatched()).toBe(false);

      // Partial
      component.companyName = 'Global Logistics';
      expect(component.isCompanyNameMatched()).toBe(false);

      // Incorrect
      component.companyName = 'Different Corp';
      expect(component.isCompanyNameMatched()).toBe(false);

      // Case mismatch
      component.companyName = 'global logistics ltd';
      expect(component.isCompanyNameMatched()).toBe(false);

      // Exact match (with leading/trailing whitespace allowed by trimming)
      component.companyName = '  Global Logistics Ltd  ';
      expect(component.isCompanyNameMatched()).toBe(true);
    });

    it('clears verification and record details immediately when code or code type changes', () => {
      component.codeType = 'GLOBAL_CUSTOMER';
      component.code = 'GLBL01';
      component.verifiedRecord = {
        codeType: 'GLOBAL_CUSTOMER',
        code: 'GLBL01',
        companyName: 'Global Logistics Ltd'
      };
      component.recordDetails = { customerCode: 'GLBL01', companyName: 'Global Logistics Ltd' };
      component.companyName = 'Global Logistics Ltd';

      // Changing code
      component.onCodeChange({ target: { value: 'NEWCODE' } } as unknown as Event);
      expect(component.verifiedRecord).toBeNull();
      expect(component.recordDetails).toBeNull();
      expect(component.companyName).toBe('');
      expect(component.isCompanyNameMatched()).toBe(false);

      // Set record again
      component.verifiedRecord = {
        codeType: 'GLOBAL_CUSTOMER',
        code: 'GLBL01',
        companyName: 'Global Logistics Ltd'
      };
      component.recordDetails = { customerCode: 'GLBL01' };
      component.companyName = 'Global Logistics Ltd';

      // Changing code type
      component.onCodeTypeChange({ target: { value: 'HANDLING_AGENT' } } as unknown as Event);
      expect(component.verifiedRecord).toBeNull();
      expect(component.recordDetails).toBeNull();
      expect(component.code).toBe('');
      expect(component.companyName).toBe('');
      expect(component.isCompanyNameMatched()).toBe(false);
    });

    it('invalid code prevents display of full details and deletion', () => {
      customerService.verifyDeleteRequest.mockReturnValue(of({ success: true, found: false }));

      component.codeType = 'GLOBAL_CUSTOMER';
      component.code = 'INVALID';
      component.verifyCode();

      expect(component.verifiedRecord).toBeNull();
      expect(component.recordDetails).toBeNull();
      expect(component.verificationMessage).toContain('not present in the records');
      expect(component.isCompanyNameMatched()).toBe(false);
    });
  });
});
