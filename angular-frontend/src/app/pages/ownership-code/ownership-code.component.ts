import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { finalize, filter, Subscription, timeout } from 'rxjs';
import { CustomerService } from '../../services/customer.service';
import { NotificationService } from '../../services/notification.service';
import { INDIAN_STATES, divisionsByZone } from '../customer-registration/customer-registration.component';
import { AuthService } from '../../services/auth.service';
import { getDivisionFormSelection } from '../../utils/division-codes';
import { IMAGE_ASSETS } from '../../config/image-assets';
import { ZoneDivisionService } from '../../services/zone-division.service';

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
  readonly imageAssets = IMAGE_ASSETS;
  form: OwnershipForm = { ...blankForm };
  errors: Record<string, string> = {};
  notice = '';
  loading = false;
  touchedFields: Record<string, boolean> = {};

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
  private divisionSelectionManuallyChanged = false;
  private userDivisionSubscription?: Subscription;
  private zoneDivisionSubscription?: Subscription;
  private routerEventsSubscription?: Subscription;

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
    private cdr: ChangeDetectorRef,
    private authService?: AuthService,
    private zoneDivisionService?: ZoneDivisionService
  ) {}

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
    if (this.ownSection1Timer) {
      clearTimeout(this.ownSection1Timer);
      this.ownSection1Timer = null;
    }
    if (this.ownSection2Timer) {
      clearTimeout(this.ownSection2Timer);
      this.ownSection2Timer = null;
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

  /* ===== Section 1: Ownership Code Lookup ===== */
  handleOwnershipCodeChange(code: string): void {
    const upperCode = (code || '').toUpperCase();
    this.form.ownershipCode = upperCode;
    this.handleOwnershipPartyCodeChange(upperCode);
    this.touchedFields['ownershipCode'] = true;
    delete this.errors['ownershipCode'];
    this.form.ownershipAddress = '';
    this.form.ownershipPartyAddress = '';
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

    if (/^[A-Z0-9]+$/.test(upperCode.trim())) {
      this.ownSection1Loading = true;
      this.ownSection1Timer = setTimeout(() => {
        const trimmed = upperCode.trim();
        this.customerService.lookupOwnershipJDBC(trimmed).pipe(timeout(15000)).subscribe({
          next: (resp) => {
            if (reqId !== this.ownSection1ReqId) return;
            if (resp && resp.found && resp.data) {
              this.form.ownershipAddress = resp.data.ownershipDesc || '';
              this.form.ownershipPartyAddress = this.form.ownershipAddress;
              this.form.address = (resp.data.address || '').replace(/,\s+/g, ',').trim();
              this.form.panNumber = resp.data.panNumber || '';
              this.form.city = resp.data.city || '';
              this.form.pincode = resp.data.pincode || '';
              this.ownSection1Found = true;
              this.ownSection1Source = resp.data.recordSource;
            } else {
              this.ownSection1Found = false;
              this.ownSection1Source = 'INVALID_CODE';
              this.ownSection1LookupError = resp?.message
                || 'This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.';
            }
            this.ownSection1Loading = false;
            this.validateField('ownershipCode');
            this.cdr.markForCheck();
          },
          error: (error) => {
            if (reqId !== this.ownSection1ReqId) return;
            this.ownSection1Found = false;
            this.ownSection1Source = 'INVALID_CODE';
            this.ownSection1LookupError = error?.error?.message
              || 'This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.';
            this.ownSection1Loading = false;
            this.validateField('ownershipCode');
            this.cdr.markForCheck();
          }
        });
      }, 500);
    } else {
      this.ownSection1Loading = false;
      this.validateField('ownershipCode');
    }
  }

  /* ===== Section 2: Ownership Party Code Lookup ===== */
  handleOwnershipPartyCodeChange(code: string): void {
    const upperCode = (code || '').toUpperCase();
    this.form.ownershipPartyCode = upperCode;
    this.touchedFields['ownershipPartyCode'] = true;
    delete this.errors['ownershipPartyCode'];
    this.form.ownershipPartyAddress = '';
    this.ownSection2Found = null;
    this.ownSection2Duplicate = false;
    this.ownSection2LookupError = '';
    this.ownSection2Source = null;

    const reqId = ++this.ownSection2ReqId;
    if (this.ownSection2Timer) clearTimeout(this.ownSection2Timer);

    if (/^[A-Z0-9]+$/.test(upperCode.trim())) {
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
            this.validateField('ownershipPartyCode');
            this.cdr.markForCheck();
          },
          error: (error) => {
            if (reqId !== this.ownSection2ReqId) return;
            this.ownSection2Source = 'LOOKUP_ERROR';
            this.ownSection2LookupError = error?.error?.message
              || 'Unable to fetch ownership details. Please try again.';
            this.ownSection2Loading = false;
            this.validateField('ownershipPartyCode');
            this.cdr.markForCheck();
          }
        });
      }, 500);
    } else {
      this.ownSection2Loading = false;
      this.validateField('ownershipPartyCode');
    }
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

    if (field === 'ownershipCode') {
      const code = (this.form.ownershipCode || '').trim();
      if (!code) {
        this.errors['ownershipCode'] = 'Ownership Code is required';
      } else if (!/^[A-Z0-9]+$/.test(code)) {
        this.errors['ownershipCode'] = 'Enter a valid Global Customer Code.';
      } else if (this.ownSection1Source === 'INVALID_CODE' || this.ownSection1Source === 'LOOKUP_ERROR') {
        this.errors['ownershipCode'] = this.ownSection1LookupError;
      } else if (this.ownSection1Loading || !this.ownSection1Source) {
        this.errors['ownershipCode'] = 'Wait for ownership code lookup to complete.';
      } else {
        delete this.errors['ownershipCode'];
      }
    } else if (field === 'ownershipAddress') {
      if (!this.form.ownershipAddress?.trim()) {
        this.errors['ownershipAddress'] = 'Ownership Address is required';
      } else {
        delete this.errors['ownershipAddress'];
      }
    } else if (field === 'ownershipPartyCode') {
      const code = (this.form.ownershipPartyCode || '').trim();
      if (!code) {
        this.errors['ownershipPartyCode'] = 'Ownership Code is required';
      } else if (!/^[A-Z0-9]+$/.test(code)) {
        this.errors['ownershipPartyCode'] = 'Enter a valid Global Customer Code.';
      } else if (this.ownSection2Source === 'INVALID_CODE' || this.ownSection2Source === 'LOOKUP_ERROR') {
        this.errors['ownershipPartyCode'] = this.ownSection2LookupError;
      } else if (this.ownSection2Loading || !this.ownSection2Source) {
        this.errors['ownershipPartyCode'] = 'Wait for ownership code lookup to complete.';
      } else {
        delete this.errors['ownershipPartyCode'];
      }
    } else if (field === 'ownershipPartyAddress') {
      if (!this.form.ownershipPartyAddress?.trim()) {
        this.errors['ownershipPartyAddress'] = 'Ownership Address is required';
      } else {
        delete this.errors['ownershipPartyAddress'];
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
    } else if (field === 'pincode') {
      const pin = (this.form.pincode || '').trim();
      if (!pin) {
        this.errors['pincode'] = 'Pincode is required';
      } else if (!pincodeRe.test(pin)) {
        this.errors['pincode'] = 'Enter a valid 6-digit pincode';
      } else {
        delete this.errors['pincode'];
      }
    } else if (field === 'state') {
      if (!this.form.state?.trim()) {
        this.errors['state'] = 'State is required';
      } else {
        delete this.errors['state'];
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
    } else if (field === 'address') {
      if (this.form.address && this.form.address.length > 100) {
        this.errors['address'] = 'Address cannot exceed 100 characters.';
      } else {
        delete this.errors['address'];
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
    const code1 = (this.form.ownershipCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(code1)) return false;
    if (this.ownSection1Loading || !this.ownSection1Source || this.ownSection1Source === 'INVALID_CODE' || this.ownSection1Source === 'LOOKUP_ERROR') return false;

    const addr1 = (this.form.ownershipAddress || '').trim();
    if (!addr1) return false;

    const pan = (this.form.panNumber || '').trim().toUpperCase();
    if (!pan || !panRe.test(pan)) return false;

    const pin = (this.form.pincode || '').trim();
    if (!pin || !pincodeRe.test(pin)) return false;

    const state = (this.form.state || '').trim();
    if (!state) return false;

    const zone = (this.form.zone || '').trim();
    if (!zone) return false;

    const division = (this.form.operatingDivision || '').trim();
    if (!division) return false;

    const code2 = (this.form.ownershipPartyCode || '').trim().toUpperCase();
    if (code2 !== code1) return false;
    if (this.ownSection2Loading || !this.ownSection2Source || this.ownSection2Source === 'INVALID_CODE' || this.ownSection2Source === 'LOOKUP_ERROR') return false;

    if (this.form.address && this.form.address.length > 100) return false;

    const email = (this.form.email || '').trim();
    if (email && !emailRe.test(email)) return false;

    const mobile = (this.form.mobile || '').trim();
    if (mobile && !mobileRe.test(mobile)) return false;

    return true;
  }

  markAllTouched(): void {
    const fields = [
      'ownershipCode',
      'ownershipAddress',
      'panNumber',
      'pincode',
      'state',
      'zone',
      'operatingDivision',
      'ownershipPartyCode',
      'address',
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
    this.markAllTouched();
    return this.isFormValid && Object.keys(this.errors).length === 0;
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

    const ownershipCode = (this.form.ownershipCode || '').trim().toUpperCase();
    const ownershipAddress = (this.form.ownershipAddress || '').trim();

    this.customerService.submitOwnershipJDBC(
      ownershipCode,
      ownershipAddress,
      ownershipCode,
      ownershipAddress
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
