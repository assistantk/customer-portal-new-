import { BehaviorSubject, Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SessionLifecycleService } from './session-lifecycle.service';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

describe('SessionLifecycleService', () => {
  let service: SessionLifecycleService;
  let userSubject: BehaviorSubject<{ userId: string } | null>;
  let authService: {
    currentUser$: Observable<{ userId: string } | null>;
    logout: ReturnType<typeof vi.fn>;
    handleAuthExpired: ReturnType<typeof vi.fn>;
    sendLogoutBeacon: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.fn>;
  let visibilityState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    userSubject = new BehaviorSubject<{ userId: string } | null>({ userId: 'USER' });
    authService = {
      currentUser$: userSubject.asObservable(),
      logout: vi.fn(() => of({ success: true })),
      handleAuthExpired: vi.fn(() => userSubject.next(null)),
      sendLogoutBeacon: vi.fn()
    };
    navigate = vi.fn();
    visibilityState = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    service = new SessionLifecycleService(
      authService as unknown as AuthService,
      { navigate } as unknown as Router
    );
    service.start();
  });

  afterEach(() => {
    service.stop();
    visibilityState.mockRestore();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('logs out once at exactly four hours without meaningful activity', () => {
    vi.advanceTimersByTime(FOUR_HOURS_MS - 1);
    expect(authService.logout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/login']);

    vi.advanceTimersByTime(FOUR_HOURS_MS);
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('resets the inactivity deadline when meaningful activity occurs', () => {
    vi.advanceTimersByTime(FOUR_HOURS_MS - 1);
    document.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(FOUR_HOURS_MS - 1);
    expect(authService.logout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('cancels the hidden-duration deadline when the tab returns before four hours', () => {
    visibilityState.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(FOUR_HOURS_MS - 1);
    expect(authService.logout).not.toHaveBeenCalled();

    visibilityState.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('logs out immediately when returning after four hours hidden', () => {
    visibilityState.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.setSystemTime(Date.now() + FOUR_HOURS_MS);

    visibilityState.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('attempts logout on tab close without calling the normal logout request', () => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));

    expect(authService.sendLogoutBeacon).toHaveBeenCalledTimes(1);
    expect(authService.logout).not.toHaveBeenCalled();
  });
});
