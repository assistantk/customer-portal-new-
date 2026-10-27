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
    component.codeType = 'GLOBAL_CUSTOMER';
    component.code = 'AEIP';
  });

  it('requires a verified code and matching company name before submitting', () => {
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

  it('clears verification when the selected code type changes', () => {
    customerService.verifyDeleteRequest.mockReturnValue(of({
      success: true,
      found: true,
      code: 'AEIP',
      companyName: 'Example Company'
    }));
    component.verifyCode();

    component.codeType = 'HANDLING_AGENT';
    component.onCodeTypeChange();
    component.sendRequest();

    expect(customerService.submitDeleteRequest).not.toHaveBeenCalled();
    expect(component.verifiedRecord).toBeNull();
  });

  it('displays not-found and lookup failure as distinct outcomes', () => {
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
