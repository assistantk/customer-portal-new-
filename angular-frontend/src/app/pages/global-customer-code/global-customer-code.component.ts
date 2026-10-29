import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { CustomerService, CustomerPayload } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { generateCustomerCode } from '../../services/customer-code-generator';
import { INDIAN_STATES, divisionsByZone } from '../customer-registration/customer-registration.component';

export interface GlobalCodeForm {
  customerCode: string;
  companyName: string;
  panNumber: string;
  state: string;
  address: string;
  city: string;
  pincode: string;
  zone: string;
  operatingDivision: string;
  email: string;
  mobile: string;
}

const blankForm: GlobalCodeForm = {
  customerCode: '',
  companyName: '',
  panNumber: '',
  state: '',
  address: '',
  city: '',
  pincode: '',
  zone: '',
  operatingDivision: '',
  email: '',
  mobile: ''
};

const panRe = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const mobileRe = /^[6-9][0-9]{9}$/;
const pincodeRe = /^[1-9][0-9]{5}$/;
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-global-customer-code',
  standalone: false,
  templateUrl: './global-customer-code.component.html',
  styleUrls: ['./global-customer-code.component.css']
})
export class GlobalCustomerCodeComponent implements OnInit, OnDestroy {
  form: GlobalCodeForm = { ...blankForm };
  errors: Record<string, string> = {};
  notice = '';
  loading = false;
  codeConfirmed = false;
  codeChecking = false;

  // Dropdown states
  zoneOpen = false;
  zoneSearchTerm = '';
  divisionOpen = false;

  readonly INDIAN_STATES = INDIAN_STATES;
  readonly divisionsByZone = divisionsByZone;

  private codeTimer: any = null;
  private codeRequestId = 0;

  constructor(
    private customerService: CustomerService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.codeTimer) {
      clearTimeout(this.codeTimer);
    }
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

  /* ===== Auto-generate customer code from Company Name ===== */
  handleCompanyNameChange(name: string): void {
    const requestId = ++this.codeRequestId;
    this.form.companyName = name;
    delete this.errors['companyName'];
    delete this.errors['customerCode'];
    this.notice = '';
    this.codeConfirmed = false;
    if (this.codeTimer) clearTimeout(this.codeTimer);

    if (name.length > 40) {
      this.errors['companyName'] = 'Company name cannot exceed 40 characters.';
      this.form.customerCode = '';
      this.codeChecking = false;
      return;
    }

    const initialCode = generateCustomerCode(name);

    if (initialCode) {
      this.form.customerCode = initialCode;
      this.codeConfirmed = true;
      this.codeChecking = true;

      this.codeTimer = setTimeout(() => {
        this.customerService.generateUniqueCode(name, 'GLOBAL').subscribe({
          next: (uniqueCode) => {
            if (requestId !== this.codeRequestId) return;
            if (/^[A-Z]{4}$/.test(uniqueCode)) {
              this.form.customerCode = uniqueCode;
            }
            this.codeConfirmed = true;
            this.codeChecking = false;
            this.cdr.markForCheck();
          },
          error: (err) => {
            if (requestId !== this.codeRequestId) return;
            console.warn('Backend code verification note:', err);
            this.codeConfirmed = Boolean(this.form.customerCode);
            this.codeChecking = false;
            this.cdr.markForCheck();
          }
        });
      }, 500);
    } else {
      this.form.customerCode = '';
      this.codeConfirmed = false;
      this.codeChecking = false;
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
    this.codeConfirmed = false;
    this.codeChecking = false;
    if (this.codeTimer) clearTimeout(this.codeTimer);
    this.zoneOpen = false;
    this.zoneSearchTerm = '';
    this.divisionOpen = false;
    this.cdr.markForCheck();
  }

  /* ===== Validation ===== */
  validate(): boolean {
    const e: Record<string, string> = {};

    if (!this.form.companyName?.trim()) {
      e['companyName'] = 'Company name is required';
    } else if (this.form.companyName.length > 40) {
      e['companyName'] = 'Company name cannot exceed 40 characters.';
    }

    if (!this.form.customerCode?.trim()) {
      e['customerCode'] = 'Customer code is required';
    } else if (this.codeChecking) {
      e['customerCode'] = 'Please wait - code is being verified';
    }

    const pan = (this.form.panNumber || '').trim().toUpperCase();
    if (!pan) {
      e['panNumber'] = 'PAN Number is required';
    } else if (!panRe.test(pan)) {
      e['panNumber'] = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';
    }

    if (!this.form.state?.trim()) {
      e['state'] = 'State is required';
    }

    if (!this.form.address?.trim()) {
      e['address'] = 'Address is required';
    } else if (this.form.address.length > 100) {
      e['address'] = 'Address cannot exceed 100 characters.';
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

    if (!this.form.zone?.trim()) {
      e['zone'] = 'Zone is required';
    }

    if (!this.form.operatingDivision?.trim()) {
      e['operatingDivision'] = 'SR.DCM/ is required';
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

    const payload: CustomerPayload = {
      customerCode: this.form.customerCode.trim().toUpperCase(),
      companyName: this.form.companyName.trim(),
      panNumber: this.form.panNumber.trim().toUpperCase(),
      address: this.form.address.trim(),
      city: this.form.city.trim(),
      pincode: this.form.pincode.trim(),
      zone: this.form.zone.trim(),
      operatingDivision: this.form.operatingDivision.trim(),
      email: this.form.email.trim(),
      mobile: this.form.mobile.trim(),
      codeType: 'GLOBAL'
    };

    // Submits using existing registerCustomer API
    this.customerService.registerCustomer(payload, []).pipe(
      finalize(() => {
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (result) => {
        if (result?.success !== false) {
          const assignedCode = result?.customerCode || payload.customerCode;
          this.reset();
          this.notice = `Request email sent to DBA. Database changes are pending DBA execution. Customer Code: ${assignedCode}`;
          this.notificationService.success(
            'Request Submitted Successfully',
            'Your Global Customer Code request has been submitted successfully and sent to DBA for execution.'
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
        console.error('Global customer registration error:', err);
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
