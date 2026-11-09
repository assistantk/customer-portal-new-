import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> | boolean {
    return this.authService.checkSession().pipe(
      map((res) => {
        if (res && res.authenticated) {
          return true;
        }
        this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
      }),
      catchError(() => {
        this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return of(false);
      })
    );
  }
}

@Injectable({ providedIn: 'root' })
export class NonAuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): boolean {
    if (this.authService.isAuthenticated) {
      this.router.navigate(['/home']);
      return false;
    }
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class SrDcmAccessGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
    return this.authService.checkSession().pipe(
      map((response) => {
        if (!response.authenticated || !response.data) {
          return this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
        }

        const selectedRole = response.data.designation || response.data.userRole || '';
        return selectedRole.trim().toUpperCase() === 'SR-DCM'
          ? true
          : this.router.createUrlTree(['/access-denied']);
      }),
      catchError(() => of(this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })))
    );
  }
}
