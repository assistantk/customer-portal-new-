import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { INDIAN_STATES, divisionsByZone } from '../customer-registration/customer-registration.component';

export interface OwnershipForm {
  // Section 1
  ownershipCode: string;
  ownershipAddress: string;
  panNumber: string;
  address: string;
  city: string;
  pincode: string;
  state: string;
  zone: string;
  operatingDivision: string;
  email: string;
  mobile: string;

  // Section 2: Ownership Details
  ownershipPartyCode: string;
  ownershipPartyAddress: string;
}

const blankForm: OwnershipForm = {
  ownershipCode: '',
  ownershipAddress: '',
  panNumber: '',
  address: '',
  city: '',
  pincode: '',
  state: '',
  zone: '',
  operatingDivision: '',
  email: '',
  mobile: '',
  ownershipPartyCode: '',
  ownershipPartyAddress: ''
};

const panRe = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const mobileRe = /^[6-9][0-9]{9}$/;
const pincodeRe = /^[1-9][0-9]{5}$/;
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-ownership-code',
  standalone: false,
  templateUrl: './ownership-code.component.html',
  styleUrls: ['./ownership-code.component.css']
})
export class OwnershipCodeComponent implements OnInit, OnDestroy {
  form: OwnershipForm = { ...blankForm };
  errors: Record<string, string> = {};
  notice = '';
  loading = false;

  // Ownership Section 1 states (Ownership Code)
  ownSection1Loading = false;
  ownSection1Found: boolean | null = null;
  ownSection1Duplicate = false;
  ownSection1LookupError = '';
  ownSection1Source: 'EXISTING_OWNERSHIP_RECORD' | 'NEW_RECORD_FROM_GLOBAL_CUSTOMER' | 'INVALID_CODE' | 'LOOKUP_ERROR' | null = null;
  private ownSection1Timer: any = null;
  private ownSection1ReqId = 0;

  // Ownership Section 2 states (Ownership Party Code)
  ownSection2Loading = false;
  ownSection2Found: boolean | null = null;
  ownSection2Duplicate = false;
  ownSection2LookupError = '';
  ownSection2Source: 'EXISTING_OWNERSHIP_RECORD' | 'NEW_RECORD_FROM_GLOBAL_CUSTOMER' | 'INVALID_CODE' | 'LOOKUP_ERROR' | null = null;
  private ownSection2Timer: any = null;
  private ownSection2ReqId = 0;

  // Dropdown states
  zoneOpen = false;
  zoneSearchTerm = '';
  divisionOpen = false;

  readonly INDIAN_STATES = INDIAN_STATES;
  readonly divisionsByZone = divisionsByZone;

  constructor(
    private customerService: CustomerService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.ownSection1Timer) clearTimeout(this.ownSection1Timer);
    if (this.ownSection2Timer) clearTimeout(this.ownSection2Timer);
  }

  get zones(): string[] {
    return Object.keys(divisionsByZone);
  }

  get filteredZones(): string[] {
    const term = (this.zoneSearchTerm || '').toLowerCase();
    return this.zones.filter(z => z.toLowerCase().includes(term));
  }

  get divisions(): string[] {
    return this.form.zone ? (divisionsByZone[this.form.zone] || []) : [];
  }

  /* ===== Section 1: Ownership Code Lookup ===== */
  handleOwnershipCodeChange(code: string): void {
    const upperCode = (code || '').toUpperCase();
    this.form.ownershipCode = upperCode;
    delete this.errors['ownershipCode'];
    this.form.ownershipAddress = '';
    this.form.address = '';
    this.form.panNumber = '';
    this.form.city = '';
    this.form.pincode = '';
    this.ownSection1Found = null;
    this.ownSection1Duplicate = false;
    this.ownSection1LookupError = '';
    this.ownSection1Source = null;

    const reqId = ++this.ownSection1ReqId;
    if (this.ownSection1Timer) clearTimeout(this.ownSection1Timer);

    if (upperCode.trim().length === 4) {
      this.ownSection1Loading = true;
      this.ownSection1Timer = setTimeout(() => {
        const trimmed = upperCode.trim();
        this.customerService.lookupOwnershipJDBC(trimmed).pipe(timeout(15000)).subscribe({
          next: (resp) => {
            if (reqId !== this.ownSection1ReqId) return;
            if (resp && resp.found && resp.data) {
              if (resp.data.recordSource === 'EXISTING_OWNERSHIP_RECORD') {
                this.form.ownershipAddress = resp.data.ownershipDesc || '';
                this.ownSection1Found = true;
                this.ownSection1Source = resp.data.recordSource;
              } else if (resp.data.recordSource === 'NEW_RECORD_FROM_GLOBAL_CUSTOMER') {
                this.form.ownershipAddress = resp.data.ownershipDesc || '';
                this.form.address = resp.data.address || '';
                this.form.panNumber = resp.data.panNumber || '';
                this.form.city = resp.data.city || '';
                this.form.pincode = resp.data.pincode || '';
                this.ownSection1Found = true;
                this.ownSection1Source = resp.data.recordSource;
              } else {
                this.ownSection1Found = false;
                this.ownSection1Source = 'LOOKUP_ERROR';
                this.ownSection1LookupError = 'Ownership lookup returned an invalid record source. Please try again.';
              }
            } else {
              this.ownSection1Found = false;
              this.ownSection1Source = 'INVALID_CODE';
              this.ownSection1LookupError = 'This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.';
            }
            this.ownSection1Loading = false;
            this.cdr.markForCheck();
          },
          error: (error) => {
            if (reqId !== this.ownSection1ReqId) return;
            this.ownSection1Source = 'LOOKUP_ERROR';
            this.ownSection1LookupError = error?.error?.message
              || 'Unable to fetch ownership record. Please try again.';
            this.ownSection1Loading = false;
            this.cdr.markForCheck();
          }
        });
      }, 500);
    } else {
      this.ownSection1Loading = false;
    }
  }

  /* ===== Section 2: Ownership Party Code Lookup ===== */
  handleOwnershipPartyCodeChange(code: string): void {
    const upperCode = (code || '').toUpperCase();
    this.form.ownershipPartyCode = upperCode;
    delete this.errors['ownershipPartyCode'];
    this.form.ownershipPartyAddress = '';
    this.ownSection2Found = null;
    this.ownSection2Duplicate = false;
    this.ownSection2LookupError = '';
    this.ownSection2Source = null;

    const reqId = ++this.ownSection2ReqId;
    if (this.ownSection2Timer) clearTimeout(this.ownSection2Timer);

    if (upperCode.trim().length === 4) {
      this.ownSection2Loading = true;
      this.ownSection2Timer = setTimeout(() => {
        const trimmed = upperCode.trim();
        this.customerService.lookupOwnershipPartyJDBC(trimmed).pipe(timeout(15000)).subscribe({
          next: (resp) => {
            if (reqId !== this.ownSection2ReqId) return;
            if (resp && resp.found && resp.data) {
              if (resp.data.recordSource === 'EXISTING_OWNERSHIP_RECORD'
                  || resp.data.recordSource === 'NEW_RECORD_FROM_GLOBAL_CUSTOMER') {
                this.form.ownershipPartyAddress = resp.data.partyDesc || '';
                this.ownSection2Found = true;
                this.ownSection2Source = resp.data.recordSource;
              } else {
                this.ownSection2Found = false;
                this.ownSection2Source = 'LOOKUP_ERROR';
                this.ownSection2LookupError = 'Ownership lookup returned an invalid record source. Please try again.';
              }
            } else {
              this.ownSection2Found = false;
              this.ownSection2Source = 'INVALID_CODE';
              this.ownSection2LookupError = 'This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.';
            }
            this.ownSection2Loading = false;
            this.cdr.markForCheck();
          },
          error: (error) => {
            if (reqId !== this.ownSection2ReqId) return;
            this.ownSection2Source = 'LOOKUP_ERROR';
            this.ownSection2LookupError = error?.error?.message
              || 'Unable to fetch ownership details. Please try again.';
            this.ownSection2Loading = false;
            this.cdr.markForCheck();
          }
        });
      }, 500);
    } else {
      this.ownSection2Loading = false;
    }
  }

  handlePanChange(pan: string): void {
    this.form.panNumber = (pan || '').toUpperCase().trim();
    delete this.errors['panNumber'];
  }

  handleAddressInput(addr: string): void {
    this.form.address = addr;
    delete this.errors['address'];
  }

  /* ===== Zone & Division Selectors ===== */
  toggleZoneMenu(): void {
    this.zoneOpen = !this.zoneOpen;
    if (this.zoneOpen) {
      this.divisionOpen = false;
    }
  }

  chooseZone(zone: string): void {
    this.form.zone = zone;
    this.form.operatingDivision = '';
    this.zoneOpen = false;
    this.zoneSearchTerm = '';
    delete this.errors['zone'];
    delete this.errors['operatingDivision'];
    this.cdr.markForCheck();
  }

  toggleDivisionMenu(): void {
    if (!this.form.zone) return;
    this.divisionOpen = !this.divisionOpen;
    if (this.divisionOpen) {
      this.zoneOpen = false;
    }
  }

  chooseDivision(div: string): void {
    this.form.operatingDivision = div;
    this.divisionOpen = false;
    delete this.errors['operatingDivision'];
    this.cdr.markForCheck();
  }

  /* ===== Navigation ===== */
  navigateToHome(): void {
    this.router.navigate(['/registration']);
  }

  /* ===== Reset Form ===== */
  reset(): void {
    this.form = { ...blankForm };
    this.errors = {};
    this.notice = '';
    this.loading = false;
    this.ownSection1Loading = false;
    this.ownSection1Found = null;
    this.ownSection1Duplicate = false;
    this.ownSection1Source = null;
    this.ownSection1LookupError = '';
    this.ownSection2Loading = false;
    this.ownSection2Found = null;
    this.ownSection2Duplicate = false;
    this.ownSection2Source = null;
    this.ownSection2LookupError = '';
    if (this.ownSection1Timer) clearTimeout(this.ownSection1Timer);
    if (this.ownSection2Timer) clearTimeout(this.ownSection2Timer);
    this.zoneOpen = false;
    this.zoneSearchTerm = '';
    this.divisionOpen = false;
    this.cdr.markForCheck();
  }

  /* ===== Validation ===== */
  validate(): boolean {
    const e: Record<string, string> = {};

    if (!this.form.ownershipCode?.trim()) {
      e['ownershipCode'] = 'Ownership Code is required';
    } else if (!/^[A-Z0-9]{4}$/.test(this.form.ownershipCode.trim())) {
      e['ownershipCode'] = 'Enter a valid four-character Global Customer Code.';
    } else if (this.ownSection1Source === 'INVALID_CODE' || this.ownSection1Source === 'LOOKUP_ERROR') {
      e['ownershipCode'] = this.ownSection1LookupError;
    } else if (this.ownSection1Loading || !this.ownSection1Source) {
      e['ownershipCode'] = 'Wait for ownership code lookup to complete.';
    }

    if (!this.form.ownershipAddress?.trim()) {
      e['ownershipAddress'] = 'Ownership Address is required';
    }

    const pan = (this.form.panNumber || '').trim().toUpperCase();
    if (!pan) {
      e['panNumber'] = 'PAN Number is required';
    } else if (!panRe.test(pan)) {
      e['panNumber'] = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';
    }

    if (!this.form.city?.trim()) {
      e['city'] = 'City is required';
    }

    const pin = (this.form.pincode || '').trim();
    if (!pin) {
      e['pincode'] = 'Pincode is required';
    } else if (!pincodeRe.test(pin)) {
      e['pincode'] = 'Enter a valid 6-digit pincode';
    }

    if (!this.form.state?.trim()) {
      e['state'] = 'State is required';
    }

    if (!this.form.zone?.trim()) {
      e['zone'] = 'Zone is required';
    }

    if (!this.form.operatingDivision?.trim()) {
      e['operatingDivision'] = 'SR.DCM/ is required';
    }

    if (!this.form.ownershipPartyCode?.trim()) {
      e['ownershipPartyCode'] = 'Ownership Code is required';
    } else if (!/^[A-Z0-9]{4}$/.test(this.form.ownershipPartyCode.trim())) {
      e['ownershipPartyCode'] = 'Enter a valid four-character Global Customer Code.';
    } else if (this.ownSection2Source === 'INVALID_CODE' || this.ownSection2Source === 'LOOKUP_ERROR') {
      e['ownershipPartyCode'] = this.ownSection2LookupError;
    } else if (this.ownSection2Loading || !this.ownSection2Source) {
      e['ownershipPartyCode'] = 'Wait for ownership code lookup to complete.';
    }

    if (!this.form.ownershipPartyAddress?.trim()) {
      e['ownershipPartyAddress'] = 'Ownership Address is required';
    }

    if (this.form.address && this.form.address.length > 100) {
      e['address'] = 'Address cannot exceed 100 characters.';
    }

    if (this.form.email?.trim() && !emailRe.test(this.form.email.trim())) {
      e['email'] = 'Enter a valid email address';
    }

    if (this.form.mobile?.trim() && !mobileRe.test(this.form.mobile.trim())) {
      e['mobile'] = 'Enter a valid 10-digit mobile number';
    }

    this.errors = e;
    return Object.keys(e).length === 0;
  }

  /* ===== Submission ===== */
  submit(e?: Event): void {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (this.loading) return;
    this.notice = '';

    if (!this.validate()) {
      const errorKeys = Object.keys(this.errors);
      const firstError = this.errors[errorKeys[0]] || 'Please check required fields.';
      this.notice = `Validation Error: ${firstError}`;
      this.notificationService.error('Validation Error', firstError);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    const ownershipCode = (this.form.ownershipCode || '').trim().toUpperCase();
    const ownershipAddress = (this.form.ownershipAddress || '').trim();
    const ownershipPartyCode = (this.form.ownershipPartyCode || '').trim().toUpperCase();
    const ownershipPartyAddress = (this.form.ownershipPartyAddress || '').trim();

    this.customerService.submitOwnershipJDBC(
      ownershipCode,
      ownershipAddress,
      ownershipPartyCode,
      ownershipPartyAddress
    ).pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (result) => {
        if (result?.success !== false) {
          this.reset();
          this.notice = result?.message || 'Request email sent to DBA. Database changes are pending DBA execution.';
          this.notificationService.success(
            'Request Submitted Successfully',
            'Your Ownership Code request has been submitted successfully and sent to DBA for execution.'
          );
        } else {
          const errorMsg = result?.message || 'The request could not be confirmed as successfully submitted.';
          this.notice = errorMsg;
          this.notificationService.error('Submission Failed', errorMsg);
        }
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Ownership registration error:', err);
        const errorMsg = this.extractErrorMessage(err);
        this.notice = errorMsg;
        this.notificationService.error('Submission Failed', errorMsg);
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        this.cdr.markForCheck();
      }
    });
  }

  private extractErrorMessage(err: any): string {
    if (!err) return 'Your request could not be submitted. Please try again.';
    if (err.status === 0 || (err.message && /network|refused|failed to fetch/i.test(err.message))) {
      return 'Unable to connect to the server. Please check your network connection and try again.';
    }
    if (typeof err.error === 'string') return err.error;
    if (err.error?.message) return err.error.message;
    if (err.message) return err.message;
    return 'Your request could not be submitted. Please try again.';
  }
}
