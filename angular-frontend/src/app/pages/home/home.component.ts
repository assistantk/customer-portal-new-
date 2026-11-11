import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService, AuthUserData } from '../../services/auth.service';
import { ZoneDivisionService, ZoneDivisionSelection } from '../../services/zone-division.service';
import { getDivisionFormSelection } from '../../utils/division-codes';

@Component({
  selector: 'app-home',
  standalone: false,
  template: `
    <main class="home-page" aria-label="Home page"></main>
  `,
  styles: [`
    :host {
      display: flex;
      flex: 1;
      flex-direction: column;
    }
    .home-page {
      flex: 1;
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
