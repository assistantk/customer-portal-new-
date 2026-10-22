import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface AppNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  public notifications$: Observable<AppNotification[]> = this.notificationsSubject.asObservable();

  show(notification: Omit<AppNotification, 'id'>): string {
    const id = 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const duration = notification.duration ?? 5000;
    const item: AppNotification = { ...notification, id, duration };

    this.notificationsSubject.next([...this.notificationsSubject.value, item]);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  success(title: string, message: string, duration = 5000): string {
    return this.show({ type: 'success', title, message, duration });
  }

  error(title: string, message: string, duration = 5000): string {
    return this.show({ type: 'error', title, message, duration });
  }

  info(title: string, message: string, duration = 5000): string {
    return this.show({ type: 'info', title, message, duration });
  }

  warning(title: string, message: string, duration = 5000): string {
    return this.show({ type: 'warning', title, message, duration });
  }

  dismiss(id: string): void {
    const current = this.notificationsSubject.value;
    this.notificationsSubject.next(current.filter(n => n.id !== id));
  }

  clear(): void {
    this.notificationsSubject.next([]);
  }
}
