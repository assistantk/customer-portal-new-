import '@angular/compiler';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_ASSETS } from '../config/image-assets';
import { ImagePreloadService } from './image-preload.service';

describe('ImagePreloadService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preloads common and route-specific assets once without blocking navigation', () => {
    const requestedUrls: string[] = [];
    const navigationEvents = new Subject<NavigationEnd>();
    const originalHash = window.location.hash;

    class FakeImage {
      decoding: string | undefined;
      fetchPriority: string | undefined;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(url: string) {
        requestedUrls.push(url);
      }
    }

    window.location.hash = '';
    vi.stubGlobal('Image', FakeImage);

    const router = { events: navigationEvents } as unknown as Router;
    const service = new ImagePreloadService(router);

    try {
      expect(() => service.initialize()).not.toThrow();
      expect(requestedUrls).toEqual([new URL(IMAGE_ASSETS.crisLogo, document.baseURI).href]);

      navigationEvents.next(new NavigationEnd(1, '/login', '/login'));
      navigationEvents.next(new NavigationEnd(2, '/registration/ownership', '/registration/ownership'));
      navigationEvents.next(new NavigationEnd(3, '/registration/ownership', '/registration/ownership'));
      navigationEvents.next(new NavigationEnd(4, '/registration/global-code', '/registration/global-code'));
      navigationEvents.next(new NavigationEnd(5, '/registration/handling-agent', '/registration/handling-agent'));

      expect(requestedUrls).toContain(new URL(IMAGE_ASSETS.railwayBackground, document.baseURI).href);
      expect(requestedUrls).toContain(new URL(IMAGE_ASSETS.indianRailwaysLogo, document.baseURI).href);
      expect(requestedUrls).toContain(new URL(IMAGE_ASSETS.railwayWatermark, document.baseURI).href);
      expect(requestedUrls).toContain(new URL(IMAGE_ASSETS.ownershipCode, document.baseURI).href);
      expect(requestedUrls).toContain(new URL(IMAGE_ASSETS.globalCustomerCode, document.baseURI).href);
      expect(requestedUrls).toContain(new URL(IMAGE_ASSETS.handlingAgentCode, document.baseURI).href);
      expect(new Set(requestedUrls).size).toBe(requestedUrls.length);
    } finally {
      window.location.hash = originalHash;
    }
  });
});
