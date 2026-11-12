import { Component, OnDestroy } from '@angular/core';
import { SessionLifecycleService } from './services/session-lifecycle.service';

@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  title = 'Freight Customer Code';

  constructor(private sessionLifecycle: SessionLifecycleService) {
    this.sessionLifecycle.start();
  }

  ngOnDestroy(): void {
    this.sessionLifecycle.stop();
  }
}