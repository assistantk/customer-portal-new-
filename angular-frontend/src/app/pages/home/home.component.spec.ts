// @vitest-environment jsdom
import '@angular/compiler';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HomeComponent } from './home.component';
import { AuthUserData } from '../../services/auth.service';
import { ZoneDivisionService, ZoneDivisionSelection } from '../../services/zone-division.service';

describe('HomeComponent - Division State Lifecycle', () => {
  let component: HomeComponent;
  let currentUserSubject: BehaviorSubject<AuthUserData | null>;
  let authServiceMock: any;
  let zoneDivisionService: ZoneDivisionService;
  let cdrMock: ChangeDetectorRef;

  beforeEach(() => {
    currentUserSubject = new BehaviorSubject<AuthUserData | null>(null);
    authServiceMock = {
      currentUser$: currentUserSubject.asObservable(),
      get currentUser() {
        return currentUserSubject.value;
      }
    };
    zoneDivisionService = new ZoneDivisionService();
    cdrMock = {
      markForCheck: () => {},
      detectChanges: () => {},
      checkNoChanges: () => {},
      detach: () => {},
      reattach: () => {}
    } as ChangeDetectorRef;

    component = new HomeComponent(
      authServiceMock,
      zoneDivisionService,
      cdrMock
    );
  });

  it('initializes with empty division when not logged in', () => {
    component.ngOnInit();
    expect(component.division).toBe('');
    expect(component.divisionCode).toBe('');
    expect(component.divisionDisplay).toBe('');
    component.ngOnDestroy();
  });

  it('displays the selected division on login and reactively updates across logouts and logins without page refresh', () => {
    component.ngOnInit();

    // 1. User logs in with Division TKD
    const userTkd: AuthUserData = {
      userId: 'USER_TKD',
      userName: 'TKD Officer',
      divisionCode: 'TKD',
      designation: 'SR-DCM'
    };
    zoneDivisionService.setLoginDivision('Northern Railway (NR)', 'Tughlakabad / Delhi Area (TKD)');
    currentUserSubject.next(userTkd);

    expect(component.divisionCode).toBe('TKD');
    expect(component.division).toBe('Tughlakabad / Delhi Area (TKD)');
    expect(component.divisionDisplay).toContain('TKD');

    // 2. User logs out
    currentUserSubject.next(null);
    zoneDivisionService.reset();

    expect(component.divisionCode).toBe('');
    expect(component.division).toBe('');
    expect(component.divisionDisplay).toBe('');

    // 3. Next user logs in with Division DLI immediately without page refresh
    const userDli: AuthUserData = {
      userId: 'USER_DLI',
      userName: 'DLI Officer',
      divisionCode: 'DLI',
      designation: 'SR-DCM'
    };
    zoneDivisionService.setLoginDivision('Northern Railway (NR)', 'Delhi (DLI)');
    currentUserSubject.next(userDli);

    expect(component.divisionCode).toBe('DLI');
    expect(component.division).toBe('Delhi (DLI)');
    expect(component.divisionDisplay).toContain('DLI');
    expect(component.divisionDisplay).not.toContain('TKD');

    // 4. User logs out
    currentUserSubject.next(null);
    zoneDivisionService.reset();

    expect(component.divisionCode).toBe('');
    expect(component.division).toBe('');
    expect(component.divisionDisplay).toBe('');

    // 5. Repeat with Division CSTM
    const userCstm: AuthUserData = {
      userId: 'USER_CSTM',
      userName: 'CSTM Officer',
      divisionCode: 'CSTM',
      designation: 'SR-DCM'
    };
    zoneDivisionService.setLoginDivision('Central Railway (CR)', 'Mumbai (CSTM)');
    currentUserSubject.next(userCstm);

    expect(component.divisionCode).toBe('CSTM');
    expect(component.division).toBe('Mumbai (CSTM)');
    expect(component.divisionDisplay).toContain('CSTM');
    expect(component.divisionDisplay).not.toContain('DLI');

    // 6. User logs out
    currentUserSubject.next(null);
    zoneDivisionService.reset();

    // 7. Repeat with Division NGP
    const userNgp: AuthUserData = {
      userId: 'USER_NGP',
      userName: 'NGP Officer',
      divisionCode: 'NGP',
      designation: 'SR-DCM'
    };
    zoneDivisionService.setLoginDivision('Central Railway (CR)', 'Nagpur (NGP)');
    currentUserSubject.next(userNgp);

    expect(component.divisionCode).toBe('NGP');
    expect(component.division).toBe('Nagpur (NGP)');
    expect(component.divisionDisplay).toContain('NGP');
    expect(component.divisionDisplay).not.toContain('CSTM');

    component.ngOnDestroy();
  });
});
