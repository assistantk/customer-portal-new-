import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, tap } from 'rxjs';
import { API_BASE_URL } from './api-config';

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
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  authenticated?: boolean;
  data?: AuthUserData;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = `${API_BASE_URL}/auth`;
  private readonly cachedUserKey = 'customer-portal.authenticated-user';
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

  login(req: LoginRequest): Observable<AuthResponse> {
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
        this.updateCurrentUser(null);
      }),
      catchError(() => {
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