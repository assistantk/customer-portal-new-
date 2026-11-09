import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ZoneDivisionSelection {
  zone: string;
  division: string;
  manuallyChanged: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ZoneDivisionService {
  private selectionSubject = new BehaviorSubject<ZoneDivisionSelection>({
    zone: '',
    division: '',
    manuallyChanged: false
  });

  readonly selection$: Observable<ZoneDivisionSelection> = this.selectionSubject.asObservable();

  get currentSelection(): ZoneDivisionSelection {
    return this.selectionSubject.value;
  }

  setSelection(zone?: string | null, division?: string | null, manuallyChanged: boolean = true): void {
    this.selectionSubject.next({
      zone: (zone || '').trim(),
      division: (division || '').trim(),
      manuallyChanged
    });
  }

  setLoginDivision(zone?: string | null, division?: string | null): void {
    this.selectionSubject.next({
      zone: (zone || '').trim(),
      division: (division || '').trim(),
      manuallyChanged: false
    });
  }

  setDefaultIfUnset(zone?: string | null, division?: string | null): void {
    const current = this.selectionSubject.value;
    const cleanZone = (zone || '').trim();
    const cleanDiv = (division || '').trim();
    if (!current.manuallyChanged && (!current.zone || !current.division)) {
      this.selectionSubject.next({
        zone: cleanZone || current.zone,
        division: cleanDiv || current.division,
        manuallyChanged: false
      });
    }
  }

  reset(): void {
    this.selectionSubject.next({
      zone: '',
      division: '',
      manuallyChanged: false
    });
  }
}
