import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService, AuthUserData } from '../../services/auth.service';
import { ZoneDivisionService, ZoneDivisionSelection } from '../../services/zone-division.service';
import { getDivisionFormSelection } from '../../utils/division-codes';

@Component({
  selector: 'app-home',
  standalone: false,
  template: `
    <main class="home-page" aria-label="Home page">
      <div class="card home-card">
        <div class="home-header">
          <h2 class="home-title">Welcome to Freight Code Generator</h2>
          <p class="home-subtitle" *ngIf="currentUser">
            Logged in as <strong>{{ currentUser.userName || currentUser.userId }}</strong>
            <span *ngIf="currentUser.designation || currentUser.userRole"> &bull; {{ currentUser.designation || currentUser.userRole }}</span>
          </p>
        </div>

        <div class="home-grid">
          <div class="field-item">
            <label id="home-division-label" for="home-division-field">Division</label>
            <div class="control-wrapper">
              <input
                id="home-division-field"
                type="text"
                class="control home-division-input"
                [value]="divisionDisplay"
                readonly
                aria-labelledby="home-division-label"
                placeholder="No Division Selected"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  `,
  styles: [`
    :host {
      display: flex;
      flex: 1;
      flex-direction: column;
    }
    .home-page {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .home-card {
      position: relative;
      background: #ffffff;
      border: 3px solid #3b82f6;
      border-top: 4px solid #3b82f6;
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 8px 30px -6px rgb(0 0 0 / 0.12), 0 4px 12px -4px rgb(0 0 0 / 0.08);
      margin: auto;
      width: min(92vw, 900px);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .home-header {
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 16px;
    }
    .home-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e3a8a;
      margin: 0 0 8px 0;
    }
    .home-subtitle {
      font-size: 0.95rem;
      color: #64748b;
      margin: 0;
    }
    .home-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }
    .field-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field-item label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #1e293b;
    }
    .control-wrapper {
      position: relative;
    }
    .home-division-input {
      width: 100%;
      height: 42px;
      padding: 8px 12px;
      font-size: 0.95rem;
      font-weight: 500;
      color: #0f172a;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      box-sizing: border-box;
      outline: none;
    }
    .home-division-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
  `]
})
export class HomeComponent implements OnInit, OnDestroy {
  currentUser: AuthUserData | null = null;
  division: string = '';
  divisionCode: string = '';
  zone: string = '';

  private userSub?: Subscription;
  private zoneSub?: Subscription;

  constructor(
    private authService: AuthService,
    private zoneDivisionService: ZoneDivisionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.userSub = this.authService.currentUser$.subscribe((user) => {
      this.currentUser = user;
      if (user && user.divisionCode) {
        this.divisionCode = user.divisionCode;
        const selection = getDivisionFormSelection(user.divisionCode);
        if (selection) {
          this.division = selection.division;
          this.zone = selection.zone;
        } else {
          this.division = user.divisionCode;
        }
      } else if (!user) {
        this.division = '';
        this.divisionCode = '';
        this.zone = '';
      }
      this.cdr.markForCheck();
    });

    this.zoneSub = this.zoneDivisionService.selection$.subscribe((sel: ZoneDivisionSelection) => {
      if (sel) {
        if (sel.division) {
          this.division = sel.division;
        }
        if (sel.zone) {
          this.zone = sel.zone;
        }
        if (!sel.division && !sel.zone && !this.authService.currentUser) {
          this.division = '';
          this.divisionCode = '';
          this.zone = '';
        }
        this.cdr.markForCheck();
      }
    });
  }

  get divisionDisplay(): string {
    return this.division || (this.divisionCode ? this.divisionCode : '');
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.zoneSub?.unsubscribe();
  }
}
