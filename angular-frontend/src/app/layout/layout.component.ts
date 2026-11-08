import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService, AuthUserData } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { IMAGE_ASSETS } from '../config/image-assets';
import { ZoneDivisionService } from '../services/zone-division.service';

@Component({
  selector: 'app-layout',
  standalone: false,
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css']
})
export class LayoutComponent implements OnInit, OnDestroy {
  readonly imageAssets = IMAGE_ASSETS;
  isDrawerOpen = false;
  currentUser: AuthUserData | null = null;
  isLoggingOut = false;
  private userSub!: Subscription;

  constructor(
    private router: Router,
    private authService: AuthService,
    private zoneDivisionService?: ZoneDivisionService
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.userSub = this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
    });
    this.authService.checkSession().subscribe();
  }

  ngOnDestroy(): void {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
  }

  toggleDrawer(): void {
    this.isDrawerOpen = !this.isDrawerOpen;
  }

  get isGlobalCodePage(): boolean {
    return this.router.url.includes('/global-code') ||
           this.router.url.includes('/handling-agent') ||
           this.router.url.includes('/ownership');
  }

  onLogout(): void {
    if (this.isLoggingOut) {
      return;
    }
    this.isLoggingOut = true;
    this.authService.logout().subscribe({
      next: (res) => {
        this.isLoggingOut = false;
        if (res && res.success) {
          sessionStorage.clear();
          this.router.navigate(['/login'], { replaceUrl: true });
        } else {
          const msg = res?.message || 'Failed to terminate backend session. Please try again.';
          this.notificationService.error('Logout Failed', msg);
        }
      },
      error: (err) => {
        this.isLoggingOut = false;
        const msg = err?.error?.message || err?.message || 'Failed to terminate backend session. Please try again.';
        this.notificationService.error('Logout Failed', msg);
      }
    });
  }
}
