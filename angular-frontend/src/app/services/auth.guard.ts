import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map, of } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    if (this.authService.isAuthenticated) {
      return of(true);
    }

    return this.authService.checkSession().pipe(
      map((res) => {
        if (res && res.authenticated) {
          return true;
        }
        this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
      })
    );
  }
}

@Injectable({ providedIn: 'root' })
export class NonAuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): Observable<boolean> {
    if (this.authService.isAuthenticated) {
      this.router.navigate(['/register']);
      return of(false);
    }

    return this.authService.checkSession().pipe(
      map((res) => {
        if (res && res.authenticated) {
          this.router.navigate(['/register']);
          return false;
        }
        return true;
      })
    );
  }
}
