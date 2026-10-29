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
    expect(component.pageTitle).toBe('Delete Request');
    expect(component.currentLogo).toBeNull();

    component.code = 'AEIP';
    component.verifyCode();

    expect(customerService.verifyDeleteRequest).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('Please select a code type.');
  });

  it('dynamically displays Global Customer Code logo and heading when Global Code is selected', () => {
    component.codeType = 'GLOBAL_CUSTOMER';

    expect(component.pageTitle).toBe('Global Customer Code Deletion Request');
    expect(component.currentLogo).toBe('assets/glbl_transparent.png');
    expect(component.currentLogoAlt).toBe('Global Customer Code Logo');
  });

  it('dynamically displays Handling Agent logo and heading when Handling Agent Code is selected', () => {
    component.codeType = 'HANDLING_AGENT';

    expect(component.pageTitle).toBe('Handling Agent Code Deletion Request');
    expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.png');
    expect(component.currentLogoAlt).toBe('Handling Agent Code Logo');
  });

  it('switches the logo on every selection change and resets image fallback state', () => {
    component.onCodeTypeChange({ target: { value: 'GLOBAL_CUSTOMER' } } as unknown as Event);
    expect(component.currentLogo).toBe('assets/glbl_transparent.png');

    component.onLogoError();
    expect(component.logoLoadFailed).toBe(true);

    component.onCodeTypeChange({ target: { value: 'HANDLING_AGENT' } } as unknown as Event);
    expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.png');
    expect(component.logoLoadFailed).toBe(false);

    component.onCodeTypeChange({ target: { value: 'GLOBAL_CUSTOMER' } } as unknown as Event);
    expect(component.currentLogo).toBe('assets/glbl_transparent.png');
    expect(component.logoLoadFailed).toBe(false);
  });

  it('handles a missing selected logo without affecting the delete form state', () => {
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';

    component.onLogoError();

    expect(component.logoLoadFailed).toBe(true);
    expect(component.code).toBe('AEIP');
    expect(component.currentLogo).toBe('assets/glbl_transparent.png');
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
    expect(component.pageTitle).toBe('Handling Agent Code Deletion Request');
    expect(component.currentLogo).toBe('assets/handling_agent_code_transparent.png');

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
      .toBe('This code is not present in the table, so it cannot be deleted.');

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
});
