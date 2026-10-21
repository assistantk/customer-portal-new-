import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';

export interface LoginRequest {
  username: string;
  password: string;
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
  private readonly API = '/api/auth';
  private currentUserSubject = new BehaviorSubject<AuthUserData | null>(null);
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
    this.currentUserSubject.next(user);
  }

  login(req: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API}/login`, {
      userId: req.username.trim(),
      password: req.password
    }, { withCredentials: true }).pipe(
      tap((res) => {
        if (res && res.success && res.data) {
          this.currentUserSubject.next(res.data);
        } else if (res && res.success) {
          this.currentUserSubject.next({ userId: req.username.trim() });
        }
      })
    );
  }

  logout(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => {
        this.currentUserSubject.next(null);
      }),
      catchError(() => {
        this.currentUserSubject.next(null);
        return of({ success: true, message: 'Logged out' });
      })
    );
  }

  checkSession(): Observable<AuthResponse> {
    return this.http.get<AuthResponse>(`${this.API}/session`, { withCredentials: true }).pipe(
      tap((res) => {
        this.sessionCheckedSubject.next(true);
        if (res && res.authenticated && res.data) {
          this.currentUserSubject.next(res.data);
        } else {
          this.currentUserSubject.next(null);
        }
      }),
      catchError(() => {
        this.sessionCheckedSubject.next(true);
        this.currentUserSubject.next(null);
        return of({ success: false, authenticated: false });
      })
    );
  }

  register(req: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API}/register`, req, { withCredentials: true });
  }

  handleAuthExpired(): void {
    this.currentUserSubject.next(null);
  }
}