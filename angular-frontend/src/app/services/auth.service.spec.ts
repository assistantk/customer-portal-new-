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

  it('sends the entered CAPTCHA with login credentials', () => {
    service.login({ username: ' RAILUSER ', password: 'secret', captchaInput: 'AbCd23' }).subscribe();

    const request = httpTestingController.expectOne('/api/auth/login');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      userId: 'RAILUSER',
      password: 'secret',
      captchaInput: 'AbCd23'
    });
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

  it('calls validate-user with userId, password, and divisionCode', () => {
    service.validateUser(' SREEJU ', 'test@123', ' tkd ').subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data?.designations).toContain('SR.DCM');
    });

    const req = httpTestingController.expectOne('/api/auth/validate-user');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({
      userId: 'SREEJU',
      password: 'test@123',
      divisionCode: 'TKD'
    });
    req.flush({
      success: true,
      data: {
        userId: 'SREEJU',
        divisionCode: 'TKD',
        designations: ['SR.DCM', 'DCM']
      }
    });
  });

  it('calls select-designation and triggers OTP generation', () => {
    service.selectDesignation('SR.DCM').subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data?.destinationMasked).toBe('******3868');
    });

    const req = httpTestingController.expectOne('/api/auth/select-designation');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ designation: 'SR.DCM' });
    req.flush({
      success: true,
      data: { destinationMasked: '******3868' }
    });
  });

  it('calls verify-otp and updates currentUser on success', () => {
    service.verifyOtp('123456').subscribe((res) => {
      expect(res.success).toBe(true);
      expect(service.currentUser?.userId).toBe('SREEJU');
      expect(service.currentUser?.userRole).toBe('SR.DCM');
    });

    const req = httpTestingController.expectOne('/api/auth/verify-otp');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ otp: '123456' });
    req.flush({
      success: true,
      data: { userId: 'SREEJU', userName: 'SREEJU KRISHNAN', userRole: 'SR.DCM' }
    });
  });
});
