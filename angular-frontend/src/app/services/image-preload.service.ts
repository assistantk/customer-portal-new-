import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { IMAGE_ASSETS } from '../config/image-assets';

@Injectable({ providedIn: 'root' })
export class ImagePreloadService {
  private readonly requestedUrls = new Set<string>();
  private readonly pendingImages = new Map<string, HTMLImageElement>();
  private initialized = false;

  constructor(private readonly router: Router) {}

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.preload([IMAGE_ASSETS.crisLogo]);

    const initialHashRoute = window.location.hash.slice(1).split('?')[0] || '';
    this.preloadForRoute(initialHashRoute);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.preloadForRoute(event.urlAfterRedirects));
  }

  private preloadForRoute(url: string): void {
    const path = url.split('?')[0].replace(/^#/, '');
    if (path === '/login' || path === '/signup') {
      this.preload([IMAGE_ASSETS.railwayBackground, IMAGE_ASSETS.indianRailwaysLogo]);
      return;
    }

    if (path.startsWith('/registration') || path.startsWith('/verify') || path.startsWith('/delete-request')) {
      this.preload([IMAGE_ASSETS.railwayWatermark]);
    }
    if (path.startsWith('/registration/global-code')) {
      this.preload([IMAGE_ASSETS.globalCustomerCode]);
    } else if (path.startsWith('/registration/handling-agent')) {
      this.preload([IMAGE_ASSETS.handlingAgentCode]);
    } else if (path.startsWith('/registration/ownership')) {
      this.preload([IMAGE_ASSETS.ownershipCode]);
    } else if (path === '/registration' || path.startsWith('/delete-request')) {
      this.preload([IMAGE_ASSETS.portalLogo]);
    }
  }

  private preload(paths: string[]): void {
    for (const path of paths) {
      const url = new URL(path, document.baseURI).href;
      if (this.requestedUrls.has(url)) {
        continue;
      }

      this.requestedUrls.add(url);
      const image = new Image();
      image.decoding = 'async';
      image.fetchPriority = path === IMAGE_ASSETS.crisLogo ? 'high' : 'auto';
      image.onload = () => this.pendingImages.delete(url);
      image.onerror = () => {
        this.pendingImages.delete(url);
        console.warn(`Optional image preload failed: ${path}`);
      };
      this.pendingImages.set(url, image);
      image.src = url;
    }
  }
}
