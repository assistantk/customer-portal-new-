import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService, AuthUserData } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
    sessionStorage.clear();
  });

  it('restores the cached user immediately after a page refresh', () => {
    const user: AuthUserData = {
      userId: 'RAILUSER',
      userName: 'Rail User',
      userRole: 'USER',
      email: 'rail.user@example.org'
    };
    service.setCurrentUser(user);

    const refreshedService = new AuthService(TestBed.inject(HttpClient));

    expect(refreshedService.currentUser).toEqual(user);
  });

  it('confirms the cached user against the server session after refresh', () => {
    const cachedUser: AuthUserData = { userId: 'RAILUSER', userName: 'Rail User' };
    sessionStorage.setItem('customer-portal.authenticated-user', JSON.stringify(cachedUser));
    service = new AuthService(TestBed.inject(HttpClient));

    service.checkSession().subscribe();
    httpTestingController.expectOne('/api/auth/session').flush({
      success: true,
      authenticated: true,
      data: { userId: 'RAILUSER', userName: 'Rail User', userRole: 'USER' }
    });
    expect(service.currentUser?.userId).toBe('RAILUSER');
  });

  it('loads a CAPTCHA image using the session cookie', () => {
    service.getCaptcha().subscribe((response) => {
      expect(response.image).toBe('data:image/png;base64,captcha-image');
    });

    const request = httpTestingController.expectOne('/api/auth/captcha');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ image: 'data:image/png;base64,captcha-image' });
  });

  it('uses the existing POST logout endpoint and clears the authenticated user', () => {
    service.setCurrentUser({ userId: 'RAILUSER' });
    service.logout().subscribe((response) => expect(response.success).toBe(true));

    const request = httpTestingController.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ success: true });

    expect(service.currentUser).toBeNull();
    expect(sessionStorage.getItem('customer-portal.authenticated-user')).toBeNull();
  });

  it('clears local auth state when the server invalidates the session but RMS logout fails', () => {
    service.setCurrentUser({ userId: 'RAILUSER' });
    service.logout().subscribe({ error: () => undefined });

    const request = httpTestingController.expectOne('/api/auth/logout');
    request.flush(
      { success: false, message: 'RMS logout failed.' },
      { status: 502, statusText: 'Bad Gateway' }
    );

    expect(service.currentUser).toBeNull();
    expect(sessionStorage.getItem('customer-portal.authenticated-user')).toBeNull();
  });

  it('sends the entered CAPTCHA with login credentials', () => {
    service.login({ username: ' RAILUSER ', password: 'secret', captchaInput: 'AbCd23' }).subscribe();

    const request = httpTestingController.expectOne('/api/auth/login');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      userId: 'RAILUSER',
      password: 'secret',
      captchaInput: 'AbCd23'
    });
    expect(sessionStorage.length).toBe(0);
    request.flush({ success: false, message: 'Invalid User ID/Email or Password.' });
  });

  it('clears cached user data when the server session has expired', () => {
    sessionStorage.setItem('customer-portal.authenticated-user', JSON.stringify({ userId: 'RAILUSER' }));
    service = new AuthService(TestBed.inject(HttpClient));

    service.checkSession().subscribe();
    httpTestingController.expectOne('/api/auth/session').flush(
      { success: false, authenticated: false },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(service.currentUser).toBeNull();
    expect(sessionStorage.getItem('customer-portal.authenticated-user')).toBeNull();
  });

  it('keeps cached user data when the session check fails due to a network error', () => {
    const user: AuthUserData = { userId: 'RAILUSER', userName: 'Rail User' };
    sessionStorage.setItem('customer-portal.authenticated-user', JSON.stringify(user));
    service = new AuthService(TestBed.inject(HttpClient));

    service.checkSession().subscribe();
    httpTestingController.expectOne('/api/auth/session').error(new ProgressEvent('network error'));

    expect(service.currentUser).toEqual(user);
    expect(sessionStorage.getItem('customer-portal.authenticated-user')).toBe(JSON.stringify(user));
  });

  it('calls validate-user with userId, password, divisionCode, and CAPTCHA', () => {
    service.validateUser(' SREEJU ', 'test@123', ' tkd ', ' AbCd23 ').subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data?.designations).toContain('SR-DCM');
    });

    const req = httpTestingController.expectOne('/api/auth/validate-user');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({
      userId: 'SREEJU',
      password: 'test@123',
      divisionCode: 'TKD',
      captchaInput: 'AbCd23'
    });
    req.flush({
      success: true,
      data: {
        userId: 'SREEJU',
        divisionCode: 'TKD',
        designations: ['SR-DCM', 'DCM']
      }
    });
  });

  it('calls select-designation and triggers OTP generation', () => {
    service.selectDesignation('SR-DCM').subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data?.destinationMasked).toBe('******3868');
    });

    const req = httpTestingController.expectOne('/api/auth/select-designation');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ designation: 'SR-DCM' });
    req.flush({
      success: true,
      data: { destinationMasked: '******3868' }
    });
  });

  it('calls the dedicated resend-otp endpoint', () => {
    service.resendOtp('SR-DCM').subscribe((res) => {
      expect(res.success).toBe(true);
    });

    const req = httpTestingController.expectOne('/api/auth/resend-otp');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ designation: 'SR-DCM' });
    req.flush({ success: true });
  });

  it('calls verify-otp and updates currentUser on success', () => {
    service.verifyOtp('78901').subscribe((res) => {
      expect(res.success).toBe(true);
      expect(service.currentUser?.userId).toBe('SREEJU');
      expect(service.currentUser?.userRole).toBe('DCM');
      expect(service.currentUser?.designation).toBe('DCM');
    });

    const req = httpTestingController.expectOne('/api/auth/verify-otp');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ otp: '78901' });
    req.flush({
      success: true,
      data: { userId: 'SREEJU', userName: 'SREEJU KRISHNAN', userRole: 'DCM', designation: 'DCM' }
    });
  });
});
