import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService, AuthUserData } from '../services/auth.service';
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
  private userSub!: Subscription;

  constructor(
    private router: Router,
    private authService: AuthService,
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

  onLogout(): void {
    this.zoneDivisionService?.reset();
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }
}