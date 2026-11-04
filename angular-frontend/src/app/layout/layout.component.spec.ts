// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError, Subject } from 'rxjs';
import { LayoutComponent } from './layout.component';

describe('LayoutComponent - Logout Behaviour', () => {
  let component: LayoutComponent;
  let routerMock: any;
  let authServiceMock: any;
  let notificationServiceMock: any;

  beforeEach(() => {
    routerMock = {
      navigate: vi.fn(),
      url: '/registration'
    };

    authServiceMock = {
      currentUser$: of({ userId: 'SREEJU', userRole: 'SR-DCM' }),
      checkSession: vi.fn(() => of({ authenticated: true })),
      logout: vi.fn(() => of({ success: true, message: 'Logged out successfully.' }))
    };

    notificationServiceMock = {
      error: vi.fn(),
      success: vi.fn()
    };

    component = new LayoutComponent(routerMock, authServiceMock, notificationServiceMock);
    component.ngOnInit();
  });

  it('invokes authService.logout exactly once on logout click and redirects to login with replaceUrl: true', () => {
    sessionStorage.setItem('test-key', 'test-val');

    component.onLogout();

    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(component.isLoggingOut).toBe(false);
    expect(sessionStorage.getItem('test-key')).toBeNull();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
  });

  it('prevents multiple simultaneous logout requests while request is in flight', () => {
    const logoutSubject = new Subject<any>();
    authServiceMock.logout = vi.fn(() => logoutSubject.asObservable());

    component.onLogout();
    expect(component.isLoggingOut).toBe(true);
    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);

    // Second click while in flight
    component.onLogout();
    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);

    // Complete first logout
    logoutSubject.next({ success: true });
    logoutSubject.complete();
    expect(component.isLoggingOut).toBe(false);
  });

  it('displays error notification and does not redirect when logout API returns error response', () => {
    authServiceMock.logout = vi.fn(() => of({ success: false, message: 'Backend session could not be terminated.' }));

    component.onLogout();

    expect(component.isLoggingOut).toBe(false);
    expect(notificationServiceMock.error).toHaveBeenCalledWith('Logout Failed', 'Backend session could not be terminated.');
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('displays error notification and resets loading when logout API throws network/HTTP error', () => {
    authServiceMock.logout = vi.fn(() => throwError(() => ({
      error: { message: 'RMS logout rejected: RMS service unreachable.' }
    })));

    component.onLogout();

    expect(component.isLoggingOut).toBe(false);
    expect(notificationServiceMock.error).toHaveBeenCalledWith('Logout Failed', 'RMS logout rejected: RMS service unreachable.');
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });
});

