// @vitest-environment jsdom
import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef, NgModule } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService, RmsValidateUserResponse, RmsSelectDesignationResponse, AuthResponse } from '../../services/auth.service';

@NgModule({
  imports: [ReactiveFormsModule],
  declarations: [LoginComponent]
})
export class LoginComponentTestModule {}

describe('LoginComponent - 3-Step RMS Authentication Integration', () => {
  let component: LoginComponent;
  let authServiceMock: any;
  let routerMock: any;
  let cdrMock: ChangeDetectorRef;
  let fb: FormBuilder;

  beforeEach(() => {
    if (typeof sessionStorage === 'undefined') {
      const storage: Record<string, string> = {};
      (globalThis as any).sessionStorage = {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => { storage[k] = String(v); },
        removeItem: (k: string) => { delete storage[k]; },
        clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
        key: (i: number) => Object.keys(storage)[i] ?? null,
        length: 0
      };
    }
    sessionStorage.clear();
    fb = new FormBuilder();

    authServiceMock = {
      getCaptcha: vi.fn(() => of({ image: 'data:image/png;base64,captcha-image' })),
      validateUser: vi.fn(),
      selectDesignation: vi.fn(() => of({ success: true, message: 'OTP request accepted.', data: { destinationMasked: '*****3868', resendCooldownSeconds: 60 } })),
      generateOtp: vi.fn(),
      regenerateOtp: vi.fn(),
      verifyOtp: vi.fn(),
      resendOtp: vi.fn(() => of({ success: true, message: 'OTP resend request accepted.', data: { destinationMasked: '*****3868', resendCooldownSeconds: 60 } })),
      getOtpStatus: vi.fn(() => of({ success: false })),
      setRmsTempUser: vi.fn((user) => {
        if (user) {
          sessionStorage.setItem('customer-portal.rms-temp-user', JSON.stringify(user));
        } else {
          sessionStorage.removeItem('customer-portal.rms-temp-user');
        }
      }),
      setCurrentUser: vi.fn(),
      logout: vi.fn(() => of({ success: true })),
      getRmsTempUser: vi.fn(() => {
        const raw = sessionStorage.getItem('customer-portal.rms-temp-user');
        return raw ? JSON.parse(raw) : null;
      })
    };

    routerMock = {
      navigate: vi.fn(),
      navigateByUrl: vi.fn()
    };

    cdrMock = { markForCheck: vi.fn() } as unknown as ChangeDetectorRef;

    component = new LoginComponent(
      fb,
      authServiceMock as AuthService,
      routerMock,
      cdrMock
    );

    component.ngOnInit();
  });

  // Scenario 1: Valid RMS credentials -> UI advances to Designation
  it('Scenario 1: advances to Designation step on successful RMS validation', () => {
    const responseSubject = new Subject<RmsValidateUserResponse>();
    authServiceMock.validateUser.mockReturnValue(responseSubject.asObservable());

    component.loginForm.setValue({
      userId: 'SREEJU',
      password: 'test@123',
      divisionCode: 'TKD',
      captchaInput: 'AbCd23'
    });

    component.onSubmitLogin();

    // While in-flight, loading must be true
    expect(component.loading).toBe(true);
    expect(authServiceMock.validateUser).toHaveBeenCalledWith('SREEJU', 'test@123', 'TKD', 'AbCd23');

    // Mock successful backend response
    responseSubject.next({
      success: true,
      message: 'Credentials validated successfully.',
      data: {
        userId: 'SREEJU',
        userName: 'SREEJU KRISHNAN',
        divisionCode: 'TKD',
        designations: [' RAS-ADMN  ', 'DEV-OPS', 'YARD-YM', 'DY-TRAINS', 'COM', 'SR-DCM', 'HELP-DESK', 'YARD-CYM', 'YARD-YS']
      }
    });
    responseSubject.complete();

    expect(component.loading).toBe(false);
    expect(component.currentStep).toBe('DESIGNATION');
    expect(component.loginForm.get('password')?.value).toBe('');
    expect(component.validatedUser?.userId).toBe('SREEJU');
    expect(component.availableDesignations).toEqual([
      'RAS-ADMN', 'DEV-OPS', 'YARD-YM', 'DY-TRAINS', 'COM',
      'SR-DCM', 'HELP-DESK', 'YARD-CYM', 'YARD-YS'
    ]);
    expect(component.designationForm.get('designation')?.value).toBe('');
    expect(component.error).toBe('');
    expect(authServiceMock.setRmsTempUser).toHaveBeenCalled();
    expect(cdrMock.markForCheck).toHaveBeenCalled();
  });

  it('starts on the credentials step and clears cached RMS flow data after reload', () => {
    sessionStorage.setItem('customer-portal.rms-temp-user', JSON.stringify({
      userId: 'SREEJU',
      divisionCode: 'TKD',
      designations: ['SR-DCM']
    }));

    const reloadedComponent = new LoginComponent(
      fb,
      authServiceMock as AuthService,
      routerMock,
      cdrMock
    );
    reloadedComponent.ngOnInit();

    expect(reloadedComponent.currentStep).toBe('LOGIN');
    expect(reloadedComponent.validatedUser).toBeNull();
    expect(reloadedComponent.availableDesignations).toEqual([]);
    expect(sessionStorage.getItem('customer-portal.rms-temp-user')).toBeNull();
    expect(authServiceMock.getCaptcha).toHaveBeenCalledTimes(2);
    expect(reloadedComponent.captchaImage).toBe('data:image/png;base64,captcha-image');
  });

  it('requires CAPTCHA before sending credentials for validation', () => {
    component.loginForm.setValue({
      userId: 'SREEJU',
      password: 'test@123',
      divisionCode: 'TKD',
      captchaInput: ''
    });

    component.onSubmitLogin();

    expect(component.error).toBe('Please enter the CAPTCHA shown.');
    expect(authServiceMock.validateUser).not.toHaveBeenCalled();
  });

  it('converts typed User ID characters to uppercase', () => {
    const input = document.createElement('input');
    input.value = 'railuser';
    input.setSelectionRange(4, 4);

    component.uppercaseUserId({ target: input } as unknown as Event);

    expect(input.value).toBe('RAILUSER');
    expect(component.loginForm.get('userId')?.value).toBe('RAILUSER');
    expect(input.selectionStart).toBe(4);
  });

  // Scenario 2: Invalid credentials -> error appears and UI remains on Credentials
  it('Scenario 2: displays error and remains on Credentials step on invalid credentials', () => {
    authServiceMock.validateUser.mockReturnValue(
      throwError(() => ({
        status: 401,
        error: { success: false, message: 'Invalid User ID or Password.' }
      }))
    );

    component.loginForm.setValue({
      userId: 'SREEJU',
      password: 'wrongpassword',
      divisionCode: 'TKD',
      captchaInput: 'AbCd23'
    });

    component.onSubmitLogin();

    expect(component.loading).toBe(false);
    expect(component.currentStep).toBe('LOGIN');
    expect(component.error).toBe('Invalid User ID or Password.');
  });

  // Scenario 3: Backend unavailable -> error appears and loading stops
  it('Scenario 3: handles backend unavailable error (status 0 / 503) and stops loading', () => {
    authServiceMock.validateUser.mockReturnValue(
      throwError(() => ({
        status: 0,
        message: 'Http failure response: 0 Unknown Error'
      }))
    );

    component.loginForm.setValue({
      userId: 'SREEJU',
      password: 'test@123',
      divisionCode: 'TKD',
      captchaInput: 'AbCd23'
    });

    component.onSubmitLogin();

    expect(component.loading).toBe(false);
    expect(component.currentStep).toBe('LOGIN');
    expect(component.error).toContain('Unable to reach the authentication service');
  });

  // Scenario 4: Malformed response -> controlled error appears and loading stops
  it('Scenario 4: handles malformed response with empty designations and stops loading', () => {
    authServiceMock.validateUser.mockReturnValue(
      of({
        success: true,
        message: 'Validated but no designations found',
        data: {
          userId: 'SREEJU',
          divisionCode: 'TKD',
          designations: []
        }
      })
    );

    component.loginForm.setValue({
      userId: 'SREEJU',
      password: 'test@123',
      divisionCode: 'TKD',
      captchaInput: 'AbCd23'
    });

    component.onSubmitLogin();

    expect(component.loading).toBe(false);
    expect(component.currentStep).toBe('LOGIN');
    expect(component.error).toContain('No designations found for your account');
  });

  // Scenario 5: Successful designation retrieval -> dropdown contains API-returned roles
  it('Scenario 5: populates the designation list directly from the API response', () => {
    authServiceMock.validateUser.mockReturnValue(
      of({
        success: true,
        data: {
          userId: 'SREEJU',
          userName: 'SREEJU KRISHNAN',
          divisionCode: 'TKD',
          designations: [' RAS-ADMN  ', 'DEV-OPS', 'YARD-YM', 'DY-TRAINS', 'COM', 'SR-DCM', 'HELP-DESK', 'YARD-CYM', 'YARD-YS']
        }
      })
    );

    component.loginForm.setValue({
      userId: 'SREEJU',
      password: 'test@123',
      divisionCode: 'TKD',
      captchaInput: 'AbCd23'
    });

    component.onSubmitLogin();

    expect(component.currentStep).toBe('DESIGNATION');
    expect(component.availableDesignations).toEqual([
      'RAS-ADMN', 'DEV-OPS', 'YARD-YM', 'DY-TRAINS', 'COM',
      'SR-DCM', 'HELP-DESK', 'YARD-CYM', 'YARD-YS'
    ]);
    expect(component.designationForm.get('designation')?.value).toBe('');
  });

  it('does not display roles when credential validation is unsuccessful', () => {
    authServiceMock.validateUser.mockReturnValue(of({
      success: false,
      message: 'Invalid credentials.',
      data: {
        userId: 'SREEJU',
        divisionCode: 'TKD',
        designations: ['SR-DCM']
      }
    }));
    component.loginForm.setValue({
      userId: 'SREEJU',
      password: 'wrong-password',
      divisionCode: 'TKD',
      captchaInput: 'AbCd23'
    });

    component.onSubmitLogin();

    expect(component.currentStep).toBe('LOGIN');
    expect(component.availableDesignations).toEqual([]);
    expect(component.error).toBe('Invalid credentials.');
  });

  it('shows all role values returned by the API even if portal access is later denied', () => {
    authServiceMock.validateUser.mockReturnValue(of({
      success: true,
      data: {
        userId: 'SREEJU',
        userName: 'SREEJU KRISHNAN',
        divisionCode: 'TKD',
        designations: ['DCM', 'JDCM']
      }
    }));
    component.loginForm.setValue({
      userId: 'SREEJU',
      password: 'test@123',
      divisionCode: 'TKD',
      captchaInput: 'AbCd23'
    });

    component.onSubmitLogin();

    expect(component.currentStep).toBe('DESIGNATION');
    expect(component.availableDesignations).toEqual(['DCM', 'JDCM']);
    expect(component.error).toBe('');
  });

  it('initiates OTP when an available designation is selected', () => {
    component.currentStep = 'DESIGNATION';
    component.availableDesignations = ['SR-DCM', 'DCM'];
    component.designationForm.setValue({ designation: 'SR-DCM' });
    authServiceMock.selectDesignation.mockReturnValue(of({
      success: true,
      message: 'OTP request accepted.',
      data: { destinationMasked: '*****3868', resendCooldownSeconds: 60 }
    }));

    component.onSubmitDesignation();

    expect(authServiceMock.selectDesignation).toHaveBeenCalledTimes(1);
    expect(authServiceMock.selectDesignation).toHaveBeenCalledWith('SR-DCM');
    expect(authServiceMock.generateOtp).not.toHaveBeenCalled();
    expect(authServiceMock.regenerateOtp).not.toHaveBeenCalled();
    expect(component.currentStep).toBe('OTP');
    expect(component.resendCooldown).toBe(60);
  });

  it('uses the resend endpoint and runs a one-minute countdown', () => {
    vi.useFakeTimers();
    component.currentStep = 'OTP';
    component.resendCooldown = 0;
    authServiceMock.resendOtp.mockReturnValue(of({
      success: true,
      data: { resendCooldownSeconds: 60 }
    }));

    component.resendOtp();

    expect(authServiceMock.resendOtp).toHaveBeenCalledTimes(1);
    expect(authServiceMock.selectDesignation).not.toHaveBeenCalled();
    expect(component.resendCooldown).toBe(60);
    expect(component.resendCooldownDisplay).toBe('01:00');

    vi.advanceTimersByTime(1000);
    expect(component.resendCooldown).toBe(59);
    vi.advanceTimersByTime(59000);
    expect(component.resendCooldown).toBe(0);

    component.ngOnDestroy();
    vi.useRealTimers();
  });

  it('does not send a resend request while the cooldown is active', () => {
    component.currentStep = 'OTP';
    component.resendCooldown = 30;

    component.resendOtp();

    expect(authServiceMock.resendOtp).not.toHaveBeenCalled();
  });

  it('recovers pending OTP step and remaining cooldown on page reload', () => {
    vi.useFakeTimers();
    authServiceMock.getOtpStatus.mockReturnValue(of({
      success: true,
      data: {
        step: 'OTP_PENDING',
        userId: 'SREEJU',
        divisionCode: 'TKD',
        selectedDesignation: 'SR-DCM',
        destinationMasked: '*****3868',
        resendCooldownSeconds: 45
      }
    }));

    const freshComponent = new LoginComponent(
      fb,
      authServiceMock as AuthService,
      routerMock,
      cdrMock
    );
    freshComponent.ngOnInit();

    expect(freshComponent.currentStep).toBe('OTP');
    expect(freshComponent.maskedDestination).toBe('*****3868');
    expect(freshComponent.resendCooldown).toBe(45);
    expect(freshComponent.resendCooldownDisplay).toBe('00:45');

    vi.advanceTimersByTime(1000);
    expect(freshComponent.resendCooldown).toBe(44);
    expect(freshComponent.resendCooldownDisplay).toBe('00:44');

    freshComponent.ngOnDestroy();
    vi.useRealTimers();
  });


  it('initiates OTP after an available RMS designation is selected', () => {
    component.currentStep = 'DESIGNATION';
    component.availableDesignations = ['SR-DCM', 'Senior DCM', 'DCM'];
    component.designationForm.setValue({ designation: 'SR-DCM' });
    authServiceMock.selectDesignation.mockReturnValue(of({
      success: true,
      message: 'OTP request accepted.',
      data: { destinationMasked: '*****3868', resendCooldownSeconds: 60 }
    }));

    component.onSubmitDesignation();

    expect(authServiceMock.selectDesignation).toHaveBeenCalledTimes(1);
    expect(authServiceMock.selectDesignation).toHaveBeenCalledWith('SR-DCM');
    expect(component.currentStep).toBe('OTP');
    expect(component.resendCooldown).toBe(60);
  });

  it('allows OTP generation when another returned designation is selected', () => {
    component.currentStep = 'DESIGNATION';
    component.availableDesignations = ['Senior DFM', 'Senior DCM', 'DCM'];
    component.designationForm.setValue({ designation: 'Senior DFM' });
    component.onSubmitDesignation();

    expect(authServiceMock.selectDesignation).toHaveBeenCalledWith('Senior DFM');
    expect(authServiceMock.generateOtp).not.toHaveBeenCalled();
    expect(authServiceMock.regenerateOtp).not.toHaveBeenCalled();
    expect(component.currentStep).toBe('OTP');
    expect(component.error).toBe('');
  });

  // Scenario 6: Any designation returned by RMS can be submitted for OTP
  it('Scenario 6: allows a returned non-SR-DCM designation to request an OTP', () => {
    component.validatedUser = {
      userId: 'SREEJU',
      divisionCode: 'TKD',
      designations: ['SR-DCM', 'DCM']
    };
    component.availableDesignations = ['SR-DCM', 'DCM'];
    component.currentStep = 'DESIGNATION';
    component.designationForm.setValue({ designation: 'DCM' });

    component.onSubmitDesignation();

    expect(component.loading).toBe(false);
    expect(component.currentStep).toBe('OTP');
    expect(component.error).toBe('');
    expect(authServiceMock.selectDesignation).toHaveBeenCalledWith('DCM');
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  // Scenario 7: Successful OTP verification sends every role to Home
  it('Scenario 7: completes OTP verification and redirects the user to Home', () => {
    vi.useFakeTimers();

    component.currentStep = 'OTP';
    component.otpForm.setValue({ otp: '78901' });

    authServiceMock.verifyOtp.mockReturnValue(
      of({
        success: true,
        message: 'Verification Successful.',
        data: {
          userId: 'SREEJU',
          userName: 'SREEJU KRISHNAN',
          userRole: 'SR-DCM',
          isActive: 'Y'
        }
      })
    );

    component.onSubmitOtp();

    expect(component.loading).toBe(false);
    expect(component.successMessage).toContain('Verification Successful');

    vi.advanceTimersByTime(350);
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/home');

    vi.useRealTimers();
  });

  // Scenario 8: Loading indicator stopped on reset and state cleared
  it('Scenario 8: stops loading indicator and clears state on reset', () => {
    component.loading = true;
    component.error = 'Some error';
    component.currentStep = 'DESIGNATION';

    component.restartLogin();

    expect(component.loading).toBe(false);
    expect(component.error).toBe('');
    expect(component.currentStep).toBe('LOGIN');
    expect(component.validatedUser).toBeNull();
    expect(authServiceMock.setRmsTempUser).toHaveBeenCalledWith(null);
  });
});
