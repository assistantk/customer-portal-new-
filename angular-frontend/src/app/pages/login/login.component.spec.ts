import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService, RmsValidateUserResponse, RmsSelectDesignationResponse, AuthResponse } from '../../services/auth.service';

describe('LoginComponent - 3-Step RMS Authentication Integration', () => {
  let component: LoginComponent;
  let authServiceMock: any;
  let routerMock: any;
  let activatedRouteMock: any;
  let cdrMock: ChangeDetectorRef;
  let fb: FormBuilder;

  beforeEach(() => {
    sessionStorage.clear();
    fb = new FormBuilder();

    authServiceMock = {
      getCaptcha: vi.fn(() => of({ image: 'data:image/png;base64,captcha-image' })),
      validateUser: vi.fn(),
      selectDesignation: vi.fn(),
      verifyOtp: vi.fn(),
      resendOtp: vi.fn(),
      setRmsTempUser: vi.fn((user) => {
        if (user) {
          sessionStorage.setItem('customer-portal.rms-temp-user', JSON.stringify(user));
        } else {
          sessionStorage.removeItem('customer-portal.rms-temp-user');
        }
      }),
      getRmsTempUser: vi.fn(() => {
        const raw = sessionStorage.getItem('customer-portal.rms-temp-user');
        return raw ? JSON.parse(raw) : null;
      })
    };

    routerMock = {
      navigate: vi.fn(),
      navigateByUrl: vi.fn()
    };

    activatedRouteMock = {
      snapshot: {
        queryParams: { returnUrl: '/registration' }
      }
    };
    cdrMock = { markForCheck: vi.fn() } as unknown as ChangeDetectorRef;

    component = new LoginComponent(
      fb,
      authServiceMock as AuthService,
      routerMock,
      activatedRouteMock,
      cdrMock
    );

    component.ngOnInit();
  });

  // Scenario 1: Valid mock credentials -> UI advances to Designation
  it('Scenario 1: advances to Designation step on valid mock credentials', () => {
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
        designations: ['SR-DCM', 'DCM', 'JDCM']
      }
    });
    responseSubject.complete();

    expect(component.loading).toBe(false);
    expect(component.currentStep).toBe('DESIGNATION');
    expect(component.loginForm.get('password')?.value).toBe('');
    expect(component.validatedUser?.userId).toBe('SREEJU');
    expect(component.availableDesignations).toEqual(['SR-DCM', 'DCM', 'JDCM']);
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
      activatedRouteMock,
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

  // Scenario 2: Invalid mock credentials -> error appears and UI remains on Credentials
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

  // Scenario 5: Successful designation retrieval -> dropdown is populated from development data source
  it('Scenario 5: populates designation list from configured development data source', () => {
    authServiceMock.validateUser.mockReturnValue(
      of({
        success: true,
        data: {
          userId: 'SREEJU',
          userName: 'SREEJU KRISHNAN',
          divisionCode: 'TKD',
          designations: ['SR-DCM', 'DCM', 'JDCM']
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
    expect(component.availableDesignations.length).toBe(3);
    expect(component.availableDesignations).toEqual(['SR-DCM', 'DCM', 'JDCM']);
    expect(component.designationForm.get('designation')?.value).toBe('');
  });

  it('initiates OTP when an available designation is selected', () => {
    component.currentStep = 'DESIGNATION';
    component.availableDesignations = ['SR-DCM', 'DCM'];
    component.designationForm.setValue({ designation: 'SR-DCM' });
    authServiceMock.selectDesignation.mockReturnValue(of({
      success: true,
      message: 'OTP sent.',
      data: { destinationMasked: '*****3868', resendCooldownSeconds: 300 }
    }));

    component.onSubmitDesignation();

    expect(authServiceMock.selectDesignation).toHaveBeenCalledWith('SR-DCM');
    expect(component.currentStep).toBe('OTP');
    expect(component.resendCooldown).toBe(60);
  });

  it('uses the resend endpoint and runs a one-minute countdown', () => {
    vi.useFakeTimers();
    component.currentStep = 'OTP';
    component.resendCooldown = 0;
    authServiceMock.resendOtp.mockReturnValue(of({
      success: true,
      data: { resendCooldownSeconds: 300 }
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

  // Scenario 6: Unauthorized designation -> access is denied without leaving the login card
  it('Scenario 6: reports an unauthorized designation without navigating away', () => {
    component.validatedUser = {
      userId: 'SREEJU',
      divisionCode: 'TKD',
      designations: ['SR-DCM', 'DCM']
    };
    component.availableDesignations = ['SR-DCM', 'DCM'];
    component.currentStep = 'DESIGNATION';
    component.designationForm.setValue({ designation: 'DCM' });

    authServiceMock.selectDesignation.mockReturnValue(
      throwError(() => ({
        status: 403,
        error: {
          success: false,
          accessDenied: true,
          message: 'Access Restricted: This website is available only to authorized Senior DCM users.'
        }
      }))
    );

    component.onSubmitDesignation();

    expect(component.loading).toBe(false);
    expect(component.currentStep).toBe('DESIGNATION');
    expect(component.error).toContain('Access Restricted');
    expect(component.designationForm.get('designation')?.value).toBe('');
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  // Scenario 7: Successful OTP verification -> authorized user reaches home page
  it('Scenario 7: completes OTP verification and redirects authorized user to returnUrl', () => {
    vi.useFakeTimers();

    component.currentStep = 'OTP';
    component.otpForm.setValue({ otp: '123456' });

    authServiceMock.verifyOtp.mockReturnValue(
      of({
        success: true,
        message: 'Authentication successful.',
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
    expect(component.successMessage).toContain('Authentication successful');

    vi.advanceTimersByTime(350);
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/registration');

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
