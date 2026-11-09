import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from './auth.service';

const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const SESSION_CHANNEL_NAME = 'customer-portal-session';
const SESSION_STORAGE_EVENT_KEY = 'customer-portal.session-event';

type SessionMessage =
  | { type: 'activity'; timestamp: number }
  | { type: 'logout' };

@Injectable({ providedIn: 'root' })
export class SessionLifecycleService implements OnDestroy {
  private authSubscription?: Subscription;
  private channel?: BroadcastChannel;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private hiddenTimer?: ReturnType<typeof setTimeout>;
  private lastActivity = 0;
  private lastBroadcastActivity = 0;
  private hiddenAt: number | null = null;
  private authenticated = false;
  private logoutStarted = false;
  private started = false;

  private readonly activityListener: EventListener = () => this.recordActivity();
  private readonly visibilityListener: EventListener = () => this.handleVisibilityChange();
  private readonly storageListener = (event: StorageEvent) => this.handleStorageEvent(event);
  private readonly channelListener = (event: MessageEvent<SessionMessage>) => this.handleSessionMessage(event.data);

  constructor(private authService: AuthService, private router: Router) {}

  start(): void {
    if (this.started || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.started = true;
    this.authSubscription = this.authService.currentUser$.subscribe((user) => {
      if (user && !this.authenticated) {
        this.beginSession();
      } else if (!user && this.authenticated) {
        this.authenticated = false;
        this.cleanupSessionTracking();
        if (!this.logoutStarted) {
          this.broadcast({ type: 'logout' });
        }
        this.router.navigate(['/login']);
      }
    });
  }

  ngOnDestroy(): void {
    this.stop();
  }

  stop(): void {
    this.authSubscription?.unsubscribe();
    this.authSubscription = undefined;
    this.authenticated = false;
    this.cleanupSessionTracking();
    this.started = false;
  }

  private beginSession(): void {
    this.authenticated = true;
    this.logoutStarted = false;
    this.lastActivity = Date.now();
    this.hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
    this.openCrossTabChannel();
    this.addSessionListeners();
    this.scheduleIdleLogout();
    if (this.hiddenAt !== null) {
      this.scheduleHiddenLogout();
    }
    this.broadcast({ type: 'activity', timestamp: this.lastActivity });
  }

  private openCrossTabChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
        this.channel.addEventListener('message', this.channelListener);
      } catch (error) {
        console.warn('Unable to open the session BroadcastChannel.', error);
      }
    }
    window.addEventListener('storage', this.storageListener);
  }

  private addSessionListeners(): void {
    document.addEventListener('mousemove', this.activityListener, { passive: true });
    document.addEventListener('click', this.activityListener, { passive: true });
    document.addEventListener('keydown', this.activityListener);
    document.addEventListener('scroll', this.activityListener, { passive: true, capture: true });
    document.addEventListener('touchstart', this.activityListener, { passive: true });
    document.addEventListener('touchmove', this.activityListener, { passive: true });
    document.addEventListener('visibilitychange', this.visibilityListener);
  }

  private removeSessionListeners(): void {
    document.removeEventListener('mousemove', this.activityListener);
    document.removeEventListener('click', this.activityListener);
    document.removeEventListener('keydown', this.activityListener);
    document.removeEventListener('scroll', this.activityListener, true);
    document.removeEventListener('touchstart', this.activityListener);
    document.removeEventListener('touchmove', this.activityListener);
    document.removeEventListener('visibilitychange', this.visibilityListener);
    window.removeEventListener('storage', this.storageListener);
  }

  private cleanupSessionTracking(): void {
    if (this.idleTimer !== undefined) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    if (this.hiddenTimer !== undefined) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = undefined;
    }
    this.removeSessionListeners();
    this.channel?.removeEventListener('message', this.channelListener);
    this.channel?.close();
    this.channel = undefined;
    this.hiddenAt = null;
  }

  private recordActivity(): void {
    if (!this.authenticated || this.logoutStarted || document.visibilityState === 'hidden') {
      return;
    }

    this.lastActivity = Date.now();
    this.scheduleIdleLogout();
    if (this.lastActivity - this.lastBroadcastActivity >= 1000) {
      this.lastBroadcastActivity = this.lastActivity;
      this.broadcast({ type: 'activity', timestamp: this.lastActivity });
    }
  }

  private scheduleIdleLogout(): void {
    if (this.idleTimer !== undefined) {
      clearTimeout(this.idleTimer);
    }
    const remaining = Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - this.lastActivity));
    this.idleTimer = setTimeout(() => {
      if (Date.now() - this.lastActivity >= SESSION_TIMEOUT_MS) {
        this.logout();
      } else {
        this.scheduleIdleLogout();
      }
    }, remaining);
  }

  private handleVisibilityChange(): void {
    if (!this.authenticated || this.logoutStarted) {
      return;
    }

    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = now;
      this.scheduleHiddenLogout();
      return;
    }

    const hiddenDuration = this.hiddenAt === null ? 0 : now - this.hiddenAt;
    this.clearHiddenTimer();
    this.hiddenAt = null;
    if (hiddenDuration >= SESSION_TIMEOUT_MS || now - this.lastActivity >= SESSION_TIMEOUT_MS) {
      this.logout();
      return;
    }
    this.scheduleIdleLogout();
  }

  private scheduleHiddenLogout(): void {
    this.clearHiddenTimer();
    if (this.hiddenAt === null) {
      return;
    }

    const remaining = Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - this.hiddenAt));
    this.hiddenTimer = setTimeout(() => {
      if (this.hiddenAt !== null && Date.now() - this.hiddenAt >= SESSION_TIMEOUT_MS) {
        this.logout();
      } else {
        this.scheduleHiddenLogout();
      }
    }, remaining);
  }

  private clearHiddenTimer(): void {
    if (this.hiddenTimer !== undefined) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = undefined;
    }
  }

  private handleSessionMessage(message: SessionMessage): void {
    if (!this.authenticated || this.logoutStarted || !message) {
      return;
    }

    if (message.type === 'logout') {
      this.logoutStarted = true;
      this.authenticated = false;
      this.cleanupSessionTracking();
      this.authService.handleAuthExpired();
      this.router.navigate(['/login']);
    } else if (message.type === 'activity' && message.timestamp > this.lastActivity) {
      this.lastActivity = message.timestamp;
      this.scheduleIdleLogout();
    }
  }

  private handleStorageEvent(event: StorageEvent): void {
    if (event.key !== SESSION_STORAGE_EVENT_KEY || !event.newValue) {
      return;
    }
    try {
      this.handleSessionMessage(JSON.parse(event.newValue) as SessionMessage);
    } catch (error) {
      console.warn('Unable to read a cross-tab session event.', error);
    }
  }

  private broadcast(message: SessionMessage): void {
    if (this.channel) {
      this.channel.postMessage(message);
      return;
    }

    try {
      localStorage.setItem(SESSION_STORAGE_EVENT_KEY, JSON.stringify({
        ...message,
        nonce: `${Date.now()}-${Math.random()}`
      }));
    } catch (error) {
      console.warn('Unable to broadcast a cross-tab session event.', error);
    }
  }

  private logout(): void {
    if (!this.authenticated || this.logoutStarted) {
      return;
    }

    this.logoutStarted = true;
    this.broadcast({ type: 'logout' });
    this.cleanupSessionTracking();
    this.authService.logout().subscribe({
      next: () => this.finishLogout(),
      error: (error) => {
        console.error('The logout API request failed.', error);
        this.finishLogout();
      }
    });
  }

  private finishLogout(): void {
    this.authService.handleAuthExpired();
    this.authenticated = false;
    this.router.navigate(['/login']);
  }
}
