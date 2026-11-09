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
  readonly restrictedAccessMessage =
    'You are not authorized to access this page. This page is available only to users with the SR-DCM role.';
  isDrawerOpen = false;
  currentUser: AuthUserData | null = null;
  isLoggingOut = false;
  private userSub!: Subscription;

  constructor(
    private router: Router,
    private authService: AuthService,
    private notificationService: NotificationService,
    private zoneDivisionService?: ZoneDivisionService
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

  get hasSrDcmAccess(): boolean {
    const selectedRole = this.currentUser?.designation || this.currentUser?.userRole || '';
    return selectedRole.trim().toUpperCase() === 'SR-DCM';
  }

  onRestrictedNavigation(event: MouseEvent): void {
    if (this.hasSrDcmAccess) {
      return;
    }

    event.preventDefault();
    this.notificationService.error('Access Restricted', this.restrictedAccessMessage);
  }

  onLogout(): void {
    if (this.isLoggingOut) {
      return;
    }
    this.isLoggingOut = true;
    this.authService.logout().subscribe({
      next: (res) => {
        this.isLoggingOut = false;
        this.zoneDivisionService?.reset();
        sessionStorage.clear();
        this.router.navigate(['/login'], { replaceUrl: true });
      },
      error: (err) => {
        this.isLoggingOut = false;
        this.zoneDivisionService?.reset();
        sessionStorage.clear();
        this.router.navigate(['/login'], { replaceUrl: true });
      }
    });
  }
}
