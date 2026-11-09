// @vitest-environment jsdom
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, Observable, of } from 'rxjs';
import { AuthGuard, SrDcmAccessGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('Authentication guards', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/registration' } as RouterStateSnapshot;

  function createGuard(
    sessionResponse: { authenticated: boolean; data?: { designation?: string; userRole?: string } },
    cachedUser = false
  ) {
    const authService = {
      isAuthenticated: cachedUser,
      checkSession: vi.fn(() => of(sessionResponse))
    };
    const router = {
      navigate: vi.fn(),
      createUrlTree: vi.fn((commands: string[]) => ({ route: commands[0] }))
    };
    return {
      authGuard: new AuthGuard(authService as unknown as AuthService, router as unknown as Router),
      roleGuard: new SrDcmAccessGuard(authService as unknown as AuthService, router as unknown as Router),
      authService,
      router
    };
  }

  async function resolveAuthGuard(guard: AuthGuard): Promise<boolean> {
    const result = guard.canActivate(route, state);
    return result instanceof Observable ? firstValueFrom(result) : result;
  }

  async function resolveRoleGuard(guard: SrDcmAccessGuard): Promise<boolean | UrlTree> {
    return firstValueFrom(guard.canActivate(route, state));
  }

  it('allows authenticated users on general routes regardless of selected role', async () => {
    const { authGuard, authService } = createGuard({ authenticated: true, data: { userRole: 'DCM' } });

    expect(await resolveAuthGuard(authGuard)).toBe(true);
    expect(authService.checkSession).toHaveBeenCalledOnce();
  });

  it('allows the selected SR-DCM role to access restricted routes', async () => {
    for (const designation of ['SR-DCM', ' sr-dcm ']) {
      const { roleGuard, authService } = createGuard({
        authenticated: true,
        data: { designation, userRole: 'DCM' }
      });

      expect(await resolveRoleGuard(roleGuard)).toBe(true);
      expect(authService.checkSession).toHaveBeenCalledOnce();
    }
  });

  it('redirects other valid roles to the restricted-access screen', async () => {
    const { roleGuard, router } = createGuard({
      authenticated: true,
      data: { designation: ' DCM ', userRole: 'SR-DCM' }
    });

    expect(await resolveRoleGuard(roleGuard)).toEqual({ route: '/access-denied' });
    expect(router.createUrlTree).toHaveBeenCalledWith(['/access-denied']);
  });

  it('redirects unauthenticated users to login from restricted routes', async () => {
    const { roleGuard, router } = createGuard({ authenticated: false });

    expect(await resolveRoleGuard(roleGuard)).toEqual({ route: '/login' });
    expect(router.createUrlTree).toHaveBeenCalledWith(
      ['/login'],
      { queryParams: { returnUrl: '/registration' } }
    );
  });

  it('does not trust a cached authenticated user when the server session is missing', async () => {
    const { authGuard, router } = createGuard({ authenticated: false }, true);

    expect(await resolveAuthGuard(authGuard)).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'],
      { queryParams: { returnUrl: '/registration' } }
    );
  });
});
