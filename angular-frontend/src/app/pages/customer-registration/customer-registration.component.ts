import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, Subscription, timeout } from 'rxjs';
import { CustomerService, GstinEntry, CustomerPayload, DeleteRequestCodeType, GstVerificationUiState } from '../../services/customer.service';
import { PanOcrService, ExtractedGstinDetails, cleanAndShortenAddress, getStateNameFromGstinCode } from '../../services/pan-ocr.service';
import { GstVerificationService, GstVerificationResponse, GstCrossCheckResult } from '../../services/gst-verification.service';
import { generateCustomerCode } from '../../services/customer-code-generator';
import { NotificationService } from '../../services/notification.service';
import { PdfGeneratorService } from '../../services/pdf-generator.service';
import { AuthService } from '../../services/auth.service';
import { getDivisionFormSelection } from '../../utils/division-codes';
import { IMAGE_ASSETS } from '../../config/image-assets';

const blank: CustomerPayload = {
  companyName: '',
  customerCode: '',
  address: '',
  city: '',
  pincode: '',
  panNumber: '',
  operatingDivision: '',
  zone: '',
  email: '',
  mobile: '',
  codeType: 'GLOBAL',
  ownershipCode: '',
  ownershipAddress: '',
  ownershipPartyCode: '',
  ownershipPartyAddress: ''
};

const blankGstin: GstinEntry = {
  gstinId: null,
  state: '',
  stateCode: '',
  gstin: '',
  file: null,
  existingFileName: '',
  scanning: false,
  scanStatus: 'idle',
  scanError: '',
  verificationState: 'idle',
  verificationData: null,
  crossCheckResult: null
};

export const INDIAN_STATES: string[] = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
  'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry'
];

export const divisionsByZone: Record<string, string[]> = {
  'Central Railway (CR)': ['Mumbai (CSTM)', 'Bhusawal (BSL)', 'Nagpur (NGP)', 'Pune (PUNE)', 'Solapur (SUR)'],
  'Eastern Railway (ER)': ['Howrah (HWH)', 'Sealdah (SDAH)', 'Asansol (ASN)', 'Malda (MLDT)'],
  'East Central Railway (ECR)': ['Danapur (DNR)', 'Dhanbad (DHN)', 'Pt. Deen Dayal Upadhyaya (DDU)', 'Samastipur (SPJ)', 'Sonpur (SEE)'],
  'East Coast Railway (ECOR)': ['Khurda Road (KUR)', 'Sambalpur (SBP)', 'Rayagada (RGDA)'],
  'Northern Railway (NR)': ['Delhi (DLI)', 'Ambala (UMB)', 'Firozpur (FZR)', 'Lucknow (LKO)', 'Moradabad (MB)'],
  'North Central Railway (NCR)': ['Prayagraj (PRYJ)', 'Agra (AGC)', 'Jhansi (JHS)'],
  'North Eastern Railway (NER)': ['Izzatnagar (IZN)', 'Lucknow (LJN)', 'Varanasi (BSB)'],
  'Northeast Frontier Railway (NFR)': ['Alipurduar (APDJ)', 'Katihar (KIR)', 'Lumding (LMG)', 'Rangiya (RNY)', 'Tinsukia (TSK)'],
  'North Western Railway (NWR)': ['Jaipur (JP)', 'Ajmer (AII)', 'Bikaner (BKN)', 'Jodhpur (JU)'],
  'Southern Railway (SR)': ['Chennai (MAS)', 'Madurai (MDU)', 'Palakkad (PGT)', 'Salem (SA)', 'Tiruchchirapalli (TPJ)', 'Thiruvananthapuram (TVC)'],
  'South Central Railway (SCR)': ['Secunderabad (SC)', 'Hyderabad (HYB)', 'Guntakal (GTL)', 'Guntur (GNT)', 'Vijayawada (BZA)', 'Nanded (NED)'],
  'South Coast Railway (SCoR)': ['Visakhapatnam (VSKP)'],
  'South Eastern Railway (SER)': ['Adra (ADRA)', 'Chakradharpur (CKP)', 'Kharagpur (KGP)', 'Ranchi (RNC)'],
  'South East Central Railway (SECR)': ['Bilaspur (BSP)', 'Nagpur (NAG)', 'Raipur (R)'],
  'South Western Railway (SWR)': ['Hubballi (UBL)', 'Bengaluru (SBC)', 'Mysuru (MYS)'],
  'Western Railway (WR)': ['Mumbai Central (BCT)', 'Vadodara (BRC)', 'Ahmedabad (ADI)', 'Rajkot (RJT)', 'Bhavnagar (BVP)', 'Ratlam (RTM)'],
  'West Central Railway (WCR)': ['Jabalpur (JBP)', 'Bhopal (BPL)', 'Kota (KOTA)'],
  'Metro Railway Kolkata (MRK)': ['Kolkata Metro (KMR)']
};

const gstinRe = /^[A-Z0-9]{15}$/;
const panRe = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const mobileRe = /^[6-9][0-9]{9}$/;

const normalizeDocumentNumber = (value: any) => String(value || '').replace(/\s+/g, '').toUpperCase();

const normalizeAddress = (value: string) => value.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const addressesMatch = (left: string, right: string) => {
  const a = normalizeAddress(left || '');
  const b = normalizeAddress(right || '');
  if (!a || !b) return false;
  const pinPattern = /\b[1-9][0-9]{5}\b/g;
  const leftPin = a.match(pinPattern)?.[0];
  const rightPin = b.match(pinPattern)?.[0];
  if (leftPin && rightPin && leftPin !== rightPin) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(' ').filter(token => token.length > 2));
  const bTokens = new Set(b.split(' ').filter(token => token.length > 2));
  const overlap = [...aTokens].filter(token => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size) >= 0.5;
};

@Component({
  selector: 'app-customer-registration',
  standalone: false,
  templateUrl: './customer-registration.component.html',
  styleUrls: ['./customer-registration.component.css']
})
export class CustomerRegistrationComponent implements OnInit, OnDestroy {
  readonly imageAssets = IMAGE_ASSETS;
  mode: 'ownership' | 'old' | 'new' | 'delete' = 'old';
  oldCodeType: 'GLOBAL' | 'HANDLING_AGENT' = 'GLOBAL';
  newCodeType: 'GLOBAL' | 'HANDLING_AGENT' = 'GLOBAL';

  get codeType(): 'GLOBAL' | 'HANDLING_AGENT' {
    return this.mode === 'old' ? this.oldCodeType : this.newCodeType;
  }
  set codeType(val: 'GLOBAL' | 'HANDLING_AGENT') {
    if (this.mode === 'old') {
      this.oldCodeType = val;
    } else {
      this.newCodeType = val;
    }
  }

  private populateOwnershipGstins(gstinNumbers: string): void {
    const gstins = (gstinNumbers || '').replace(/[\[\]"\s]/g, '').split(',').filter(Boolean);
    this.gstins = gstins.length
      ? gstins.map((gstin, index) => ({
        ...blankGstin,
        gstinId: `ownership-global-${index}`,
        gstin,
        state: getStateNameFromGstinCode(gstin.slice(0, 2)) || ''
      }))
      : [{ ...blankGstin }];
  }

  get currentLogo(): string | null {
    if (this.mode === 'delete') {
      if (this.deleteCodeType === 'GLOBAL_CUSTOMER') {
        return this.imageAssets.globalCustomerCode;
      }
      if (this.deleteCodeType === 'HANDLING_AGENT') {
        return this.imageAssets.handlingAgentCode;
      }
      return this.imageAssets.portalLogo;
    }

    if ((this.mode === 'old' || this.mode === 'new')
      && this.codeType === 'HANDLING_AGENT') {
      return this.imageAssets.handlingAgentCode;
    }
    return this.mode === 'new'
      ? this.imageAssets.globalCustomerCode
      : this.imageAssets.portalLogo;
  }

  get currentLogoAlt(): string {
    if (this.mode === 'delete') {
      if (this.deleteCodeType === 'GLOBAL_CUSTOMER') {
        return 'Global Customer Code Logo';
      }
      if (this.deleteCodeType === 'HANDLING_AGENT') {
        return 'Handling Agent Code Logo';
      }
      return 'Freight Code Generator';
    }

    if ((this.mode === 'old' || this.mode === 'new')
      && this.codeType === 'HANDLING_AGENT') {
      return 'Handling Agent Code Logo';
    }
    return this.mode === 'new'
      ? 'Global Customer Code Logo'
      : 'Freight Code Generator';
  }
  form: CustomerPayload = { ...blank };
  gstins: GstinEntry[] = [{ ...blankGstin }];
  errors: Record<string, string> = {};
  notice = '';
  loading = false;
  lookupLoading = false;
  lookupDone = false;
  lookupError = '';
  lastLookupRecord: any = null;
  verifiedCustomerCode: string | null = null;
  codeConfirmed = false;
  codeChecking = false;
  addressStatus = '';
  addressManuallyEdited = false;
  ocrAutoFillApplied = false;
  removedGstinIds: any[] = [];
  gstinCollapsed = false;
  ownershipLogoMissing = false;
  deleteCodeType: DeleteRequestCodeType | '' = '';
  deleteLogoMissing = false;
  deleteCode = '';
  deleteCompanyName = '';
  verifiedDeleteRecord: { codeType: DeleteRequestCodeType; code: string; companyName: string } | null = null;
  deleteVerificationMessage = '';
  deleteErrorMessage = '';
  deleteSuccessMessage = '';
  deleteVerifying = false;
  deleteSubmitting = false;
  private codeTimer: any = null;
  private codeRequestId = 0;
  private ocrRequestId = 0;

  // Dropdown states
  zoneOpen = false;
  zoneSearchTerm = '';
  divisionOpen = false;

  // Ownership Section 1 states
  ownSection1Loading = false;
  ownSection1Found: boolean | null = null;
  ownSection1Duplicate = false;
  ownSection1LookupError = '';
  ownSection1Source: 'EXISTING_OWNERSHIP_RECORD' | 'NEW_RECORD_FROM_GLOBAL_CUSTOMER' | 'INVALID_CODE' | 'LOOKUP_ERROR' | null = null;
  private ownSection1Timer: any = null;
  private ownSection1ReqId = 0;

  // Ownership Section 2 states
  ownSection2Loading = false;
  ownSection2Found: boolean | null = null;
  ownSection2Duplicate = false;
  ownSection2LookupError = '';
  ownSection2Source: 'EXISTING_OWNERSHIP_RECORD' | 'NEW_RECORD_FROM_GLOBAL_CUSTOMER' | 'INVALID_CODE' | 'LOOKUP_ERROR' | null = null;
  private ownSection2Timer: any = null;
  private ownSection2ReqId = 0;

  // Timers
  private lookupTimer: any = null;
  private lookupRequestId = 0;
  private divisionSelectionManuallyChanged = false;
  private userDivisionSubscription?: Subscription;
  private activeRequestsSub = new Subscription();

  // GSTIN verification & cross-check state
  ocrDataMap = new Map<number, Partial<ExtractedGstinDetails>>();
  activeCrossCheckIndex: number | null = null;
  activeCrossCheck: GstCrossCheckResult | null = null;
  companyNameManuallyEdited = false;
  panManuallyEdited = false;

  // Moveable & Expandable GSTIN card state
  gstinCardPos = { x: 0, y: 0 };
  isDraggingGstinCard = false;
  gstinCardExpanded = false;
  private dragStartPointer = { x: 0, y: 0 };
  private dragCardInitialPos = { x: 0, y: 0 };

  readonly INDIAN_STATES = INDIAN_STATES;
  readonly divisionsByZone = divisionsByZone;

  constructor(
    private customerService: CustomerService,
    private panOcrService: PanOcrService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef,
    private router?: Router,
    private pdfGeneratorService?: PdfGeneratorService,
    private authService?: AuthService,
    private gstVerificationService?: GstVerificationService
  ) { }

  openGlobalCodeForm(): void {
    if (this.router) {
      this.router.navigate(['/registration/global-code']);
    }
  }

  openHandlingAgentCodeForm(): void {
    if (this.router) {
      this.router.navigate(['/registration/handling-agent']);
    }
  }

  openOwnershipCodeForm(): void {
    if (this.router) {
      this.router.navigate(['/registration/ownership']);
    }
  }

  ngOnInit(): void {
    if (this.router?.url.split('?')[0].endsWith('/delete-request')) {
      this.mode = 'delete';
    }
    this.userDivisionSubscription = this.authService?.currentUser$.subscribe(() => {
      this.applyLoginDivisionDefault();
    });
  }

  // Moveable GSTIN Card handlers
  onGstinDragStart(event: MouseEvent | TouchEvent): void {
    const target = event.target as HTMLElement;
    // Don't drag if user clicked interactive buttons or inputs inside the header
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
      return;
    }
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    this.isDraggingGstinCard = true;
    this.dragStartPointer = { x: clientX, y: clientY };
    this.dragCardInitialPos = { ...this.gstinCardPos };
  }

  @HostListener('window:mousemove', ['$event'])
  @HostListener('window:touchmove', ['$event'])
  onGstinDragMove(event: MouseEvent | TouchEvent): void {
    if (!this.isDraggingGstinCard) return;

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    const deltaX = clientX - this.dragStartPointer.x;
    const deltaY = clientY - this.dragStartPointer.y;

    this.gstinCardPos = {
      x: this.dragCardInitialPos.x + deltaX,
      y: this.dragCardInitialPos.y + deltaY
    };
    this.cdr.markForCheck();
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onGstinDragEnd(): void {
    if (this.isDraggingGstinCard) {
      this.isDraggingGstinCard = false;
      this.cdr.markForCheck();
    }
  }

  resetGstinCardPosition(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.gstinCardPos = { x: 0, y: 0 };
    this.cdr.markForCheck();
  }

  toggleGstinCollapse(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.gstinCollapsed = !this.gstinCollapsed;
    this.cdr.markForCheck();
  }

  toggleGstinExpand(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.gstinCardExpanded = !this.gstinCardExpanded;
    if (this.gstinCardExpanded && this.gstinCollapsed) {
      this.gstinCollapsed = false;
    }
    this.cdr.markForCheck();
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

  applyLoginDivisionDefault(): void {
    const selection = this.loginDivisionSelection;
    if (
      this.mode !== 'ownership'
      && this.mode !== 'delete'
      && !this.divisionSelectionManuallyChanged
      && !this.form.operatingDivision
      && selection
    ) {
      this.form.zone = selection.zone;
      this.form.operatingDivision = selection.division;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.cancelPendingAsyncOperations();
    this.resetFormState();
    this.userDivisionSubscription?.unsubscribe();
  }

  getGstinPanStatus(gstin: string, pan?: string): string | null {
    const normalizedGstin = normalizeDocumentNumber(gstin);
    const normalizedPan = normalizeDocumentNumber(pan || this.form.panNumber);
    if (!normalizedGstin) return null;
    if (!gstinRe.test(normalizedGstin)) return 'Enter a valid 15-character GSTIN.';
    if (normalizedPan.length !== 10 || !panRe.test(normalizedPan)) return null;
    return normalizedGstin.slice(2, 12) === normalizedPan ? 'GSTIN matches PAN' : 'GSTIN does not match the PAN number.';
  }

  cancelPendingAsyncOperations(): void {
    this.ocrRequestId++;
    this.lookupRequestId++;
    this.codeRequestId++;
    this.ownSection1ReqId++;
    this.ownSection2ReqId++;

    if (this.ownSection1Timer) {
      clearTimeout(this.ownSection1Timer);
      this.ownSection1Timer = null;
    }
    if (this.ownSection2Timer) {
      clearTimeout(this.ownSection2Timer);
      this.ownSection2Timer = null;
    }
    if (this.lookupTimer) {
      clearTimeout(this.lookupTimer);
      this.lookupTimer = null;
    }
    if (this.codeTimer) {
      clearTimeout(this.codeTimer);
      this.codeTimer = null;
    }

    if (this.activeRequestsSub) {
      this.activeRequestsSub.unsubscribe();
      this.activeRequestsSub = new Subscription();
    }
  }

  resetFormState(): void {
    this.form = { ...blank };
    this.verifiedCustomerCode = null;
    this.divisionSelectionManuallyChanged = false;
    this.gstins = [{ ...blankGstin }];
    this.errors = {};
    this.notice = '';
    this.loading = false;
    this.lookupDone = false;
    this.lookupError = '';
    this.lookupLoading = false;
    this.lastLookupRecord = null;
    this.codeConfirmed = false;
    this.codeChecking = false;
    this.addressStatus = '';
    this.addressManuallyEdited = false;
    this.companyNameManuallyEdited = false;
    this.panManuallyEdited = false;
    this.ocrAutoFillApplied = false;
    this.removedGstinIds = [];
    this.zoneOpen = false;
    this.zoneSearchTerm = '';
    this.divisionOpen = false;
    this.ocrDataMap.clear();
    this.activeCrossCheckIndex = null;
    this.activeCrossCheck = null;
    this.ownSection1Loading = false;
    this.ownSection1Found = null;
    this.ownSection1Duplicate = false;
    this.ownSection1LookupError = '';
    this.ownSection1Source = null;
    this.ownSection2Loading = false;
    this.ownSection2Found = null;
    this.ownSection2Duplicate = false;
    this.ownSection2LookupError = '';
    this.ownSection2Source = null;
    this.deleteCodeType = '';
    this.deleteCode = '';
    this.deleteCompanyName = '';
    this.verifiedDeleteRecord = null;
    this.deleteVerificationMessage = '';
    this.deleteErrorMessage = '';
    this.deleteSuccessMessage = '';
    this.deleteVerifying = false;
    this.deleteSubmitting = false;
    this.gstinCardPos = { x: 0, y: 0 };
    this.gstinCardExpanded = false;
    this.gstinCollapsed = false;
    if (typeof document !== 'undefined') {
      try {
        const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
        fileInputs.forEach(input => {
          input.value = '';
        });
      } catch {
        // ignore in testing/headless environments
      }
    }
  }

  reset(): void {
    this.cancelPendingAsyncOperations();
    this.resetFormState();
    if (this.mode !== 'ownership' && this.mode !== 'delete') {
      this.applyLoginDivisionDefault();
    }
    this.cdr.markForCheck();
  }

  clearSelectedUploads(): void {
    this.gstins = this.gstins.map(g => ({ ...g, file: null, scanning: false, scanStatus: 'idle', scanError: '' }));
    this.cdr.markForCheck();
  }

  switchMode(newMode: 'ownership' | 'old' | 'new' | 'delete'): void {
    if (newMode === this.mode) {
      return;
    }

    this.cancelPendingAsyncOperations();
    this.resetFormState();

    this.mode = newMode;
    this.divisionSelectionManuallyChanged = false;
    if (newMode !== 'ownership' && newMode !== 'delete') {
      this.applyLoginDivisionDefault();
    }
    this.ownershipLogoMissing = false;
    this.deleteLogoMissing = false;
    this.cdr.markForCheck();
  }

  onDeleteCodeTypeChange(event: Event): void {
    this.deleteCodeType = (event.target as HTMLSelectElement).value as DeleteRequestCodeType | '';
    this.deleteLogoMissing = false;
    this.clearDeleteVerification();
  }

  onCurrentLogoError(): void {
    if (this.mode === 'delete') {
      this.deleteLogoMissing = true;
    }
  }

  onDeleteCodeChange(event: Event): void {
    this.deleteCode = (event.target as HTMLInputElement).value;
    this.clearDeleteVerification();
  }

  onDeleteCompanyNameChange(event: Event): void {
    this.deleteCompanyName = (event.target as HTMLInputElement).value;
  }

  verifyDeleteCode(): void {
    if (this.deleteVerifying || this.deleteSubmitting) return;

    const codeType = this.deleteCodeType;
    const code = this.deleteCode.trim();
    if (!codeType) {
      this.deleteErrorMessage = 'Please select a code type.';
      return;
    }
    if (!code) {
      this.deleteErrorMessage = 'Please enter a code.';
      return;
    }
//the issue fix and backend pull request and verify the comment and logicaly the error of verify and the some the some of executed error
    this.clearDeleteVerification();
    this.deleteVerifying = true;
    this.activeRequestsSub.add(
      this.customerService.verifyDeleteRequest(codeType, code).pipe(
        finalize(() => {
          this.deleteVerifying = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (result) => {
          if (!result.found) {
            this.deleteVerificationMessage = 'This code is not present in the records, so it cannot be deleted.';
            return;
          }
          const verifiedCode = result.code || code;
          const verifiedName = result.companyName || '';
          this.verifiedDeleteRecord = { codeType, code: verifiedCode, companyName: verifiedName };
          this.deleteCode = verifiedCode;
          this.deleteVerificationMessage = 'Code found. Please enter the company name to confirm the deletion.';
        },
        error: (error) => {
          this.deleteErrorMessage = error?.error?.message
            || 'Unable to verify the code at this time. Please try again later.';
        }
      })
    );
  }

  sendDeleteRequest(): void {
    if (this.deleteSubmitting || this.deleteVerifying) return;
    if (!this.isCurrentDeleteVerification()) {
      this.deleteErrorMessage = 'Verify the current code before sending a delete request.';
      return;
    }
    if (!this.deleteCompanyName.trim()) {
      this.deleteErrorMessage = 'Please enter the company name to confirm the request.';
      return;
    }
    if (this.deleteCompanyName.trim().toLowerCase() !== this.verifiedDeleteRecord!.companyName.trim().toLowerCase()) {
      this.deleteErrorMessage = 'Company name does not match the selected code. Please verify the company name.';
      return;
    }

    this.deleteErrorMessage = '';
    this.deleteSuccessMessage = '';
    this.deleteSubmitting = true;
    this.activeRequestsSub.add(
      this.customerService.submitDeleteRequest(
        this.verifiedDeleteRecord!.codeType,
        this.verifiedDeleteRecord!.code,
        this.deleteCompanyName
      ).pipe(
        finalize(() => {
          this.deleteSubmitting = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (result) => {
          this.deleteSuccessMessage = result?.message || 'Delete request sent successfully. The SQL has been sent to the DBA for execution.';
          this.verifiedDeleteRecord = null;
          this.deleteCompanyName = '';
          this.deleteVerificationMessage = '';
        },
        error: (error) => {
          this.deleteErrorMessage = error?.error?.message || 'Unable to send the delete request. Please try again later.';
        }
      })
    );
  }

  private isCurrentDeleteVerification(): boolean {
    return !!this.verifiedDeleteRecord
      && this.deleteCodeType === this.verifiedDeleteRecord.codeType
      && this.deleteCode.trim() === this.verifiedDeleteRecord.code;
  }

  private clearDeleteVerification(): void {
    this.verifiedDeleteRecord = null;
    this.deleteCompanyName = '';
    this.deleteVerificationMessage = '';
    this.deleteErrorMessage = '';
    this.deleteSuccessMessage = '';
  }

  /* ===== Ownership Section 1: Ownership Code lookup ===== */
  handleOwnershipCodeChange(code: string): void {
    const upperCode = (code || '').toUpperCase();
    this.form.ownershipCode = upperCode;
    this.form.ownershipPartyCode = upperCode;
    this.form.ownershipAddress = '';
    this.form.ownershipPartyAddress = '';
    this.form.address = '';
    this.form.panNumber = '';
    this.form.city = '';
    this.form.pincode = '';
    this.gstins = [{ ...blankGstin }];
    this.ownSection1Found = null;
    this.ownSection1Duplicate = false;
    this.ownSection1LookupError = '';
    this.ownSection1Source = null;
    delete this.errors['ownershipCode'];
    delete this.errors['ownershipPartyCode'];
    const reqId = ++this.ownSection1ReqId;
    if (this.ownSection1Timer) clearTimeout(this.ownSection1Timer);

    if (upperCode.trim().length === 4) {
      this.ownSection1Loading = true;
      this.ownSection1Timer = setTimeout(() => {
        const trimmed = upperCode.trim();
        this.activeRequestsSub.add(
          this.customerService.lookupOwnershipJDBC(trimmed).pipe(timeout(15000)).subscribe({
            next: (resp) => {
              if (reqId !== this.ownSection1ReqId) return;
              if (resp && resp.found && resp.data) {
                this.lastLookupRecord = resp.data;
                this.form.ownershipAddress = resp.data.ownershipDesc || '';
                this.form.ownershipPartyAddress = this.form.ownershipAddress;
                this.form.address = (resp.data.address || '').replace(/,\s+/g, ',').trim();
                this.form.panNumber = resp.data.panNumber || '';
                this.form.city = resp.data.city || '';
                this.form.pincode = resp.data.pincode || '';
                this.populateOwnershipGstins(resp.data.gstinNumbers || '');
                this.ownSection1Found = true;
                this.ownSection1Source = resp.data.recordSource;
              } else {
                this.ownSection1Found = false;
                this.ownSection1Source = 'INVALID_CODE';
                this.ownSection1LookupError = resp?.message
                  || 'This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.';
              }
              this.ownSection1Loading = false;
              this.cdr.markForCheck();
            },
            error: (error) => {
              if (reqId !== this.ownSection1ReqId) return;
              this.ownSection1Found = false;
              this.ownSection1Source = 'INVALID_CODE';
              this.ownSection1LookupError = error?.error?.message
                || 'This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.';
              this.ownSection1Loading = false;
              this.cdr.markForCheck();
            }
          })
        );
      }, 600);
    } else {
      this.ownSection1Loading = false;
      this.cdr.markForCheck();
    }
  }

  /* ===== Ownership Section 2: Ownership Party Code lookup ===== */
  handleOwnershipPartyCodeChange(code: string): void {
    const upperCode = (code || '').toUpperCase();
    this.form.ownershipPartyCode = upperCode;
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
        this.activeRequestsSub.add(
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
          })
        );
      }, 600);
    } else {
      this.ownSection2Loading = false;
      this.cdr.markForCheck();
    }
  }

  /* ===== Old User: lookup by customer / handling agent code ===== */
  triggerOldLookup(code: string, type: 'GLOBAL' | 'HANDLING_AGENT'): void {
    if (this.verifiedCustomerCode !== code.trim().toUpperCase()) {
      this.verifiedCustomerCode = null;
    }
    this.form.customerCode = code;
    this.form.companyName = '';
    this.form.address = '';
    this.form.city = '';
    this.form.pincode = '';
    this.form.panNumber = '';
    this.form.operatingDivision = '';
    this.form.zone = '';
    this.divisionSelectionManuallyChanged = false;
    this.applyLoginDivisionDefault();
    this.form.email = '';
    this.form.mobile = '';
    this.gstins = [{ ...blankGstin }];
    this.lookupDone = false;
    this.lookupError = '';
    this.addressStatus = '';

    const requestId = ++this.lookupRequestId;
    if (this.lookupTimer) clearTimeout(this.lookupTimer);

    if (code.trim().length === 4) {
      this.lookupLoading = true;
      this.lookupTimer = setTimeout(() => {
        const lookup$ = type === 'HANDLING_AGENT'
          ? this.customerService.lookupHandlingAgentJDBC(code.trim())
          : this.customerService.lookupOldCustomerJDBC(code.trim());

        this.activeRequestsSub.add(
          lookup$.pipe(
            timeout(15000),
            finalize(() => {
              if (requestId === this.lookupRequestId) {
                this.lookupLoading = false;
                this.cdr.markForCheck();
              }
            })
          ).subscribe({
            next: (customer: any) => {
              if (requestId !== this.lookupRequestId) return;
              this.lastLookupRecord = customer;
              this.form.companyName = customer.companyName || '';
              this.verifiedCustomerCode = code.trim().toUpperCase();
              this.form.customerCode = this.verifiedCustomerCode;
              this.form.address = (customer.address || '').replace(/,\s+/g, ',').trim();
              this.form.city = customer.city || '';
              this.form.pincode = customer.pincode || customer.pcoCode || '';
              this.form.panNumber = customer.panNumber || '';
              this.form.email = customer.email || customer.emailId || '';
              this.form.mobile = customer.mobile || customer.phoneNumber || '';
              this.applyOldRecordDivision(customer);

              if (customer.gstinNumbers && customer.gstinNumbers.trim() !== '') {
                const cleanGstins = customer.gstinNumbers.replace(/[\[\]"\s]/g, '');
                const loadedGstins: GstinEntry[] = cleanGstins.split(',').filter(Boolean).map((g: string, idx: number) => ({
                  ...blankGstin,
                  gstinId: `old-${idx}`,
                  gstin: g
                }));
                this.gstins = loadedGstins.length > 0 ? loadedGstins : [{ ...blankGstin }];
              } else {
                this.gstins = [{ ...blankGstin }];
              }

              this.removedGstinIds = [];
              this.lookupDone = true;
              this.lookupError = '';
              this.cdr.markForCheck();
            },
            error: (err: any) => {
              if (requestId !== this.lookupRequestId) return;
              this.verifiedCustomerCode = null;
              console.error('Lookup error:', err);
              this.lookupDone = false;
              this.lookupError = err?.name === 'TimeoutError'
                ? 'Customer lookup timed out. Please try again.'
                : err?.error?.message || err?.message || 'Error occurred while fetching customer data';
              this.gstins = [{ ...blankGstin }];
              this.cdr.markForCheck();
            }
          })
        );
      }, 800);
    } else {
      this.lookupLoading = false;
      this.verifiedCustomerCode = null;
      this.gstins = [{ ...blankGstin }];
    }
  }

  handleOldCodeChange(code: string): void {
    this.triggerOldLookup(code, this.codeType);
  }

  private applyOldRecordDivision(customer: any): void {
    const storedDivision = String(customer?.division || '').split('/').pop()?.trim();
    const selection = storedDivision
      ? getDivisionFormSelection(storedDivision, divisionsByZone)
      : undefined;
    if (selection) {
      this.form.zone = selection.zone;
      this.form.operatingDivision = selection.division;
    }
    this.divisionSelectionManuallyChanged = false;
  }

  handleOldCodeTypeChange(newType: 'GLOBAL' | 'HANDLING_AGENT'): void {
    if (newType === this.oldCodeType) {
      return;
    }
    this.cancelPendingAsyncOperations();
    this.oldCodeType = newType;
    this.form = { ...blank };
    this.gstins = [{ ...blankGstin }];
    this.lookupDone = false;
    this.lookupError = '';
    this.lookupLoading = false;
    this.verifiedCustomerCode = null;
    this.errors = {};
    this.notice = '';
    this.divisionSelectionManuallyChanged = false;
    this.applyLoginDivisionDefault();
    this.cdr.markForCheck();
  }

  /* ===== New User: generate code from company name ===== */
  handleNewCompanyNameChange(newName: string, isManual = true): void {
    if (isManual) {
      this.companyNameManuallyEdited = true;
    }
    const requestId = ++this.codeRequestId;
    this.form.companyName = newName;
    this.codeConfirmed = false;
    this.lookupError = '';
    delete this.errors['customerCode'];
    if (this.codeTimer) clearTimeout(this.codeTimer);

    if (newName.length > 40) {
      this.errors['companyName'] = 'Company name exceeds the maximum allowed length of 40 characters. Please verify and shorten it manually.';
      this.form.customerCode = '';
      this.codeChecking = false;
      return;
    }

    delete this.errors['companyName'];
    const initialCode = generateCustomerCode(newName);
    if (initialCode) {
      this.form.customerCode = initialCode;
      this.codeConfirmed = true;
      this.codeChecking = true;
      this.codeTimer = setTimeout(() => {
        this.activeRequestsSub.add(
          this.customerService.generateUniqueCode(newName, this.codeType).subscribe({
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
          })
        );
      }, 600);
    } else {
      this.form.customerCode = '';
      this.codeConfirmed = false;
      this.codeChecking = false;
    }
  }

  handleNewCodeTypeChange(newType: 'GLOBAL' | 'HANDLING_AGENT'): void {
    this.newCodeType = newType;
    if (this.mode === 'new' && this.form.companyName?.trim()) {
      this.handleNewCompanyNameChange(this.form.companyName);
    }
    this.cdr.markForCheck();
  }

  checkFile(f: File | null | undefined): string {
    if (!f) return 'GSTIN file is required';
    if (f.size > 5242880) return 'File size must not exceed 5MB';
    const extension = f.name.split('.').pop()?.toLowerCase();
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!supportedTypes.includes(f.type) && !['pdf', 'jpg', 'jpeg', 'jpe', 'png'].includes(extension || '')) {
      return 'Only PDF, JPG, JPEG, and PNG files are allowed';
    }
    return '';
  }

  isFormValid(): boolean {
    if (this.loading) {
      return false;
    }

    if (this.mode === 'ownership') {
      if (this.ownSection1Loading) {
        return false;
      }
      const code1 = (this.form.ownershipCode || '').trim().toUpperCase();
      const addr1 = (this.form.ownershipAddress || '').trim();

      if (!code1 || !addr1) return false;
      if (!/^[A-Z0-9]{4}$/.test(code1)) return false;
      if (this.ownSection1Source === 'INVALID_CODE' || this.ownSection1Source === 'LOOKUP_ERROR' || !this.ownSection1Source) return false;
      if (this.errors['ownershipCode'] || this.errors['ownershipAddress']) return false;
      return true;
    }

    if (this.mode === 'delete') {
      return false;
    }

    // Common validations for new and old modes
    const company = (this.form.companyName || '').trim();
    if (!company || company.length > 40) {
      return false;
    }

    const rawAddr = (this.form.address || '').trim();
    if (!rawAddr) {
      return false;
    }
    const normalizedAddr = this.getNormalizedAddress(rawAddr);
    if (!normalizedAddr || normalizedAddr.length > 100) {
      return false;
    }

    const pan = normalizeDocumentNumber(this.form.panNumber);
    if (!pan || pan.length !== 10 || !panRe.test(pan)) {
      return false;
    }

    if (this.form.pincode && this.form.pincode.trim()) {
      if (!/^[1-9][0-9]{5}$/.test(this.form.pincode.trim())) return false;
    }

    if (this.form.mobile && this.form.mobile.trim()) {
      if (!mobileRe.test(this.form.mobile.trim())) return false;
    }

    if (this.form.email && this.form.email.trim()) {
      if (!/^\S+@\S+\.\S+$/.test(this.form.email.trim())) return false;
    }

    if (this.mode === 'new') {
      const custCode = (this.form.customerCode || '').trim();
      if (!custCode || custCode.length !== 4) return false;
      if (this.codeChecking) return false;

      const div = (this.form.operatingDivision || '').trim();
      const zone = (this.form.zone || '').trim();
      if (!div || !zone) return false;

      if (!this.gstins || this.gstins.length === 0) return false;

      const stateSet = new Set<string>();
      const gstinSet = new Set<string>();

      for (let i = 0; i < this.gstins.length; i++) {
        const g = this.gstins[i];
        if (g.scanning) return false;

        const normGstin = normalizeDocumentNumber(g.gstin);
        if (!normGstin || normGstin.length !== 15 || !gstinRe.test(normGstin)) return false;
        if (gstinSet.has(normGstin)) return false;
        gstinSet.add(normGstin);

        // PAN embedded in GSTIN must match entered PAN
        if (normGstin.slice(2, 12) !== pan) return false;

        const state = (g.state || '').trim();
        if (!state) return false;
        if (stateSet.has(state)) return false;
        stateSet.add(state);

        if (!g.file && !g.existingFileName) return false;
        if (g.file && this.checkFile(g.file)) return false;
      }
    } else if (this.mode === 'old') {
      const custCode = (this.verifiedCustomerCode || this.form.customerCode || '').trim();
      if (!custCode || custCode.length !== 4) return false;
      if (this.lookupLoading || this.lookupError) return false;

      const isSingleBlankGstin = this.gstins.length === 1 && !this.gstins[0].gstin?.trim() && !this.gstins[0].file && !this.gstins[0].state;
      if (!isSingleBlankGstin) {
        const gstinSet = new Set<string>();
        for (let i = 0; i < this.gstins.length; i++) {
          const g = this.gstins[i];
          if (g.scanning) return false;

          const normGstin = normalizeDocumentNumber(g.gstin);
          if (!normGstin || normGstin.length !== 15 || !gstinRe.test(normGstin)) return false;
          if (gstinSet.has(normGstin)) return false;
          gstinSet.add(normGstin);

          if (normGstin.slice(2, 12) !== pan) return false;
          if (g.file && this.checkFile(g.file)) return false;
        }
      }
    }

    for (const key of Object.keys(this.errors)) {
      if (this.errors[key]) return false;
    }

    return true;
  }

  validate(): boolean {
    const e: Record<string, string> = {};
    if (this.mode === 'ownership') {
      if (!this.form.ownershipCode?.trim()) e['ownershipCode'] = 'Ownership Code is required';
      else if (!/^[A-Z0-9]{4}$/.test(this.form.ownershipCode.trim())) e['ownershipCode'] = 'Enter a valid four-character Global Customer Code.';
      else if (this.ownSection1Source === 'INVALID_CODE' || this.ownSection1Source === 'LOOKUP_ERROR') e['ownershipCode'] = this.ownSection1LookupError;
      else if (this.ownSection1Loading || !this.ownSection1Source) e['ownershipCode'] = 'Wait for ownership code lookup to complete.';
      if (!this.form.ownershipAddress?.trim()) e['ownershipAddress'] = 'Ownership Address is required';
      this.errors = e;
      return !Object.keys(e).length;
    }

    const requiredFields: (keyof CustomerPayload)[] = ['companyName', 'customerCode', 'address', 'panNumber'];
    if (this.mode === 'new') requiredFields.push('operatingDivision', 'zone');
    requiredFields.forEach(k => {
      const val = (this.form[k] || '').trim();
      if (!val) e[k] = 'This field is required';
    });
    if (this.mode === 'old') {
      const code = (this.verifiedCustomerCode || this.form.customerCode || '').trim();
      if (!code || code.length !== 4) {
        e['customerCode'] = 'Enter a valid four-character Customer Code.';
      } else if (this.lookupError) {
        e['customerCode'] = this.lookupError;
      }
    }
    if ((this.form.companyName || '').length > 40) {
      e['companyName'] = this.errors['companyName'] || 'Company name cannot exceed 40 characters.';
    }

    if (this.form.address) {
      this.form.address = this.getNormalizedAddress(this.form.address);
    }
    if (this.form.address && this.form.address.length > 100) e['address'] = 'Address cannot exceed 100 characters.';
    if (this.form.email?.trim() && !/^\S+@\S+\.\S+$/.test(this.form.email.trim())) e['email'] = 'Invalid email';
    if (this.form.mobile?.trim() && !mobileRe.test(this.form.mobile.trim())) e['mobile'] = 'Enter a valid 10-digit Indian mobile number';
    if (this.form.pincode && !/^[1-9][0-9]{5}$/.test(this.form.pincode)) e['pincode'] = 'Invalid pincode';
    const normalizedPan = normalizeDocumentNumber(this.form.panNumber);
    if (this.form.panNumber && !panRe.test(normalizedPan)) e['panNumber'] = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';

    const stateSet = new Set<string>();
    const gstinSet = new Set<string>();
    this.gstins.forEach((g, i) => {
      if (this.mode === 'old' && this.gstins.length === 1 && !g.gstin?.trim() && !g.file && !g.state) {
        return;
      }

      if (!g.state && this.mode === 'new') e[`gstin_${i}_state`] = 'State is required';
      else if (g.state && stateSet.has(g.state)) e[`gstin_${i}_state`] = 'State already added';
      else if (g.state) stateSet.add(g.state);

      const normalizedGstin = normalizeDocumentNumber(g.gstin);
      if (!g.gstin || !g.gstin.trim()) e[`gstin_${i}_gstin`] = 'GSTIN is required';
      else if (!gstinRe.test(normalizedGstin) || normalizedGstin.length !== 15) e[`gstin_${i}_gstin`] = 'Enter a valid 15-character GSTIN.';
      else if (gstinSet.has(normalizedGstin)) e[`gstin_${i}_gstin`] = 'GSTIN already added';
      else if (normalizedGstin.slice(2, 12) !== normalizedPan) e[`gstin_${i}_gstin`] = 'GSTIN does not match the PAN number.';
      else gstinSet.add(normalizedGstin);

      if (!g.file && !g.existingFileName && this.mode === 'new') {
        e[`gstin_${i}_file`] = 'GSTIN file is required';
      } else if (g.file) {
        const fe = this.checkFile(g.file);
        if (fe) e[`gstin_${i}_file`] = fe;
      }
    });

    if (this.mode === 'new') {
      if (!this.form.customerCode?.trim()) {
        e['customerCode'] = 'Customer code is required';
      } else if (this.codeChecking) {
        e['customerCode'] = 'Please wait - code is being verified';
      }
    }

    this.errors = e;
    return !Object.keys(e).length;
  }

  private isSuccessfulResponse(result: any): boolean {
    if (!result) return false;
    if (result.success === false) return false;
    if (result.success === true) return true;
    if (typeof result.message === 'string' && /sent to dba/i.test(result.message)) {
      return true;
    }
    if (result.customerCode) {
      return true;
    }
    return false;
  }

  private extractErrorMessage(err: any): string {
    if (!err) {
      return 'Your request could not be submitted. Please try again.';
    }

    if (err.status === 0 || err.name === 'TimeoutError' || (err.message && /network|refused|failed to fetch/i.test(err.message))) {
      return 'Unable to connect to the server. Please check your network connection and try again.';
    }

    if (err.status === 401) {
      return 'Session expired or unauthorized. Please sign in again.';
    }

    if (err.status === 403) {
      return 'You do not have permission to perform this action.';
    }

    let rawMsg = '';
    if (typeof err.error === 'string') {
      rawMsg = err.error;
    } else if (err.error && typeof err.error.message === 'string') {
      rawMsg = err.error.message;
    } else if (typeof err.message === 'string') {
      rawMsg = err.message;
    }

    if (rawMsg) {
      if (rawMsg.includes('- [com.cris')) {
        rawMsg = rawMsg.split('- [com.cris')[0].trim();
      }
      if (rawMsg.includes('Exception:')) {
        const parts = rawMsg.split('Exception:');
        rawMsg = parts[parts.length - 1].trim();
      }
      if (/ORA-\d+|PLS-\d+|SQLSyntaxErrorException/i.test(rawMsg)) {
        rawMsg = 'A database processing error occurred. Please contact support or try again.';
      }
      if (rawMsg.length > 200) {
        rawMsg = rawMsg.substring(0, 197) + '...';
      }
      if (rawMsg.trim()) {
        return rawMsg.trim();
      }
    }

    if (err.status === 400) {
      return 'Invalid request data. Please check all fields and try again.';
    }

    if (err.status === 404) {
      return 'Requested customer or endpoint could not be found.';
    }

    if (err.status === 409) {
      return 'A customer with this code or information already exists.';
    }

    if (err.status >= 500) {
      return 'An internal server error occurred while processing your request. Please try again later.';
    }

    return 'Your request could not be submitted. Please try again.';
  }


  downloadPdfSummary(): void {
    if (!this.pdfGeneratorService) {
      return;
    }
    const code = this.form.customerCode || this.form.ownershipCode || 'REGISTRATION';
    const gstins = (this.gstins || [])
      .filter((g) => g.gstin && g.gstin.trim() !== '')
      .map((g) => ({ gstin: g.gstin.trim(), state: g.state }));

    const state = gstins.length > 0 ? gstins[0].state : '';

    this.pdfGeneratorService.downloadRegistrationPdf({
      code: code,
      codeType: this.codeType === 'HANDLING_AGENT' ? 'HANDLING_AGENT' : (this.mode === 'ownership' ? 'OWNERSHIP' : 'GLOBAL'),
      companyName: this.form.companyName || this.form.ownershipAddress || 'N/A',
      tradeName: this.form.companyName,
      panNumber: this.form.panNumber,
      address: this.form.address || this.form.ownershipPartyAddress,
      city: this.form.city,
      state: state,
      pincode: this.form.pincode,
      gstins: gstins.length > 0 ? gstins : undefined,
      ownershipCode: this.form.ownershipCode,
      ownershipDesc: this.form.ownershipAddress,
      partyCode: this.form.ownershipPartyCode,
      partyDesc: this.form.ownershipPartyAddress,
      recordDate: this.lastLookupRecord?.creationDate || this.lastLookupRecord?.date || this.lastLookupRecord?.createdDate
    });
  }

  submit(e?: Event): void {
    if (e) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
    if (this.mode === 'delete') {
      this.verifyDeleteCode();
      return;
    }
    if (this.loading) {
      return;
    }
    this.notice = '';

    if (!this.validate() || !this.isFormValid()) {
      const errorKeys = Object.keys(this.errors);
      const firstErrorMsg = errorKeys.length > 0 ? this.errors[errorKeys[0]] : 'Please ensure all required fields and validations are satisfied.';
      this.notice = `Validation Error: ${firstErrorMsg}`;
      this.notificationService.error('Validation Error', firstErrorMsg);
      console.warn('Form validation failed:', this.errors);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();
    console.log('Submitting customer registration in mode:', this.mode);

    if (this.mode === 'ownership') {
      const ownershipCode = (this.form.ownershipCode || '').trim().toUpperCase();
      const ownershipAddress = (this.form.ownershipAddress || '').trim();
      const ownershipPartyCode = (this.form.ownershipPartyCode || ownershipCode).trim().toUpperCase();
      const ownershipPartyAddress = (this.form.ownershipPartyAddress || ownershipAddress).trim();

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
          if (this.isSuccessfulResponse(result)) {
            this.notice = result?.message || 'Request email sent to DBA. Database changes are pending DBA execution.';
            this.notificationService.success(
              'Request Submitted Successfully',
              'Your request has been submitted successfully, and the SQL query has been sent to the DBA for execution.'
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
          console.error('Ownership submission error:', err);
          const errorMsg = this.extractErrorMessage(err);
          this.notice = errorMsg;
          this.notificationService.error('Submission Failed', errorMsg);
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.cdr.markForCheck();
        }
      });
    } else if (this.mode === 'new') {
      this.customerService.registerCustomer({ ...this.form, codeType: this.codeType }, this.gstins).pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (result) => {
          if (this.isSuccessfulResponse(result)) {
            const assignedCode = result?.customerCode;
            this.reset();
            this.notice = assignedCode
              ? `Request email sent to DBA. Database changes are pending DBA execution. Customer Code: ${assignedCode}`
              : (result?.message || 'Request email sent to DBA. The database change is pending DBA execution.');
            this.notificationService.success(
              'Request Submitted Successfully',
              'Your request has been submitted successfully, and the SQL query has been sent to the DBA for execution.'
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
          console.error('New registration submission error:', err);
          const errorMsg = this.extractErrorMessage(err);
          this.notice = errorMsg;
          this.notificationService.error('Submission Failed', errorMsg);
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.cdr.markForCheck();
        }
      });
    } else {
      const customerCode = this.verifiedCustomerCode || this.form.customerCode.trim().toUpperCase();
      this.customerService.updateOldCustomerJDBC(
        {
          ...this.form,
          customerCode,
          codeType: this.codeType,
          operatingDivision: this.divisionSelectionManuallyChanged && this.form.operatingDivision
            ? this.form.operatingDivision
            : undefined
        },
        this.gstins
      ).pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (result) => {
          if (this.isSuccessfulResponse(result)) {
            this.clearSelectedUploads();
            this.notice = result?.message || 'Request email sent to DBA. The database change is pending DBA execution.';
            this.notificationService.success(
              'Request Submitted Successfully',
              'Your request has been submitted successfully, and the SQL query has been sent to the DBA for execution.'
            );
            this.removedGstinIds = [];

            // Refresh from DB
            const codeToRefresh = this.verifiedCustomerCode || this.form.customerCode.trim().toUpperCase();
            if (codeToRefresh) {
              const refresh$ = this.codeType === 'HANDLING_AGENT'
                ? this.customerService.lookupHandlingAgentJDBC(codeToRefresh)
                : this.customerService.lookupOldCustomerJDBC(codeToRefresh);

              refresh$.subscribe({
                next: (refreshed: any) => {
                  if (refreshed) {
                    this.lastLookupRecord = refreshed;
                    this.form.companyName = refreshed.companyName || this.form.companyName;
                    this.form.address = (refreshed.address || this.form.address).replace(/,\s+/g, ',').trim();
                    this.form.city = refreshed.city || this.form.city;
                    this.form.pincode = refreshed.pincode || refreshed.pcoCode || this.form.pincode;
                    this.form.panNumber = refreshed.panNumber || this.form.panNumber;
                    this.form.email = refreshed.email || refreshed.emailId || this.form.email;
                    this.form.mobile = refreshed.mobile || refreshed.phoneNumber || this.form.mobile;
                    this.applyOldRecordDivision(refreshed);

                    if (refreshed.gstinNumbers && refreshed.gstinNumbers.trim() !== '') {
                      const cleanGstins = refreshed.gstinNumbers.replace(/[\[\]"\s]/g, '');
                      const loadedGstins: GstinEntry[] = cleanGstins.split(',').filter(Boolean).map((g: string, idx: number) => ({
                        ...blankGstin,
                        gstinId: `old-${idx}`,
                        gstin: g
                      }));
                      this.gstins = loadedGstins.length > 0 ? loadedGstins : [{ ...blankGstin }];
                    } else {
                      this.gstins = [{ ...blankGstin }];
                    }
                    this.cdr.markForCheck();
                  }
                },
                error: (refreshErr) => console.error('Refresh lookup error:', refreshErr)
              });
            }
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
          console.error('Update old customer error:', err);
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
  }

  addGstin(): void {
    this.gstins.push({ ...blankGstin });
  }

  removeGstin(index: number): void {
    const removed = this.gstins[index];
    if (removed?.gstinId) {
      this.removedGstinIds.push(removed.gstinId);
    }
    this.gstins.splice(index, 1);
    this.ocrDataMap.delete(index);
    const newOcrMap = new Map<number, Partial<ExtractedGstinDetails>>();
    this.ocrDataMap.forEach((val, key) => {
      if (key > index) {
        newOcrMap.set(key - 1, val);
      } else if (key < index) {
        newOcrMap.set(key, val);
      }
    });
    this.ocrDataMap = newOcrMap;

    if (this.activeCrossCheckIndex === index) {
      this.dismissCrossCheck();
    } else if (this.activeCrossCheckIndex !== null && this.activeCrossCheckIndex > index) {
      this.activeCrossCheckIndex--;
    }

    const newErrors: Record<string, string> = {};
    for (const [key, val] of Object.entries(this.errors)) {
      const match = key.match(/^gstin_(\d+)_(.*)$/);
      if (match) {
        const errIdx = parseInt(match[1], 10);
        if (errIdx === index) {
          continue;
        } else if (errIdx > index) {
          newErrors[`gstin_${errIdx - 1}_${match[2]}`] = val;
        } else {
          newErrors[key] = val;
        }
      } else {
        newErrors[key] = val;
      }
    }
    this.errors = newErrors;
    this.cdr.markForCheck();
  }

  trackByGstin(index: number, item: GstinEntry): any {
    return item.gstinId || index;
  }

  handleGstinChange(index: number, updates: Partial<GstinEntry>): void {
    const oldGstin = this.gstins[index]?.gstin;
    this.gstins[index] = { ...this.gstins[index], ...updates };
    if (Object.prototype.hasOwnProperty.call(updates, 'gstin')) {
      const currentGstin = updates.gstin || '';
      if (oldGstin !== currentGstin) {
        this.gstins[index].verificationState = 'idle';
        this.gstins[index].verificationData = null;
        this.gstins[index].crossCheckResult = null;
        this.ocrDataMap.delete(index);
        if (this.activeCrossCheckIndex === index) {
          this.dismissCrossCheck();
        }
      }
      const field = `gstin_${index}_gstin`;
      const norm = normalizeDocumentNumber(currentGstin);
      if (norm.length === 15) {
        const status = this.getGstinPanStatus(currentGstin, this.form.panNumber);
        if (status === 'GSTIN does not match the PAN number.') {
          this.errors[field] = 'GSTIN does not match the PAN number.';
        } else if (status?.startsWith('Enter')) {
          this.errors[field] = status;
        } else {
          delete this.errors[field];
        }
      } else if (this.errors[field] && this.errors[field] !== 'GSTIN could not be detected. Please enter your GSTIN manually to fetch your registered details.') {
        delete this.errors[field];
      }
    }
  }

  handleGstinBlur(index: number): void {
    const g = this.gstins[index];
    if (!g) return;
    const field = `gstin_${index}_gstin`;
    const rawGstin = (g.gstin || '').trim();
    if (!rawGstin) {
      delete this.errors[field];
      return;
    }
    const status = this.getGstinPanStatus(rawGstin, this.form.panNumber);
    if (status === 'GSTIN does not match the PAN number.') {
      this.errors[field] = 'GSTIN does not match the PAN number.';
    } else if (status?.startsWith('Enter')) {
      this.errors[field] = status;
    } else {
      delete this.errors[field];
    }
  }

  handleGstinStateChange(index: number, state: string): void {
    this.handleGstinChange(index, { state });
    const field = `gstin_${index}_state`;
    if (state && this.gstins.some((gstin, currentIndex) => currentIndex !== index && gstin.state === state)) {
      this.errors[field] = 'State already added';
    } else if (this.errors[field]) {
      delete this.errors[field];
    }
  }

  handlePanChange(value: string, isManual = true): void {
    if (isManual) {
      this.panManuallyEdited = true;
    }
    this.form.panNumber = value;
    const normalizedPan = normalizeDocumentNumber(value);
    if (value && !panRe.test(normalizedPan)) {
      this.errors['panNumber'] = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';
    } else if (this.errors['panNumber']?.startsWith('Enter a valid PAN')) {
      delete this.errors['panNumber'];
    }

    this.gstins.forEach((gstin, index) => {
      const status = this.getGstinPanStatus(gstin.gstin, value);
      const field = `gstin_${index}_gstin`;
      if (status === 'GSTIN does not match the PAN number.') {
        this.errors[field] = 'GSTIN does not match the PAN number.';
      } else if (status?.startsWith('Enter')) {
        if (this.errors[field]) {
          this.errors[field] = status;
        }
      } else if (['GSTIN does not match the PAN number.', 'Enter a valid 15-character GSTIN.'].includes(this.errors[field])) {
        delete this.errors[field];
      }
    });
  }

  verifyGstinAtIndex(index: number, isAutoTriggered = false): void {
    const entry = this.gstins[index];
    if (!entry) return;

    const gstin = normalizeDocumentNumber(entry.gstin);
    if (!gstinRe.test(gstin)) {
      if (!isAutoTriggered) {
        this.errors[`gstin_${index}_gstin`] = 'Enter a valid 15-character GSTIN.';
        this.cdr.markForCheck();
      }
      return;
    }

    if (!this.gstVerificationService) {
      return;
    }

    entry.verificationState = 'verifying';
    this.cdr.markForCheck();

    const ocrSnapshot = this.ocrDataMap.get(index);
    const verify$ = ocrSnapshot
      ? this.gstVerificationService.verifyGstin(gstin, ocrSnapshot)
      : this.gstVerificationService.verifyGstin(gstin);

    this.activeRequestsSub.add(
      verify$.subscribe({
        next: (res: GstVerificationResponse) => {
          if (!this.gstins[index]) return;

          entry.verificationData = res;

          let uiState: GstVerificationUiState = 'verified';

          if (res.verificationStatus === 'CANCELLED') {
            uiState = 'cancelled';
          } else if (res.verificationStatus === 'SUSPENDED') {
            uiState = 'suspended';
          } else if (res.verificationStatus === 'NOT_FOUND') {
            uiState = 'notfound';
          } else if (res.verificationStatus === 'INVALID_GSTIN') {
            uiState = 'invalid';
          } else if (res.verificationStatus === 'SERVICE_UNAVAILABLE' || res.verificationStatus === 'ERROR') {
            uiState = 'unavailable';
          } else if (res.verificationStatus === 'VERIFIED') {
            const ocrData = this.ocrDataMap.get(index);
            if (ocrData) {
              const crossCheck = this.gstVerificationService!.compareOcrAndVerified(ocrData, res);
              entry.crossCheckResult = crossCheck;
              uiState = crossCheck.hasDiscrepancies ? 'discrepancy' : 'verified';
            } else {
              uiState = 'verified';
            }
          }

          entry.verificationState = uiState;

          // Clear previous scan error when verification succeeds
          if (res.success && (res.verificationStatus === 'VERIFIED' || res.verificationStatus === 'CANCELLED' || res.verificationStatus === 'SUSPENDED')) {
            entry.scanError = '';
            delete this.errors[`gstin_${index}_gstin`];
            if (entry.scanStatus === 'notfound' || entry.scanStatus === 'error') {
              entry.scanStatus = 'idle';
            }
            this.applyVerifiedDataToForm(index, res, isAutoTriggered);
            if (!isAutoTriggered) {
              if (res.verificationStatus === 'VERIFIED') {
                this.notificationService.success('GSTIN Verified', 'Official GST registration details retrieved and form populated.');
              } else if (res.verificationStatus === 'CANCELLED') {
                this.notificationService.warning('GSTIN Cancelled', 'Warning: This GSTIN is marked as CANCELLED in the official registry.');
              } else if (res.verificationStatus === 'SUSPENDED') {
                this.notificationService.warning('GSTIN Suspended', 'Warning: This GSTIN is marked as SUSPENDED in the official registry.');
              }
            }
          } else if (!isAutoTriggered) {
            if (res.verificationStatus === 'NOT_FOUND') {
              this.notificationService.error('GSTIN Not Found', 'The entered GSTIN was not found in the official GST registry.');
            } else if (res.verificationStatus === 'INVALID_GSTIN') {
              this.notificationService.error('Invalid GSTIN', 'The entered GSTIN is invalid.');
            } else {
              this.notificationService.error('Verification Unavailable', 'Authorized GST verification service is currently unavailable. Please try again later.');
            }
          }

          // If activeCrossCheckIndex was already this index, or if discrepancies were found, make available
          if (entry.crossCheckResult && (this.activeCrossCheckIndex === index || (!isAutoTriggered && entry.crossCheckResult.hasDiscrepancies))) {
            this.activeCrossCheck = entry.crossCheckResult;
            this.activeCrossCheckIndex = index;
          }

          this.cdr.markForCheck();
        },
        error: () => {
          if (!this.gstins[index]) return;
          entry.verificationState = 'unavailable';
          if (!isAutoTriggered) {
            this.notificationService.error('Verification Failed', 'Failed to connect to the GST verification service. Please check your network or try again later.');
          }
          this.cdr.markForCheck();
        }
      })
    );
  }

  applyVerifiedDataToForm(index: number, verified: GstVerificationResponse, isAutoTriggered: boolean): void {
    if (this.mode === 'delete') return;

    const entry = this.gstins[index];
    if (verified.gstin && (!entry.gstin || entry.gstin !== verified.gstin)) {
      entry.gstin = verified.gstin;
    }

    if (verified.state && (!entry.state || isAutoTriggered || !isAutoTriggered)) {
      this.handleGstinStateChange(index, verified.state);
    }

    // Prefer Trade Name for company name when available; otherwise Legal Business Name
    const verifiedCompany = (verified.tradeName && verified.tradeName.trim())
      ? verified.tradeName.trim()
      : (verified.legalName && verified.legalName.trim()
          ? verified.legalName.trim()
          : (verified.businessName ? verified.businessName.trim() : ''));

    if (this.mode === 'new') {
      // 1. Company Name
      if (verifiedCompany && (!this.companyNameManuallyEdited || !this.form.companyName)) {
        this.handleNewCompanyNameChange(verifiedCompany, false);
        if (verifiedCompany.length > 40) {
          this.errors['companyName'] = 'Company name exceeds the maximum allowed length of 40 characters. Please verify and shorten it manually.';
        } else {
          delete this.errors['companyName'];
        }
      }

      // 2. PAN Number
      if (verified.pan && (!this.panManuallyEdited || !this.form.panNumber)) {
        this.handlePanChange(verified.pan, false);
      }

      // 3. Address
      if (verified.address && (!this.addressManuallyEdited || !this.form.address)) {
        const cleaned = cleanAndShortenAddress(verified.address);
        if (cleaned) {
          this.form.address = cleaned;
          this.addressStatus = 'auto-filled';
          delete this.errors['address'];
        }
      }

      // 4. City
      if (verified.city && !this.form.city) {
        this.form.city = verified.city;
        delete this.errors['city'];
      }

      // 5. Pincode
      if (verified.pincode && !this.form.pincode) {
        this.form.pincode = verified.pincode;
        delete this.errors['pincode'];
      }
    } else if (this.mode === 'old') {
      if (verifiedCompany && (!this.form.companyName || !isAutoTriggered)) {
        this.form.companyName = verifiedCompany;
        if (verifiedCompany.length > 40) {
          this.errors['companyName'] = 'Company name exceeds the maximum allowed length of 40 characters. Please verify and shorten it manually.';
        } else {
          delete this.errors['companyName'];
        }
      }
      if (verified.pan && (!this.form.panNumber || !isAutoTriggered)) {
        this.handlePanChange(verified.pan, false);
      }
      if (verified.address && (!this.form.address || !isAutoTriggered)) {
        const cleaned = cleanAndShortenAddress(verified.address);
        if (cleaned) {
          this.form.address = cleaned;
          this.addressStatus = 'auto-filled';
          delete this.errors['address'];
        }
      }
      if (verified.city && (!this.form.city || !isAutoTriggered)) {
        this.form.city = verified.city;
        delete this.errors['city'];
      }
      if (verified.pincode && (!this.form.pincode || !isAutoTriggered)) {
        this.form.pincode = verified.pincode;
        delete this.errors['pincode'];
      }
    }
  }

  toggleCrossCheckView(index: number): void {
    if (this.activeCrossCheckIndex === index) {
      this.dismissCrossCheck();
    } else {
      this.activeCrossCheckIndex = index;
      const entry = this.gstins[index];
      if (entry?.crossCheckResult) {
        this.activeCrossCheck = entry.crossCheckResult;
      } else if (entry?.verificationData) {
        const ocrData = this.ocrDataMap.get(index) || {};
        this.activeCrossCheck = this.gstVerificationService?.compareOcrAndVerified(ocrData, entry.verificationData) || null;
      } else {
        this.activeCrossCheck = null;
      }
    }
    this.cdr.markForCheck();
  }

  dismissCrossCheck(): void {
    this.activeCrossCheck = null;
    this.activeCrossCheckIndex = null;
    this.cdr.markForCheck();
  }

  get normalizedAddressLength(): number {
    return this.getNormalizedAddress(this.form.address).length;
  }

  getNormalizedAddress(address: string | null | undefined): string {
    if (!address) return '';
    return address.replace(/,\s+/g, ',').trim();
  }

  handleAddressBlur(): void {
    if (this.form.address) {
      this.form.address = this.getNormalizedAddress(this.form.address);
    }
  }

  handleAddressPaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text');
    if (text && /,\s+/.test(text)) {
      e.preventDefault();
      const normalized = text.replace(/,\s+/g, ',');
      const target = e.target as HTMLInputElement;
      const start = target?.selectionStart ?? (this.form.address || '').length;
      const end = target?.selectionEnd ?? (this.form.address || '').length;
      const current = this.form.address || '';
      this.form.address = current.slice(0, start) + normalized + current.slice(end);
      this.handleAddressInput();
    }
  }

  handleAddressInput(): void {
    this.addressManuallyEdited = true;
    this.addressStatus = '';
    if (this.errors['address'] === 'Address cannot exceed 100 characters.' && this.normalizedAddressLength <= 100) {
      delete this.errors['address'];
    }
  }

  async handleGstinFileChange(index: number, e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const selected = input?.files?.[0];
    if (input) {
      input.value = '';
    }
    if (!selected) return;

    const currentReqId = ++this.ocrRequestId;

    if (this.mode !== 'old') {
      this.form.companyName = '';
      this.form.customerCode = '';
      this.form.panNumber = '';
      this.form.address = '';
      this.form.city = '';
      this.form.pincode = '';
      this.addressStatus = '';
      this.addressManuallyEdited = false;
      this.ocrAutoFillApplied = false;
    }

    // Clear previous OCR validation errors and warnings
    delete this.errors['companyName'];
    delete this.errors['customerCode'];
    delete this.errors['panNumber'];
    delete this.errors['address'];
    delete this.errors['city'];
    delete this.errors['pincode'];
    delete this.errors[`gstin_${index}_gstin`];
    delete this.errors[`gstin_${index}_file`];
    delete this.errors[`gstin_${index}_state`];

    // Clear previous GSTIN processing results for this entry
    if (this.gstins[index]) {
      this.gstins[index].gstin = '';
      this.gstins[index].state = '';
    }
    if (this.mode !== 'old' && index === 0 && this.gstins.length > 1) {
      this.gstins = [this.gstins[0]];
    }

    const error = this.checkFile(selected);
    if (error) {
      this.handleGstinChange(index, { file: null, scanning: false, scanStatus: 'error', scanError: error });
      this.errors[`gstin_${index}_file`] = error;
      this.cdr.markForCheck();
      return;
    }

    this.handleGstinChange(index, { file: selected, scanning: true, scanStatus: 'processing', scanError: '' });
    this.cdr.markForCheck();

    try {
      const {
        gstin,
        stateName,
        address,
        city,
        pincode,
        tradeName,
        legalName,
        businessName,
        pan: ocrPan,
        panMismatch,
        companyNameTooLong
      } = await this.panOcrService.extractGstinFromFile(selected);

      // Prevent an older OCR request from overwriting a newer upload
      if (currentReqId !== this.ocrRequestId) {
        return;
      }

      const normalizedGstin = normalizeDocumentNumber(gstin);
      const gstinDerivedPan = gstinRe.test(normalizedGstin) ? normalizedGstin.slice(2, 12) : '';
      const extractedPan = ocrPan || gstinDerivedPan;

      if (!gstinRe.test(normalizedGstin)) {
        const message = 'GSTIN could not be detected. Please enter your GSTIN manually to fetch your registered details.';
        this.handleGstinChange(index, { scanning: false, scanStatus: gstin ? 'error' : 'notfound', scanError: message });
        this.errors[`gstin_${index}_gstin`] = message;
        return;
      }

      const derivedState = stateName || (normalizedGstin ? getStateNameFromGstinCode(normalizedGstin.slice(0, 2)) : null);
      const updates: Partial<GstinEntry> = {
        gstin: normalizedGstin,
        scanning: false,
        scanStatus: 'success',
        scanError: ''
      };
      if (derivedState && (!this.gstins[index]?.state || this.gstins[index]?.state === '')) {
        updates.state = derivedState;
      }
      this.handleGstinChange(index, updates);
      delete this.errors[`gstin_${index}_gstin`];
      delete this.errors[`gstin_${index}_state`];

      if (this.mode !== 'old') {
        // 1. Company Name
        const extractedCompany = (tradeName && tradeName.trim())
          ? tradeName.trim()
          : (legalName && legalName.trim()
              ? legalName.trim()
              : (businessName ? businessName.trim() : ''));
        if (extractedCompany) {
          if (this.mode === 'new') {
            this.handleNewCompanyNameChange(extractedCompany);
          } else {
            this.form.companyName = extractedCompany;
          }
          if (extractedCompany.length > 40 || companyNameTooLong) {
            this.errors['companyName'] = 'Company name exceeds the maximum allowed length of 40 characters. Please verify and shorten it manually.';
          } else {
            delete this.errors['companyName'];
          }
        }

        // 2. PAN Number
        if (panMismatch || (ocrPan && gstinDerivedPan && ocrPan !== gstinDerivedPan)) {
          this.errors['panNumber'] = 'Extracted PAN does not match the GSTIN.';
          this.form.panNumber = ocrPan || gstinDerivedPan;
        } else if (!panRe.test(extractedPan)) {
          const message = 'The extracted GSTIN contains an invalid PAN. Please upload a clearer GSTIN document or enter the GSTIN and PAN manually.';
          this.handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message });
          this.errors['panNumber'] = 'PAN could not be derived because the extracted GSTIN is invalid.';
          this.errors[`gstin_${index}_gstin`] = message;
          return;
        } else {
          this.form.panNumber = extractedPan;
          delete this.errors['panNumber'];
        }

        // 3. Address
        const cleanedAddress = cleanAndShortenAddress(address);
        if (cleanedAddress) {
          this.form.address = cleanedAddress;
          this.addressStatus = 'auto-filled';
          delete this.errors['address'];
        } else {
          this.addressStatus = 'extraction-failed';
        }

        // 4. City Name
        if (city) {
          this.form.city = city;
          delete this.errors['city'];
        }

        // 5. PIN Code
        if (pincode) {
          this.form.pincode = pincode;
          delete this.errors['pincode'];
        }
      }

      this.ocrAutoFillApplied = true;

      // Save raw OCR extracted snapshot for cross-verification against authorized registry
      const ocrSnapshot: Partial<ExtractedGstinDetails> = {
        gstin: normalizedGstin,
        legalName: legalName || undefined,
        tradeName: tradeName || undefined,
        businessName: businessName || undefined,
        pan: extractedPan || undefined,
        address: address || undefined,
        city: city || undefined,
        pincode: pincode || undefined,
        stateName: derivedState || undefined
      };
      this.ocrDataMap.set(index, ocrSnapshot);

      // Automatically initiate GSTIN verification against authorized registry
      if (gstinRe.test(normalizedGstin)) {
        this.verifyGstinAtIndex(index, true);
      }
    } catch (err) {
      if (currentReqId !== this.ocrRequestId) return;
      console.error('GSTIN OCR scan failed:', err);
      const message = err instanceof Error && err.message.startsWith('PDF exceeds the')
        ? `${err.message} Please upload a shorter PDF.`
        : 'GSTIN could not be detected. Please enter your GSTIN manually to fetch your registered details.';
      this.handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message });
      this.errors[`gstin_${index}_gstin`] = message;
    } finally {
      if (currentReqId === this.ocrRequestId) {
        this.cdr.markForCheck();
      }
    }
  }

  // Zone select
  toggleZoneMenu(): void {
    this.zoneOpen = !this.zoneOpen;
    if (!this.zoneOpen) this.zoneSearchTerm = '';
  }

  chooseZone(zone: string): void {
    this.divisionSelectionManuallyChanged = true;
    this.form.zone = zone;
    this.form.operatingDivision = '';
    this.zoneSearchTerm = '';
    this.zoneOpen = false;
    delete this.errors['zone'];
  }

  // Division select
  toggleDivisionMenu(): void {
    if (this.form.zone) {
      this.divisionOpen = !this.divisionOpen;
    }
  }

  chooseDivision(div: string): void {
    this.divisionSelectionManuallyChanged = true;
    this.form.operatingDivision = div;
    this.divisionOpen = false;
    delete this.errors['operatingDivision'];
  }
}