import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, tap, throwError } from 'rxjs';
import { API_BASE_URL, isSecureApiTransport } from './api-config';
import { environment } from '../../environments/environment';

export interface LoginRequest {
  username: string;
  password: string;
  captchaInput: string;
}

export interface CaptchaResponse {
  image: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export interface AuthUserData {
  userId: string;
  userName?: string;
  userRole?: string;
  isActive?: string;
  email?: string;
  phoneNumber?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  authenticated?: boolean;
  accessDenied?: boolean;
  data?: AuthUserData;
  error?: string;
}

export interface RmsValidatedUserData {
  userId: string;
  userName?: string;
  divisionCode: string;
  designations: string[];
}

export interface RmsValidateUserResponse {
  success: boolean;
  message?: string;
  data?: RmsValidatedUserData;
  error?: string;
}

export interface RmsSelectDesignationResponse {
  success: boolean;
  accessDenied?: boolean;
  message?: string;
  retryAfterSeconds?: number;
  data?: {
    destinationMasked?: string;
    selectedDesignation?: string;
    resendCooldownSeconds?: number;
  };
  error?: string;
}

export interface RmsOtpResendResponse {
  success: boolean;
  message?: string;
  data?: {
    destinationMasked?: string;
    resendCooldownSeconds?: number;
  };
  retryAfterSeconds?: number;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = `${API_BASE_URL}/auth`;
  private readonly cachedUserKey = 'customer-portal.authenticated-user';
  private readonly rmsTempUserKey = 'customer-portal.rms-temp-user';
  private currentUserSubject = new BehaviorSubject<AuthUserData | null>(this.readCachedUser());
  public currentUser$ = this.currentUserSubject.asObservable();
  private sessionCheckedSubject = new BehaviorSubject<boolean>(false);
  public sessionChecked$ = this.sessionCheckedSubject.asObservable();

  constructor(private http: HttpClient) {}

  public get currentUser(): AuthUserData | null {
    return this.currentUserSubject.value;
  }

  public get isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  public setCurrentUser(user: AuthUserData | null): void {
    this.updateCurrentUser(user);
  }

  public setRmsTempUser(user: RmsValidatedUserData | null): void {
    if (user) {
      sessionStorage.setItem(this.rmsTempUserKey, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(this.rmsTempUserKey);
    }
  }

  public getRmsTempUser(): RmsValidatedUserData | null {
    const raw = sessionStorage.getItem(this.rmsTempUserKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.userId && Array.isArray(parsed.designations)) {
        return parsed as RmsValidatedUserData;
      }
    } catch {
      sessionStorage.removeItem(this.rmsTempUserKey);
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // Multi-step RMS Authentication
  // ─────────────────────────────────────────────────────────────

  /**
   * Step 1: Validate User ID, Password, and Division Code
   */
  validateUser(userId: string, password: string, divisionCode: string, captchaInput: string): Observable<RmsValidateUserResponse> {
    if (!this.isSecureLoginTransport()) {
      return throwError(() => new Error('Secure HTTPS connection required for login.'));
    }

    return this.http.post<RmsValidateUserResponse>(
      `${this.API}/validate-user`,
      {
        userId: userId.trim().toUpperCase(),
        password: password,
        divisionCode: divisionCode.trim().toUpperCase(),
        captchaInput: captchaInput.trim()
      },
      { withCredentials: true }
    );
  }

  private isSecureLoginTransport(): boolean {
    return !environment.production ||
      (typeof window !== 'undefined' && isSecureApiTransport(window.location.href, this.API));
  }

  /**
   * Step 2: Select Designation & Trigger OTP Generation
   */
  selectDesignation(designation: string): Observable<RmsSelectDesignationResponse> {
    return this.http.post<RmsSelectDesignationResponse>(
      `${this.API}/select-designation`,
      { designation: designation.trim() },
      { withCredentials: true }
    );
  }

  /**
   * Resend OTP with cooldown
   */
  resendOtp(): Observable<RmsOtpResendResponse> {
    return this.http.post<RmsOtpResendResponse>(
      `${this.API}/resend-otp`,
      {},
      { withCredentials: true }
    );
  }

  /**
   * Step 3: Verify OTP and establish authenticated session
   */
  verifyOtp(otp: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.API}/verify-otp`,
      { otp: otp.trim() },
      { withCredentials: true }
    ).pipe(
      tap((res) => {
        if (res && res.success && res.data) {
          this.setRmsTempUser(null);
          this.updateCurrentUser(res.data);
        }
      })
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Legacy / Common Auth Endpoints
  // ─────────────────────────────────────────────────────────────

  login(req: LoginRequest): Observable<AuthResponse> {
    if (!this.isSecureLoginTransport()) {
      return throwError(() => new Error('Secure HTTPS connection required for login.'));
    }

    return this.http.post<AuthResponse>(`${this.API}/login`, {
      userId: req.username.trim(),
      password: req.password,
      captchaInput: req.captchaInput
    }, { withCredentials: true }).pipe(
      tap((res) => {
        if (res && res.success && res.data) {
          this.updateCurrentUser(res.data);
        } else if (res && res.success) {
          this.updateCurrentUser({ userId: req.username.trim() });
        }
      })
    );
  }

  getCaptcha(): Observable<CaptchaResponse> {
    return this.http.get<CaptchaResponse>(`${this.API}/captcha`, { withCredentials: true });
  }

  logout(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => {
        this.setRmsTempUser(null);
        this.updateCurrentUser(null);
      }),
      catchError(() => {
        this.setRmsTempUser(null);
        this.updateCurrentUser(null);
        return of({ success: true, message: 'Logged out' });
      })
    );
  }

  checkSession(): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(`${this.API}/session`, { withCredentials: true }).pipe(
      tap((res) => {
        this.sessionCheckedSubject.next(true);
        if (res && res.authenticated && res.data) {
          this.updateCurrentUser(res.data);
        } else {
          this.updateCurrentUser(null);
        }
      }),
      catchError((error: HttpErrorResponse) => {
        this.sessionCheckedSubject.next(true);
        if (error.status === 401) {
          this.updateCurrentUser(null);
        }
        return of({ success: false, authenticated: false });
      })
    );
  }

  register(req: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API}/register`, req, { withCredentials: true });
  }

  handleAuthExpired(): void {
    this.setRmsTempUser(null);
    this.updateCurrentUser(null);
  }

  private updateCurrentUser(user: AuthUserData | null): void {
    this.currentUserSubject.next(user);
    if (user) {
      sessionStorage.setItem(this.cachedUserKey, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(this.cachedUserKey);
    }
  }

  private readCachedUser(): AuthUserData | null {
    const cachedUser = sessionStorage.getItem(this.cachedUserKey);
    if (!cachedUser) {
      return null;
    }

    try {
      const user: unknown = JSON.parse(cachedUser);
      if (user && typeof user === 'object' && 'userId' in user && typeof user.userId === 'string') {
        return user as AuthUserData;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
    }

    sessionStorage.removeItem(this.cachedUserKey);
    return null;
  }
}
