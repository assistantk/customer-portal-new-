import { HttpErrorResponse, HttpHandler, HttpRequest } from '@angular/common/http';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  it('clears local authentication state for an unauthenticated response without replacement messaging', () => {
    const authService = {
      handleAuthExpired: vi.fn(),
      logout: vi.fn()
    };
    const interceptor = new AuthInterceptor(authService as unknown as AuthService);
    const handler = {
      handle: vi.fn(() => throwError(() => new HttpErrorResponse({
        status: 401,
        error: { success: false, code: 'SESSION_EXPIRED' }
      })))
    };

    interceptor.intercept(
      new HttpRequest('GET', '/api/customers/lookup'),
      handler as unknown as HttpHandler
    ).subscribe({ error: () => undefined });

    expect(authService.handleAuthExpired).toHaveBeenCalledTimes(1);
    expect(authService.logout).not.toHaveBeenCalled();
  });
});
