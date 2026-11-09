import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { finalize, filter, Subscription } from 'rxjs';
import { CustomerService, CustomerPayload } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { generateCustomerCode } from '../../services/customer-code-generator';
import { INDIAN_STATES, divisionsByZone } from '../customer-registration/customer-registration.component';
import { AuthService } from '../../services/auth.service';
import { getDivisionFormSelection } from '../../utils/division-codes';
import { IMAGE_ASSETS } from '../../config/image-assets';
import { ZoneDivisionService } from '../../services/zone-division.service';

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
  readonly imageAssets = IMAGE_ASSETS;
  form: GlobalCodeForm = { ...blankForm };
  errors: Record<string, string> = {};
  notice = '';
  loading = false;
  codeConfirmed = false;
  codeChecking = false;
  touchedFields: Record<string, boolean> = {};

  // Dropdown states
  zoneOpen = false;
  zoneSearchTerm = '';
  divisionOpen = false;

  readonly INDIAN_STATES = INDIAN_STATES;
  readonly divisionsByZone = divisionsByZone;

  private codeTimer: any = null;
  private codeRequestId = 0;
  private divisionSelectionManuallyChanged = false;
  private userDivisionSubscription?: Subscription;
  private zoneDivisionSubscription?: Subscription;
  private routerEventsSubscription?: Subscription;

  constructor(
    private customerService: CustomerService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private authService?: AuthService,
    private zoneDivisionService?: ZoneDivisionService
  ) { }

  ngOnInit(): void {
    this.resetFieldsPreservingZoneDivision();

    this.userDivisionSubscription = this.authService?.currentUser$.subscribe(() => {
      this.applyLoginDivisionDefault();
    });

    this.zoneDivisionSubscription = this.zoneDivisionService?.selection$.subscribe((sel) => {
      if (sel.manuallyChanged || (!this.form.zone && !this.form.operatingDivision)) {
        if (sel.zone) this.form.zone = sel.zone;
        if (sel.division) this.form.operatingDivision = sel.division;
        this.divisionSelectionManuallyChanged = sel.manuallyChanged;
        this.cdr.markForCheck();
      }
    });

    if (this.router?.events) {
      this.routerEventsSubscription = this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => {
          this.resetFieldsPreservingZoneDivision();
        });
    }
  }

  ngOnDestroy(): void {
    if (this.codeTimer) {
      clearTimeout(this.codeTimer);
      this.codeTimer = null;
    }
    this.reset();
    this.userDivisionSubscription?.unsubscribe();
    this.zoneDivisionSubscription?.unsubscribe();
    this.routerEventsSubscription?.unsubscribe();
  }

  get zones(): string[] {
    const zones = Object.keys(divisionsByZone);
    const loginDivision = this.loginDivisionSelection;
    return loginDivision && !zones.includes(loginDivision.zone) ? [...zones, loginDivision.zone] : zones;
  }

  get filteredZones(): string[] {
    const term = (this.zoneSearchTerm || '').toLowerCase();
    return this.zones.filter(z => z.toLowerCase().includes(term));
  }

  get divisions(): string[] {
    if (!this.form.zone) return [];
    const divisions = divisionsByZone[this.form.zone] || [];
    const loginDivision = this.loginDivisionSelection;
    return loginDivision?.zone === this.form.zone && !divisions.includes(loginDivision.division)
      ? [...divisions, loginDivision.division]
      : divisions;
  }

  private get loginDivisionSelection(): { zone: string; division: string } | undefined {
    return getDivisionFormSelection(this.authService?.currentUser?.divisionCode, divisionsByZone);
  }

  private applyLoginDivisionDefault(): void {
    const shared = this.zoneDivisionService?.currentSelection;
    if (shared && shared.manuallyChanged) {
      this.form.zone = shared.zone;
      this.form.operatingDivision = shared.division;
      this.divisionSelectionManuallyChanged = true;
      this.cdr.markForCheck();
      return;
    }
    const selection = this.loginDivisionSelection;
    if (!this.divisionSelectionManuallyChanged && !this.form.operatingDivision && selection) {
      this.form.zone = selection.zone;
      this.form.operatingDivision = selection.division;
      this.zoneDivisionService?.setDefaultIfUnset(selection.zone, selection.division);
      this.cdr.markForCheck();
    }
  }

  /* ===== Auto-generate customer code from Company Name ===== */
  handleCompanyNameChange(name: string): void {
    const requestId = ++this.codeRequestId;
    this.form.companyName = name;
    this.touchedFields['companyName'] = true;
    this.notice = '';
    this.codeConfirmed = false;
    if (this.codeTimer) clearTimeout(this.codeTimer);

    if (!name.trim()) {
      this.errors['companyName'] = 'Company name is required';
      this.form.customerCode = '';
      this.codeChecking = false;
      this.cdr.markForCheck();
      return;
    }

    if (name.length > 40) {
      this.errors['companyName'] = 'Company name cannot exceed 40 characters.';
      this.form.customerCode = '';
      this.codeChecking = false;
      this.cdr.markForCheck();
      return;
    }

    delete this.errors['companyName'];
    delete this.errors['customerCode'];

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
    this.cdr.markForCheck();
  }

  handlePanChange(pan: string): void {
    this.form.panNumber = (pan || '').toUpperCase().trim();
    this.touchedFields['panNumber'] = true;
    this.validateField('panNumber');
    this.cdr.markForCheck();
  }

  handleAddressInput(addr: string): void {
    this.form.address = addr;
    this.touchedFields['address'] = true;
    this.validateField('address');
    this.cdr.markForCheck();
  }

  handleStateChange(state: string): void {
    this.form.state = state;
    this.touchedFields['state'] = true;
    this.validateField('state');
    this.cdr.markForCheck();
  }

  handlePincodeChange(pin: string): void {
    this.form.pincode = (pin || '').trim();
    this.touchedFields['pincode'] = true;
    this.validateField('pincode');
    this.cdr.markForCheck();
  }

  handleEmailChange(email: string): void {
    this.form.email = email;
    this.touchedFields['email'] = true;
    this.validateField('email');
    this.cdr.markForCheck();
  }

  handleMobileChange(mobile: string): void {
    this.form.mobile = (mobile || '').trim();
    this.touchedFields['mobile'] = true;
    this.validateField('mobile');
    this.cdr.markForCheck();
  }

  onFieldBlur(field: string): void {
    this.touchedFields[field] = true;
    this.validateField(field);
    this.cdr.markForCheck();
  }

  validateField(field: string): void {
    if (!this.touchedFields[field]) return;

    if (field === 'companyName') {
      const val = (this.form.companyName || '').trim();
      if (!val) {
        this.errors['companyName'] = 'Company name is required';
      } else if (this.form.companyName.length > 40) {
        this.errors['companyName'] = 'Company name cannot exceed 40 characters.';
      } else {
        delete this.errors['companyName'];
      }
    } else if (field === 'customerCode') {
      const code = (this.form.customerCode || '').trim();
      if (!code) {
        this.errors['customerCode'] = 'Customer code is required';
      } else if (this.codeChecking) {
        this.errors['customerCode'] = 'Please wait - code is being verified';
      } else {
        delete this.errors['customerCode'];
      }
    } else if (field === 'panNumber') {
      const pan = (this.form.panNumber || '').trim().toUpperCase();
      if (!pan) {
        this.errors['panNumber'] = 'PAN Number is required';
      } else if (!panRe.test(pan)) {
        this.errors['panNumber'] = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';
      } else {
        delete this.errors['panNumber'];
      }
    } else if (field === 'state') {
      if (!this.form.state?.trim()) {
        this.errors['state'] = 'State is required';
      } else {
        delete this.errors['state'];
      }
    } else if (field === 'address') {
      const addr = (this.form.address || '').trim();
      if (!addr) {
        this.errors['address'] = 'Address is required';
      } else if (this.form.address.length > 100) {
        this.errors['address'] = 'Address cannot exceed 100 characters.';
      } else {
        delete this.errors['address'];
      }
    } else if (field === 'pincode') {
      const pin = (this.form.pincode || '').trim();
      if (!pin) {
        this.errors['pincode'] = 'Pincode is required';
      } else if (!pincodeRe.test(pin)) {
        this.errors['pincode'] = 'Enter a valid 6-digit pincode';
      } else {
        delete this.errors['pincode'];
      }
    } else if (field === 'zone') {
      if (!this.form.zone?.trim()) {
        this.errors['zone'] = 'Zone is required';
      } else {
        delete this.errors['zone'];
      }
    } else if (field === 'operatingDivision') {
      if (!this.form.operatingDivision?.trim()) {
        this.errors['operatingDivision'] = 'SR.DCM/ is required';
      } else {
        delete this.errors['operatingDivision'];
      }
    } else if (field === 'email') {
      const email = (this.form.email || '').trim();
      if (email && !emailRe.test(email)) {
        this.errors['email'] = 'Enter a valid email address';
      } else {
        delete this.errors['email'];
      }
    } else if (field === 'mobile') {
      const mobile = (this.form.mobile || '').trim();
      if (mobile && !mobileRe.test(mobile)) {
        this.errors['mobile'] = 'Enter a valid 10-digit mobile number';
      } else {
        delete this.errors['mobile'];
      }
    }
  }

  get isFormValid(): boolean {
    const company = (this.form.companyName || '').trim();
    if (!company || this.form.companyName.length > 40) return false;

    const code = (this.form.customerCode || '').trim();
    if (!code || this.codeChecking) return false;

    const pan = (this.form.panNumber || '').trim().toUpperCase();
    if (!pan || !panRe.test(pan)) return false;

    const state = (this.form.state || '').trim();
    if (!state) return false;

    const address = (this.form.address || '').trim();
    if (!address || this.form.address.length > 100) return false;

    const pin = (this.form.pincode || '').trim();
    if (!pin || !pincodeRe.test(pin)) return false;

    const zone = (this.form.zone || '').trim();
    if (!zone) return false;

    const division = (this.form.operatingDivision || '').trim();
    if (!division) return false;

    const email = (this.form.email || '').trim();
    if (email && !emailRe.test(email)) return false;

    const mobile = (this.form.mobile || '').trim();
    if (mobile && !mobileRe.test(mobile)) return false;

    return true;
  }

  markAllTouched(): void {
    const fields = [
      'companyName',
      'customerCode',
      'panNumber',
      'state',
      'address',
      'pincode',
      'zone',
      'operatingDivision',
      'email',
      'mobile'
    ];
    fields.forEach(f => {
      this.touchedFields[f] = true;
      this.validateField(f);
    });
  }

  /* ===== Zone & Division Selectors ===== */
  toggleZoneMenu(): void {
    this.zoneOpen = !this.zoneOpen;
    if (this.zoneOpen) {
      this.divisionOpen = false;
    }
  }

  chooseZone(zone: string): void {
    this.divisionSelectionManuallyChanged = true;
    this.form.zone = zone;
    this.form.operatingDivision = '';
    this.zoneDivisionService?.setSelection(zone, '', true);
    this.zoneOpen = false;
    this.zoneSearchTerm = '';
    this.touchedFields['zone'] = true;
    this.validateField('zone');
    this.touchedFields['operatingDivision'] = true;
    this.validateField('operatingDivision');
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
    this.divisionSelectionManuallyChanged = true;
    this.form.operatingDivision = div;
    this.zoneDivisionService?.setSelection(this.form.zone, div, true);
    this.divisionOpen = false;
    this.touchedFields['operatingDivision'] = true;
    this.validateField('operatingDivision');
    this.cdr.markForCheck();
  }

  /* ===== Navigation ===== */
  navigateToHome(): void {
    this.router.navigate(['/registration']);
  }

  /* ===== Reset Form ===== */
  reset(): void {
    this.resetFieldsPreservingZoneDivision();
  }

  private resetFieldsPreservingZoneDivision(): void {
    const shared = this.zoneDivisionService?.currentSelection;
    const currentZone = shared?.zone || this.form.zone || '';
    const currentDivision = shared?.division || this.form.operatingDivision || '';
    const manuallyChanged = shared?.manuallyChanged ?? this.divisionSelectionManuallyChanged;

    this.form = {
      ...blankForm,
      zone: currentZone,
      operatingDivision: currentDivision
    };
    this.divisionSelectionManuallyChanged = manuallyChanged;

    if (!currentZone && !currentDivision) {
      this.applyLoginDivisionDefault();
    }

    this.errors = {};
    this.touchedFields = {};
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
    this.markAllTouched();
    return this.isFormValid && Object.keys(this.errors).length === 0;
  }

  isFormValid(): boolean {
    const company = (this.form.companyName || '').trim();
    if (!company || company.length > 40) return false;

    const code = (this.form.customerCode || '').trim();
    if (!code || code.length !== 4 || this.codeChecking) return false;

    const pan = (this.form.panNumber || '').trim().toUpperCase();
    if (!pan || pan.length !== 10 || !panRe.test(pan)) return false;

    if (!this.form.state?.trim()) return false;

    const addr = (this.form.address || '').trim();
    if (!addr || addr.length > 100) return false;

    const pin = (this.form.pincode || '').trim();
    if (!pin || !pincodeRe.test(pin)) return false;

    if (!this.form.zone?.trim()) return false;
    if (!this.form.operatingDivision?.trim()) return false;

    if (this.form.email?.trim() && !emailRe.test(this.form.email.trim())) return false;
    if (this.form.mobile?.trim() && !mobileRe.test(this.form.mobile.trim())) return false;

    for (const key of Object.keys(this.errors)) {
      if (this.errors[key]) return false;
    }

    return true;
  }

  /* ===== Submission ===== */
  submit(e?: Event): void {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (this.loading) return;
    this.notice = '';

    if (!this.isFormValid || !this.validate()) {
      this.markAllTouched();
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
