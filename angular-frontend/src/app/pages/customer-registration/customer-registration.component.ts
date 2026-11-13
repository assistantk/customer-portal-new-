import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { catchError, finalize, filter, map, of, Subscription, switchMap, timeout, firstValueFrom } from 'rxjs';
import { CustomerService, GstinEntry, CustomerPayload, DeleteRequestCodeType, GstinRemoval, SemGstinVerificationResult, GstinDuplicateRecord, GstinDuplicateCheckResult, PanDuplicateCheckResult, PanCompanyRecord, PanGstinRecord } from '../../services/customer.service';
import { PanOcrService, cleanAndShortenAddress, getStateNameFromGstinCode } from '../../services/pan-ocr.service';
import { generateCustomerCode } from '../../services/customer-code-generator';
import { NotificationService } from '../../services/notification.service';
import { PdfGeneratorService } from '../../services/pdf-generator.service';
import { AuthService } from '../../services/auth.service';
import { getDivisionFormSelection } from '../../utils/division-codes';
import { IMAGE_ASSETS } from '../../config/image-assets';
import { ZoneDivisionService } from '../../services/zone-division.service';
import { ReviewModalData, ReviewOperationType, ReviewGstinItem, ReviewGstinAddressUpdate, FieldComparison } from '../../components/review-modal/review-modal.component';

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
  registeredAddress: '',
  city: '',
  pincode: '',
  file: null,
  existingFileName: '',
  scanning: false,
  scanStatus: 'idle',
  scanError: '',
  scanProgress: '',
  addressStatus: ''
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

const gstinRe = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const panRe = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const mobileRe = /^[6-9][0-9]{9}$/;
const duplicateUpdateContextKey = 'customer.registration.duplicateUpdateContext';
let duplicateUpdateContextFallback: string | null = null;

export type UpdateNavigationSource = 'DIRECT_UPDATE' | 'EXISTING_PAN_REDIRECT' | 'EXISTING_GSTIN_REDIRECT';

export interface DuplicateUpdateContext {
  source: UpdateNavigationSource;
  codeType: 'GLOBAL' | 'HANDLING_AGENT';
  companyCode: string;
  gstin?: string;
  pan?: string;
  intendedOperation?: 'ADD_NEW_GSTIN' | 'UPDATE_EXISTING_DETAILS';
  companyName?: string;
  address?: string;
  city?: string;
  pincode?: string;
  expiresAt: number;
}

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
  showReviewModal = false;
  reviewSubmitting = false;
  reviewData: ReviewModalData | null = null;
  initialOwnershipDesc = '';
  initialPartyDesc = '';
  mode: 'ownership' | 'old' | 'new' | 'delete' = 'old';
  oldCodeType: 'GLOBAL' | 'HANDLING_AGENT' = 'GLOBAL';
  newCodeType: 'GLOBAL' | 'HANDLING_AGENT' = 'GLOBAL';
  navigationSource: UpdateNavigationSource = 'DIRECT_UPDATE';
  updateRedirectContext: DuplicateUpdateContext | null = null;

  get isCompanyCodeReadOnly(): boolean {
    return this.mode === 'old' && (
      this.navigationSource === 'EXISTING_PAN_REDIRECT' ||
      this.navigationSource === 'EXISTING_GSTIN_REDIRECT'
    );
  }

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
        gstin: gstin.toUpperCase(),
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
      return 'Freight Customer Code';
    }

    if ((this.mode === 'old' || this.mode === 'new')
      && this.codeType === 'HANDLING_AGENT') {
      return 'Handling Agent Code Logo';
    }
    return this.mode === 'new'
      ? 'Global Customer Code Logo'
      : 'Freight Customer Code';
  }
  form: CustomerPayload = { ...blank };
  gstins: GstinEntry[] = [{ ...blankGstin }];
  errors: Record<string, string> = {};
  touchedFields: Record<string, boolean> = {};
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
  pendingGstinRemovals: GstinRemoval[] = [];
  gstinCollapsed = false;
  isOldPanDisabled = false;
  isOldGstDisabled = false;
  selectedGstinAddressIndex = 0;
  showDuplicateModal = false;
  selectedDuplicateRecords: GstinDuplicateRecord[] = [];
  private duplicateCheckTimers: { [index: number]: any } = {};

  // PAN Duplicate Check State
  showPanDuplicateModal = false;
  showPanConfirmationModal = false;
  panDuplicateStatus: 'idle' | 'checking' | 'available' | 'duplicate' | 'unavailable' = 'idle';
  panDuplicateMessage?: string;
  panDuplicateResult: PanDuplicateCheckResult | null = null;
  selectedPanCompany: PanCompanyRecord | null = null;
  private panCheckTimer: any = null;
  private panCheckReqId = 0;

  selectPanCompany(company: PanCompanyRecord): void {
    this.selectedPanCompany = company;
    this.cdr.markForCheck();
  }

  triggerPanDuplicateCheck(pan: string): void {
    if (this.panCheckTimer) {
      clearTimeout(this.panCheckTimer);
    }
    if (this.mode !== 'new' || !pan) {
      this.panDuplicateStatus = 'idle';
      this.panDuplicateMessage = undefined;
      this.panDuplicateResult = null;
      this.selectedPanCompany = null;
      return;
    }

    const cleanPan = (pan || '').trim().toUpperCase();
    if (!panRe.test(cleanPan)) {
      this.panDuplicateStatus = 'idle';
      this.panDuplicateMessage = undefined;
      this.panDuplicateResult = null;
      this.selectedPanCompany = null;
      return;
    }

    const reqId = ++this.panCheckReqId;
    this.panDuplicateStatus = 'checking';
    this.panDuplicateMessage = undefined;
    this.cdr.markForCheck();

    this.panCheckTimer = setTimeout(() => {
      this.customerService.checkPanDuplicate(cleanPan).subscribe({
        next: (res) => {
          if (this.panCheckReqId !== reqId) return;
          if (res.status === 'DUPLICATE' && res.companies && res.companies.length > 0) {
            this.panDuplicateStatus = 'duplicate';
            this.panDuplicateMessage = res.message;
            this.panDuplicateResult = res;
            this.selectedPanCompany = res.companies[0];
            this.showPanDuplicateModal = true;
          } else if (res.status === 'AVAILABLE') {
            this.panDuplicateStatus = 'available';
            this.panDuplicateMessage = res.message;
            this.panDuplicateResult = null;
            this.selectedPanCompany = null;
          } else {
            this.panDuplicateStatus = 'unavailable';
            this.panDuplicateMessage = res.message;
            this.panDuplicateResult = null;
            this.selectedPanCompany = null;
          }
          this.cdr.markForCheck();
        },
        error: () => {
          if (this.panCheckReqId !== reqId) return;
          this.panDuplicateStatus = 'unavailable';
          this.panDuplicateMessage = 'Duplicate Check Unavailable – Unable to verify this PAN.';
          this.panDuplicateResult = null;
          this.selectedPanCompany = null;
          this.cdr.markForCheck();
        }
      });
    }, 350);
  }

  onPanDuplicateYes(): void {
    this.showPanDuplicateModal = false;
    this.showPanConfirmationModal = true;
    this.cdr.markForCheck();
  }

  onPanDuplicateNo(): void {
    this.showPanDuplicateModal = false;
    this.showPanConfirmationModal = false;
    this.panDuplicateStatus = 'idle';
    this.panDuplicateMessage = undefined;
    this.panDuplicateResult = null;
    this.selectedPanCompany = null;
    this.reset();
    this.cdr.markForCheck();
  }

  onPanConfirmationCancel(): void {
    this.showPanConfirmationModal = false;
    this.cdr.markForCheck();
  }

  onPanAddNewGstin(company?: PanCompanyRecord): void {
    const targetComp = company || this.selectedPanCompany || (this.panDuplicateResult?.companies?.[0]);
    if (!targetComp) return;
    this.showPanConfirmationModal = false;
    this.showPanDuplicateModal = false;
    this.panDuplicateStatus = 'idle';

    const targetType: 'GLOBAL' | 'HANDLING_AGENT' = targetComp.codeType === 'handling_agent' ? 'HANDLING_AGENT' : 'GLOBAL';
    const context = this.createDuplicateUpdateContext({
      source: 'EXISTING_PAN_REDIRECT',
      codeType: targetType,
      companyCode: targetComp.companyCode,
      pan: targetComp.pan || this.form.panNumber,
      intendedOperation: 'ADD_NEW_GSTIN'
    });
    this.persistDuplicateUpdateContext(context);
    this.updateRedirectContext = context;
    this.navigationSource = 'EXISTING_PAN_REDIRECT';

    this.switchMode('old', 'EXISTING_PAN_REDIRECT');
    this.codeType = targetType;
    this.form.customerCode = targetComp.companyCode;
    this.triggerOldLookup(targetComp.companyCode, targetType);

    const checkInterval = setInterval(() => {
      if (!this.lookupLoading) {
        clearInterval(checkInterval);
        const hasEmptyGstin = this.gstins.some(g => !g.gstin || !g.gstin.trim());
        if (!hasEmptyGstin) {
          this.addGstin();
        }
        this.cdr.markForCheck();
      }
    }, 100);
    setTimeout(() => clearInterval(checkInterval), 10000);
  }

  onPanUpdateExistingDetails(company?: PanCompanyRecord): void {
    const targetComp = company || this.selectedPanCompany || (this.panDuplicateResult?.companies?.[0]);
    if (!targetComp) return;
    this.showPanConfirmationModal = false;
    this.showPanDuplicateModal = false;
    this.panDuplicateStatus = 'idle';

    const targetType: 'GLOBAL' | 'HANDLING_AGENT' = targetComp.codeType === 'handling_agent' ? 'HANDLING_AGENT' : 'GLOBAL';
    const context = this.createDuplicateUpdateContext({
      source: 'EXISTING_PAN_REDIRECT',
      codeType: targetType,
      companyCode: targetComp.companyCode,
      pan: targetComp.pan || this.form.panNumber,
      intendedOperation: 'UPDATE_EXISTING_DETAILS'
    });
    this.persistDuplicateUpdateContext(context);
    this.updateRedirectContext = context;
    this.navigationSource = 'EXISTING_PAN_REDIRECT';

    this.switchMode('old', 'EXISTING_PAN_REDIRECT');
    this.codeType = targetType;
    this.form.customerCode = targetComp.companyCode;
    this.triggerOldLookup(targetComp.companyCode, targetType);
  }

  onGstinUpdateExistingRecord(record: GstinDuplicateRecord): void {
    const companyCode = (record.existingCode || '').trim();
    const gstin = normalizeDocumentNumber(record.gstin);
    if (!companyCode || !gstin) {
      this.notice = 'The existing record is missing its code or GSTIN. Please use Update Code to search manually.';
      this.cdr.markForCheck();
      return;
    }

    const targetType: 'GLOBAL' | 'HANDLING_AGENT' = this.isHandlingAgentRecord(record) ? 'HANDLING_AGENT' : 'GLOBAL';
    const context = this.createDuplicateUpdateContext({
      source: 'EXISTING_GSTIN_REDIRECT',
      codeType: targetType,
      companyCode,
      gstin,
      pan: record.pan,
      intendedOperation: 'UPDATE_EXISTING_DETAILS'
    });
    this.persistDuplicateUpdateContext(context);
    this.updateRedirectContext = context;
    this.navigationSource = 'EXISTING_GSTIN_REDIRECT';

    this.showDuplicateModal = false;
    this.selectedDuplicateRecords = [];
    this.switchMode('old', 'EXISTING_GSTIN_REDIRECT');
    this.codeType = targetType;
    this.form.customerCode = context.companyCode;
    this.triggerOldLookup(context.companyCode, context.codeType);
  }

  isMultipleGstin(): boolean {
    return Boolean(this.gstins && this.gstins.length > 1);
  }

  onSelectGstinAddress(newIndex: any): void {
    const idx = typeof newIndex === 'string' ? parseInt(newIndex, 10) : newIndex;
    if (isNaN(idx) || idx < 0 || idx >= this.gstins.length) return;

    if (this.selectedGstinAddressIndex >= 0 && this.gstins[this.selectedGstinAddressIndex]) {
      this.gstins[this.selectedGstinAddressIndex].registeredAddress = this.form.address;
      this.gstins[this.selectedGstinAddressIndex].city = this.form.city;
      this.gstins[this.selectedGstinAddressIndex].pincode = this.form.pincode;
    }
    this.selectedGstinAddressIndex = idx;
    const selected = this.gstins[idx];
    this.form.address = selected?.registeredAddress || '';
    this.form.city = selected?.city || '';
    this.form.pincode = selected?.pincode || '';
    this.cdr.markForCheck();
  }

  handleCityInput(): void {
    if (this.gstins && this.gstins[this.selectedGstinAddressIndex]) {
      this.gstins[this.selectedGstinAddressIndex].city = this.form.city;
    }
  }

  openDuplicateModal(g: GstinEntry): void {
    this.selectedDuplicateRecords = g.duplicateRecords || [];
    this.showDuplicateModal = true;
    this.cdr.markForCheck();
  }

  closeDuplicateModal(): void {
    this.showDuplicateModal = false;
    this.selectedDuplicateRecords = [];
    this.cdr.markForCheck();
  }

  private isHandlingAgentRecord(record: GstinDuplicateRecord): boolean {
    return (record.recordType || '').toLowerCase().replace(/[_-]/g, ' ').includes('handling agent');
  }

  private createDuplicateUpdateContext(
    context: Omit<DuplicateUpdateContext, 'expiresAt'>
  ): DuplicateUpdateContext {
    return {
      ...context,
      companyCode: context.companyCode.trim().toUpperCase(),
      gstin: context.gstin ? normalizeDocumentNumber(context.gstin) : undefined,
      pan: context.pan ? normalizeDocumentNumber(context.pan) : undefined,
      expiresAt: Date.now() + 30 * 60 * 1000
    };
  }

  private persistDuplicateUpdateContext(context: DuplicateUpdateContext): void {
    const serialized = JSON.stringify(context);
    try {
      if (typeof sessionStorage === 'undefined') {
        duplicateUpdateContextFallback = serialized;
      } else {
        sessionStorage.setItem(duplicateUpdateContextKey, serialized);
        duplicateUpdateContextFallback = null;
      }
    } catch (error) {
      console.error('Unable to preserve duplicate-update context:', error);
      duplicateUpdateContextFallback = serialized;
      this.notice = 'Browser storage is unavailable; the detected record will be preserved while this app remains open.';
      this.cdr.markForCheck();
    }
  }

  private readDuplicateUpdateContext(): DuplicateUpdateContext | null {
    let saved: string | null = null;
    try {
      saved = typeof sessionStorage === 'undefined'
        ? duplicateUpdateContextFallback
        : sessionStorage.getItem(duplicateUpdateContextKey) || duplicateUpdateContextFallback;
    } catch (error) {
      console.error('Unable to read duplicate-update context:', error);
      saved = duplicateUpdateContextFallback;
    }

    if (!saved) return null;
    try {
      const context = JSON.parse(saved) as DuplicateUpdateContext;
      if (!context.companyCode || !['GLOBAL', 'HANDLING_AGENT'].includes(context.codeType)
        || !Number.isFinite(context.expiresAt) || context.expiresAt <= Date.now()) {
        this.clearDuplicateUpdateContext();
        return null;
      }
      return context;
    } catch (error) {
      console.error('Unable to parse duplicate-update context:', error);
      this.clearDuplicateUpdateContext();
      return null;
    }
  }

  private clearDuplicateUpdateContext(): void {
    duplicateUpdateContextFallback = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(duplicateUpdateContextKey);
      }
    } catch (error) {
      console.error('Unable to clear duplicate-update context:', error);
    }
  }

  private applyDuplicateUpdateContext(context: DuplicateUpdateContext): void {
    if (context.pan) this.form.panNumber = context.pan;

    if (context.gstin) {
      const index = this.gstins.findIndex(entry =>
        normalizeDocumentNumber(entry.gstin) === context.gstin
      );
      if (index >= 0) {
        this.selectGstinDetail(index);
      } else {
        this.selectedGstinAddressIndex = 0;
        this.selectGstinDetail(0);
        this.notice = `GSTIN ${context.gstin} was not returned for code ${context.companyCode}. Please verify the record before updating.`;
      }
      return;
    }

    const recordsWithGstin = this.gstins
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => Boolean(entry.gstin.trim()));
    if (recordsWithGstin.length === 1) {
      this.selectGstinDetail(recordsWithGstin[0].index);
    } else if (recordsWithGstin.length > 1) {
      this.selectedGstinAddressIndex = -1;
      this.form.address = '';
      this.form.city = '';
      this.form.pincode = '';
    }
  }

  private selectGstinDetail(index: number): void {
    if (this.selectedGstinAddressIndex >= 0 && this.selectedGstinAddressIndex !== index && this.gstins[this.selectedGstinAddressIndex]) {
      this.gstins[this.selectedGstinAddressIndex].registeredAddress = this.form.address;
      this.gstins[this.selectedGstinAddressIndex].city = this.form.city;
      this.gstins[this.selectedGstinAddressIndex].pincode = this.form.pincode;
    }
    this.selectedGstinAddressIndex = index;
    const selected = this.gstins[index];
    this.form.address = selected?.registeredAddress || '';
    this.form.city = selected?.city || '';
    this.form.pincode = selected?.pincode || '';
  }

  triggerGstinDuplicateCheck(index: number, gstin: string): void {
    if (this.duplicateCheckTimers[index]) {
      clearTimeout(this.duplicateCheckTimers[index]);
    }
    const cleanGstin = (gstin || '').trim().toUpperCase();
    if (!this.gstins[index]) return;

    if (!gstinRe.test(cleanGstin)) {
      this.gstins[index].duplicateStatus = 'idle';
      this.gstins[index].duplicateRecords = [];
      this.cdr.markForCheck();
      return;
    }

    const reqId = (this.gstins[index].duplicateCheckReqId || 0) + 1;
    this.gstins[index].duplicateCheckReqId = reqId;
    this.gstins[index].duplicateStatus = 'checking';
    this.cdr.markForCheck();

    this.duplicateCheckTimers[index] = setTimeout(() => {
      const currentCode = this.mode === 'old' ? (this.verifiedCustomerCode || this.form.customerCode) : undefined;
      this.customerService.checkGstinDuplicate(cleanGstin, currentCode).subscribe({
        next: (res) => {
          if (!this.gstins[index] || this.gstins[index].duplicateCheckReqId !== reqId) return;
          if (cleanGstin !== (this.gstins[index].gstin || '').trim().toUpperCase()) return;

          if (res.status === 'DUPLICATE') {
            this.gstins[index].duplicateStatus = 'duplicate';
            this.gstins[index].duplicateMessage = res.message;
            this.gstins[index].duplicateRecords = res.records;
          } else if (res.status === 'AVAILABLE') {
            this.gstins[index].duplicateStatus = 'available';
            this.gstins[index].duplicateMessage = res.message;
            this.gstins[index].duplicateRecords = [];
          } else {
            this.gstins[index].duplicateStatus = 'unavailable';
            this.gstins[index].duplicateMessage = res.message;
            this.gstins[index].duplicateRecords = [];
          }
          this.cdr.markForCheck();
        },
        error: () => {
          if (!this.gstins[index] || this.gstins[index].duplicateCheckReqId !== reqId) return;
          this.gstins[index].duplicateStatus = 'unavailable';
          this.gstins[index].duplicateMessage = 'Duplicate Check Unavailable – Unable to verify this GSTIN.';
          this.gstins[index].duplicateRecords = [];
          this.cdr.markForCheck();
        }
      });
    }, 400);
  }

  get isPanDisabled(): boolean {
    return this.mode === 'old' && this.isOldPanDisabled;
  }

  get isGstDisabled(): boolean {
    return this.mode === 'old' && this.isOldGstDisabled;
  }

  isGstinEntryDisabled(index: number): boolean {
    return this.isGstDisabled && Boolean(this.gstins[index]?.gstinId);
  }

  isGstinRemovalPending(entry: GstinEntry): boolean {
    return this.pendingGstinRemovals.some(removal =>
      removal.gstin === entry.gstin
      && (removal.effectiveFrom || '') === (entry.effectiveFrom || '')
    );
  }

  canRequestGstinRemoval(entry: GstinEntry): boolean {
    if (this.mode !== 'old' || !this.lookupDone || !entry.persistedDetail
      || this.isGstinRemovalPending(entry)) {
      return false;
    }
    const remaining = this.gstins.filter(g =>
      g.persistedDetail && !this.isGstinRemovalPending(g)
    ).length;
    return remaining > 1;
  }

  requestGstinRemoval(entry: GstinEntry): void {
    if (!this.canRequestGstinRemoval(entry)) return;
    const effectiveDate = entry.effectiveFrom
      ? ` (effective from ${entry.effectiveFrom})`
      : '';
    const confirmed = typeof window !== 'undefined' && window.confirm(
      `Submit a DBA-approved request to remove GSTIN ${entry.gstin}${effectiveDate}? `
      + 'The record will remain in the database until the DBA executes the request.'
    );
    if (!confirmed) return;

    this.pendingGstinRemovals = [
      ...this.pendingGstinRemovals,
      { gstin: entry.gstin, effectiveFrom: entry.effectiveFrom || undefined }
    ];
    this.cdr.markForCheck();
  }

  cancelGstinRemoval(entry: GstinEntry): void {
    this.pendingGstinRemovals = this.pendingGstinRemovals.filter(removal =>
      removal.gstin !== entry.gstin
      || (removal.effectiveFrom || '') !== (entry.effectiveFrom || '')
    );
    this.cdr.markForCheck();
  }

  isValueAvailable(val: any): boolean {
    if (val === null || val === undefined) return false;
    const str = String(val).trim();
    return str.length > 0 && str.toLowerCase() !== 'null' && str.toLowerCase() !== 'undefined';
  }

  isGstAvailable(gstVal: any): boolean {
    if (!this.isValueAvailable(gstVal)) return false;
    const cleaned = String(gstVal).replace(/[\[\]"'\s]/g, '');
    const tokens = cleaned.split(',').map(s => s.trim()).filter(s =>
      s.length > 0 && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined' && s.toLowerCase() !== 'none'
    );
    return tokens.length > 0;
  }
  ownershipLogoMissing = false;
  deleteCodeType: DeleteRequestCodeType | '' = '';
  deleteLogoMissing = false;
  deleteCode = '';
  deleteCompanyName = '';
  verifiedDeleteRecord: { codeType: DeleteRequestCodeType; code: string; companyName: string } | null = null;
  deleteRecordDetails: any = null;
  deleteDisableScope: 'GSTIN' | 'CODE' = 'GSTIN';
  deleteAvailableGstins: Array<{
    gstin: string;
    address?: string;
    city?: string;
    pincode?: string;
    state?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    active?: boolean;
  }> = [];
  deleteSelectedGstinMap: Record<string, boolean> = {};
  deleteVerificationMessage = '';
  deleteErrorMessage = '';
  deleteSuccessMessage = '';
  deleteVerifying = false;
  deleteSubmitting = false;
  private deleteLookupRequestId = 0;
  private codeTimer: any = null;
  private codeRequestId = 0;
  private ocrRequestId = 0;
  private semGstinVerifyTimer: any = null;

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
  private activeRequestsSub = new Subscription();
  private divisionSelectionManuallyChanged = false;
  private userDivisionSubscription?: Subscription;
  private zoneDivisionSubscription?: Subscription;
  private routerEventsSubscription?: Subscription;
  private lastRouteUrl = '';

  companyNameManuallyEdited = false;
  panManuallyEdited = false;

  // Expandable GSTIN card state
  gstinCardExpanded = true;

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
    private zoneDivisionService?: ZoneDivisionService
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
    this.lastRouteUrl = this.router?.url ? this.router.url.split('?')[0] : '';
    if (this.lastRouteUrl.endsWith('/delete-request')) {
      this.mode = 'delete';
    }

    this.resetFieldsPreservingZoneDivision();

    this.userDivisionSubscription = this.authService?.currentUser$.subscribe((user) => {
      if (!user) {
        this.divisionSelectionManuallyChanged = false;
        this.form.zone = '';
        this.form.operatingDivision = '';
        this.cdr.markForCheck();
        return;
      }
      this.applyLoginDivisionDefault();
    });

    this.zoneDivisionSubscription = this.zoneDivisionService?.selection$.subscribe((sel) => {
      if (!sel) return;
      if (sel.manuallyChanged) {
        this.form.zone = sel.zone;
        this.form.operatingDivision = sel.division;
        this.divisionSelectionManuallyChanged = true;
        this.cdr.markForCheck();
      } else if (!this.divisionSelectionManuallyChanged) {
        this.form.zone = sel.zone;
        this.form.operatingDivision = sel.division;
        this.cdr.markForCheck();
      }
    });

    if (this.router?.events) {
      this.routerEventsSubscription = this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          const cleanUrl = (event.urlAfterRedirects || event.url || '').split('?')[0];
          if (cleanUrl !== this.lastRouteUrl) {
            this.lastRouteUrl = cleanUrl;
            if (cleanUrl.endsWith('/delete-request')) {
              this.mode = 'delete';
            } else if (this.mode === 'delete') {
              this.mode = 'new';
            }
            this.resetFieldsPreservingZoneDivision();
          }
        });
    }

    const pendingUpdate = this.readDuplicateUpdateContext();
    if (pendingUpdate) {
      this.mode = 'old';
      this.navigationSource = pendingUpdate.source || 'EXISTING_PAN_REDIRECT';
      this.updateRedirectContext = pendingUpdate;
      this.oldCodeType = pendingUpdate.codeType;
      this.form.customerCode = pendingUpdate.companyCode;
      this.triggerOldLookup(pendingUpdate.companyCode, pendingUpdate.codeType);
    }
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

  ngOnDestroy(): void {
    this.cancelPendingAsyncOperations();
    this.resetFormState();
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
    if (
      this.mode !== 'ownership'
      && this.mode !== 'delete'
      && !this.divisionSelectionManuallyChanged
      && selection
    ) {
      this.form.zone = selection.zone;
      this.form.operatingDivision = selection.division;
      this.zoneDivisionService?.setDefaultIfUnset(selection.zone, selection.division);
      this.cdr.markForCheck();
    }
  }

  cancelPendingAsyncOperations(): void {
    this.lookupRequestId++;
    this.codeRequestId++;
    this.ocrRequestId++;
    this.activeRequestsSub.unsubscribe();
    this.activeRequestsSub = new Subscription();
    if (this.lookupTimer) {
      clearTimeout(this.lookupTimer);
      this.lookupTimer = null;
    }
    if (this.codeTimer) {
      clearTimeout(this.codeTimer);
      this.codeTimer = null;
    }
    if (this.ownSection1Timer) {
      clearTimeout(this.ownSection1Timer);
      this.ownSection1Timer = null;
    }
    if (this.ownSection2Timer) {
      clearTimeout(this.ownSection2Timer);
      this.ownSection2Timer = null;
    }
    if (this.semGstinVerifyTimer) {
      clearTimeout(this.semGstinVerifyTimer);
      this.semGstinVerifyTimer = null;
    }
  }

  resetFormState(): void {
    this.notice = '';
    this.loading = false;
    this.panDuplicateStatus = 'idle';
    this.panDuplicateMessage = undefined;
    this.panDuplicateResult = null;
    this.selectedPanCompany = null;
    this.showPanDuplicateModal = false;
    this.showPanConfirmationModal = false;
    this.lookupLoading = false;
    this.lookupDone = false;
    this.lookupError = '';
    this.lastLookupRecord = null;
    this.verifiedCustomerCode = null;
    this.codeConfirmed = false;
    this.codeChecking = false;
    this.errors = {};
    this.touchedFields = {};
    this.form = { ...blank };
    this.gstins = [{ ...blankGstin }];
    this.addressStatus = '';
    this.addressManuallyEdited = false;
    this.companyNameManuallyEdited = false;
    this.panManuallyEdited = false;
    this.ocrAutoFillApplied = false;
    this.removedGstinIds = [];
    this.pendingGstinRemovals = [];
    this.ownershipLogoMissing = false;
    this.deleteLogoMissing = false;
    this.deleteCode = '';
    this.deleteCompanyName = '';
    this.verifiedDeleteRecord = null;
    this.deleteRecordDetails = null;
    this.deleteDisableScope = 'GSTIN';
    this.deleteAvailableGstins = [];
    this.deleteSelectedGstinMap = {};
    this.deleteVerificationMessage = '';
    this.deleteErrorMessage = '';
    this.deleteSuccessMessage = '';
    this.deleteVerifying = false;
    this.deleteSubmitting = false;
    this.deleteCodeType = '';
    this.showReviewModal = false;
    this.reviewSubmitting = false;
    this.reviewData = null;
    this.initialOwnershipDesc = '';
    this.initialPartyDesc = '';
  }

  getGstinPanStatus(gstin: string, pan?: string): string | null {
    const normalizedGstin = normalizeDocumentNumber(gstin);
    const normalizedPan = normalizeDocumentNumber(pan || this.form.panNumber);
    if (!normalizedGstin) return null;
    if (!gstinRe.test(normalizedGstin)) return 'Enter a valid 15-character GSTIN.';
    if (normalizedPan.length !== 10 || !panRe.test(normalizedPan)) return null;
    return normalizedGstin.slice(2, 12) === normalizedPan ? 'GSTIN matches PAN' : 'GSTIN does not match the PAN number.';
  }

  reset(): void {
    this.resetFieldsPreservingZoneDivision();
  }

  private resetFieldsPreservingZoneDivision(): void {
    const shared = this.zoneDivisionService?.currentSelection;
    const currentZone = shared?.zone || this.form.zone || '';
    const currentDivision = shared?.division || this.form.operatingDivision || '';
    const manuallyChanged = shared?.manuallyChanged ?? this.divisionSelectionManuallyChanged;

    this.form = {
      ...blank,
      zone: currentZone,
      operatingDivision: currentDivision
    };
    this.divisionSelectionManuallyChanged = manuallyChanged;

    if (!currentZone && !currentDivision) {
      this.applyLoginDivisionDefault();
    }

    this.verifiedCustomerCode = null;
    this.gstins = [{ ...blankGstin }];
    this.isOldPanDisabled = false;
    this.isOldGstDisabled = false;
    this.errors = {};
    this.touchedFields = {};
    this.notice = '';
    this.loading = false;
    this.lookupDone = false;
    this.lookupLoading = false;
    this.lookupError = '';
    this.lastLookupRecord = null;
    this.codeConfirmed = false;
    this.codeChecking = false;
    if (this.codeTimer) clearTimeout(this.codeTimer);
    if (this.lookupTimer) clearTimeout(this.lookupTimer);
    this.codeType = 'GLOBAL';
    this.addressStatus = '';
    this.addressManuallyEdited = false;
    this.companyNameManuallyEdited = false;
    this.panManuallyEdited = false;
    this.ocrAutoFillApplied = false;
    this.removedGstinIds = [];
    this.pendingGstinRemovals = [];
    this.zoneOpen = false;
    this.zoneSearchTerm = '';
    this.divisionOpen = false;

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
    if (this.ownSection1Timer) clearTimeout(this.ownSection1Timer);
    if (this.ownSection2Timer) clearTimeout(this.ownSection2Timer);

    // Delete request fields
    this.deleteCodeType = '';
    this.deleteLogoMissing = false;
    this.deleteCode = '';
    this.deleteCompanyName = '';
    this.verifiedDeleteRecord = null;
    this.deleteVerificationMessage = '';
    this.deleteErrorMessage = '';
    this.deleteSuccessMessage = '';
    this.deleteVerifying = false;
    this.deleteSubmitting = false;

    this.cdr.markForCheck();
  }

  clearSelectedUploads(): void {
    this.gstins = this.gstins.map(g => ({ ...g, file: null, scanning: false, scanStatus: 'idle', scanError: '', scanProgress: '' }));
    this.cdr.markForCheck();
  }

  switchMode(newMode: 'ownership' | 'old' | 'new' | 'delete', source: UpdateNavigationSource = 'DIRECT_UPDATE'): void {
    if (newMode === this.mode && (newMode !== 'old' || source === this.navigationSource)) {
      return;
    }

    const currentZone = this.form.zone;
    const currentDivision = this.form.operatingDivision;

    this.cancelPendingAsyncOperations();
    this.resetFormState();

    this.mode = newMode;
    this.form.zone = currentZone;
    this.form.operatingDivision = currentDivision;
    this.resetFieldsPreservingZoneDivision();
    this.ownershipLogoMissing = false;
    this.deleteLogoMissing = false;

    if (newMode === 'old') {
      if (source === 'DIRECT_UPDATE') {
        this.clearDuplicateUpdateContext();
        this.navigationSource = 'DIRECT_UPDATE';
        this.updateRedirectContext = null;
        this.form.customerCode = '';
        this.verifiedCustomerCode = null;
        this.lookupDone = false;
      } else {
        this.navigationSource = source;
      }
    } else {
      this.clearDuplicateUpdateContext();
      this.navigationSource = 'DIRECT_UPDATE';
      this.updateRedirectContext = null;
    }

    this.cdr.markForCheck();
  }

  onDeleteCodeTypeChange(event: Event): void {
    this.deleteCodeType = (event.target as HTMLSelectElement).value as DeleteRequestCodeType | '';
    this.deleteLogoMissing = false;
    this.deleteCode = '';
    this.clearDeleteVerification();
  }

  onCurrentLogoError(): void {
    if (this.mode === 'delete') {
      this.deleteLogoMissing = true;
    }
  }

  onDeleteCodeChange(event: Event): void {
    this.deleteCode = (event.target as HTMLInputElement).value.toUpperCase();
    this.clearDeleteVerification();
  }

  onDeleteCompanyNameChange(event: Event): void {
    this.deleteCompanyName = (event.target as HTMLInputElement).value;
  }

  getDeleteGstinList(c: any): string[] {
    const rawGstins = c?.gstinNumbers || c?.gstin;
    if (rawGstins == null || String(rawGstins).trim() === '') {
      return ['-'];
    }
    const clean = String(rawGstins).replace(/[\[\]"\s]/g, '');
    const list = clean.split(',').filter(Boolean);
    return list.length > 0 ? list : ['-'];
  }

  isDeleteCompanyNameMatched(): boolean {
    if (!this.verifiedDeleteRecord) return false;
    const entered = (this.deleteCompanyName || '').trim();
    const fetched = (this.verifiedDeleteRecord.companyName || '').trim();
    return entered.length > 0 && entered === fetched;
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

    this.clearDeleteVerification();
    this.deleteVerifying = true;
    const requestId = ++this.deleteLookupRequestId;

    this.activeRequestsSub.add(
      this.customerService.verifyDeleteRequest(codeType, code).pipe(
        switchMap((result) => {
          if (!result || !result.found) {
            return of({ verifyResult: result, details: null });
          }
          const lookup$ = codeType === 'GLOBAL_CUSTOMER'
            ? (this.customerService.lookupOldCustomerJDBC
                ? this.customerService.lookupOldCustomerJDBC(code).pipe(catchError(() => of(null)))
                : of(null))
            : (this.customerService.lookupHandlingAgentJDBC
                ? this.customerService.lookupHandlingAgentJDBC(code).pipe(catchError(() => of(null)))
                : of(null));

          return lookup$.pipe(
            map((details) => ({ verifyResult: result, details }))
          );
        }),
        finalize(() => {
          if (requestId !== this.deleteLookupRequestId) return;
          this.deleteVerifying = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: ({ verifyResult, details }) => {
          if (requestId !== this.deleteLookupRequestId) return;
          if (!verifyResult || !verifyResult.found) {
            this.deleteVerificationMessage = 'This code is not present in the records, so it cannot be deleted.';
            return;
          }
          const verifiedCode = verifyResult.code || code;
          const verifiedName = details?.companyName || verifyResult.companyName || '';
          this.verifiedDeleteRecord = { codeType, code: verifiedCode, companyName: verifiedName };
          this.deleteRecordDetails = details || {
            customerCode: verifiedCode,
            code: verifiedCode,
            companyName: verifiedName
          };
          this.deleteCode = verifiedCode;

          // Populate GSTIN records with their addresses and effective dates
          let rawGstins: any[] = [];
          if (Array.isArray(verifyResult?.details) && verifyResult.details.length > 0) {
            rawGstins = verifyResult.details;
          } else if (Array.isArray(details?.gstins) && details.gstins.length > 0) {
            rawGstins = details.gstins;
          } else {
            const list = this.getDeleteGstinList(details);
            rawGstins = list.filter(g => g !== '-').map(g => ({
              gstin: g,
              address: details?.address || '',
              city: details?.city || '',
              pincode: details?.pincode || '',
              state: '',
              effectiveFrom: '',
              effectiveTo: null,
              active: true
            }));
          }

          this.deleteAvailableGstins = rawGstins.map(g => ({
            gstin: (g.gstin || g.gstinNumber || '').toUpperCase(),
            address: g.address || g.registeredAddress || details?.address || '',
            city: g.city || details?.city || '',
            pincode: g.pincode || details?.pincode || '',
            state: g.state || (g.gstin?.length >= 2 ? g.gstin.substring(0, 2) : ''),
            effectiveFrom: g.effectiveFrom || '',
            effectiveTo: g.effectiveTo || null,
            active: g.active !== undefined ? g.active : !g.effectiveTo
          }));

          // Default Option A: Pre-select all active GSTINs
          this.deleteSelectedGstinMap = {};
          this.deleteAvailableGstins.forEach(g => {
            if (this.isDeleteGstinActive(g)) {
              this.deleteSelectedGstinMap[g.gstin] = true;
            }
          });

          this.deleteVerificationMessage = 'Code found. Please enter the exact company name shown above to confirm disabling.';
        },
        error: (error) => {
          if (requestId !== this.deleteLookupRequestId) return;
          this.deleteErrorMessage = error?.error?.message
            || 'Unable to verify the code at this time. Please try again later.';
        }
      })
    );
  }

  sendDeleteRequest(): void {
    if (this.deleteSubmitting || this.deleteVerifying) return;
    if (!this.isCurrentDeleteVerification()) {
      this.deleteErrorMessage = 'Verify the current code before sending a disable request.';
      return;
    }
    if (!this.deleteCompanyName.trim()) {
      this.deleteErrorMessage = 'Please enter the company name to confirm the request.';
      return;
    }
    if (!this.isDeleteCompanyNameMatched()) {
      this.deleteErrorMessage = 'Company name does not match the selected code. Please verify the company name.';
      return;
    }
    if (this.deleteDisableScope === 'GSTIN' && this.deleteAvailableGstins.length > 0 && this.getSelectedDeleteGstins().length === 0) {
      this.deleteErrorMessage = 'Please select at least one GSTIN to disable.';
      return;
    }

    this.deleteErrorMessage = '';
    this.deleteSuccessMessage = '';

    const codeTypeName = this.verifiedDeleteRecord!.codeType === 'GLOBAL_CUSTOMER' ? 'Global Customer Code' : 'Handling Agent Code';
    const selectedGstins = this.getSelectedDeleteGstins();
    const gstinsForReview = this.deleteDisableScope === 'GSTIN'
      ? this.deleteAvailableGstins.filter(g => selectedGstins.includes(g.gstin))
      : this.deleteAvailableGstins.filter(g => this.isDeleteGstinActive(g));

    this.reviewData = {
      operationType: 'DELETE_REQUEST',
      title: 'Review Disable Request',
      sectionName: `${codeTypeName} – Disable Request`,
      codeType: this.verifiedDeleteRecord!.codeType,
      customerCode: this.verifiedDeleteRecord!.code,
      companyName: this.deleteCompanyName.trim(),
      disableScope: this.deleteDisableScope,
      deleteWarning: this.deleteDisableScope === 'GSTIN'
        ? 'Only the selected GSTIN(s) will be disabled. Other GSTINs and the company code will remain active.'
        : 'All selected records associated with this company code will be marked inactive. Historical records will be preserved.',
      deleteDetails: [
        { label: 'Record Type', value: codeTypeName },
        { label: 'Company Code', value: this.verifiedDeleteRecord!.code },
        { label: 'Company Name', value: this.deleteCompanyName.trim() },
        { label: 'PAN Number', value: this.deleteRecordDetails?.panNumber || '—' },
        { label: 'Registered Address', value: this.deleteRecordDetails?.address || '—' },
        { label: 'City', value: this.deleteRecordDetails?.city || '—' },
        { label: 'PIN Code', value: this.deleteRecordDetails?.pincode || this.deleteRecordDetails?.pcoCode || '—' },
        { label: 'Zone / Division', value: [this.deleteRecordDetails?.zone, this.deleteRecordDetails?.operatingDivision].filter(Boolean).join(' / ') || '—' }
      ],
      deleteGstins: gstinsForReview.map(g => ({
        gstin: g.gstin,
        state: g.state,
        address: g.address,
        city: g.city,
        pincode: g.pincode,
        effectiveFrom: g.effectiveFrom || '—',
        effectiveTo: g.effectiveTo || null,
        newEffectiveTo: 'Current Date (SYSDATE)'
      }))
    };
    this.showReviewModal = true;
    this.cdr.markForCheck();
  }

  executeDeleteRequest(): void {
    if (this.deleteSubmitting) return;
    this.deleteSubmitting = true;
    this.reviewSubmitting = true;
    this.cdr.markForCheck();

    const selectedGstins = this.deleteDisableScope === 'GSTIN' ? this.getSelectedDeleteGstins() : [];
    const request$ = (this.deleteDisableScope === 'CODE' || selectedGstins.length > 0)
      ? this.customerService.submitDeleteRequest(
          this.verifiedDeleteRecord!.codeType,
          this.verifiedDeleteRecord!.code,
          this.deleteCompanyName.trim(),
          this.deleteDisableScope,
          selectedGstins
        )
      : this.customerService.submitDeleteRequest(
          this.verifiedDeleteRecord!.codeType,
          this.verifiedDeleteRecord!.code,
          this.deleteCompanyName.trim()
        );

    this.activeRequestsSub.add(
      request$.pipe(
        finalize(() => {
          this.deleteSubmitting = false;
          this.reviewSubmitting = false;
          this.showReviewModal = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (result) => {
          this.deleteSuccessMessage = result?.message || 'Disable request sent successfully. The SQL has been sent to the DBA for execution.';
          this.verifiedDeleteRecord = null;
          this.deleteRecordDetails = null;
          this.deleteAvailableGstins = [];
          this.deleteSelectedGstinMap = {};
          this.deleteCompanyName = '';
          this.deleteVerificationMessage = '';
          this.notificationService.success('Disable Request Submitted', this.deleteSuccessMessage);
        },
        error: (error) => {
          this.deleteErrorMessage = error?.error?.message || 'Unable to send the disable request. Please try again later.';
          this.notificationService.error('Disable Request Failed', this.deleteErrorMessage);
        }
      })
    );
  }

  isDeleteGstinActive(g: any): boolean {
    return !g?.effectiveTo && g?.active !== false;
  }

  toggleDeleteGstinSelection(gstin: string): void {
    this.deleteSelectedGstinMap[gstin] = !this.deleteSelectedGstinMap[gstin];
  }

  selectAllDeleteGstins(): void {
    this.deleteAvailableGstins.forEach(g => {
      if (this.isDeleteGstinActive(g)) {
        this.deleteSelectedGstinMap[g.gstin] = true;
      }
    });
  }

  deselectAllDeleteGstins(): void {
    this.deleteAvailableGstins.forEach(g => {
      this.deleteSelectedGstinMap[g.gstin] = false;
    });
  }

  getSelectedDeleteGstins(): string[] {
    return Object.keys(this.deleteSelectedGstinMap).filter(k => !!this.deleteSelectedGstinMap[k]);
  }

  private isCurrentDeleteVerification(): boolean {
    return !!this.verifiedDeleteRecord
      && this.deleteCodeType === this.verifiedDeleteRecord.codeType
      && this.deleteCode.trim() === this.verifiedDeleteRecord.code;
  }

  private clearDeleteVerification(): void {
    this.deleteLookupRequestId++;
    this.verifiedDeleteRecord = null;
    this.deleteRecordDetails = null;
    this.deleteDisableScope = 'GSTIN';
    this.deleteAvailableGstins = [];
    this.deleteSelectedGstinMap = {};
    this.deleteCompanyName = '';
    this.deleteVerificationMessage = '';
    this.deleteErrorMessage = '';
    this.deleteSuccessMessage = '';
  }

  /* ===== Ownership Section 1: Ownership Code lookup ===== */
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
    this.gstins = [{ ...blankGstin }];
    this.ownSection1Found = null;
    this.ownSection1Duplicate = false;
    this.ownSection1LookupError = '';
    this.ownSection1Source = null;
    delete this.errors['ownershipCode'];
    delete this.errors['ownershipPartyCode'];
    const reqId = ++this.ownSection1ReqId;
    if (this.ownSection1Timer) clearTimeout(this.ownSection1Timer);

    if (/^[A-Z0-9]+$/.test(upperCode.trim())) {
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
                this.initialOwnershipDesc = resp.data.ownershipDesc || '';
                this.form.ownershipPartyAddress = this.form.ownershipAddress;
                this.form.address = (resp.data.address || '').replace(/,\s+/g, ',').trim();
                this.form.panNumber = (resp.data.panNumber || '').toUpperCase();
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
        this.activeRequestsSub.add(
          this.customerService.lookupOwnershipPartyJDBC(trimmed).pipe(timeout(15000)).subscribe({
            next: (resp) => {
              if (reqId !== this.ownSection2ReqId) return;
              if (resp && resp.found && resp.data) {
                if (resp.data.recordSource === 'EXISTING_OWNERSHIP_RECORD'
                  || resp.data.recordSource === 'NEW_RECORD_FROM_GLOBAL_CUSTOMER') {
                  this.form.ownershipPartyAddress = resp.data.partyDesc || '';
                  this.initialPartyDesc = resp.data.partyDesc || '';
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
    code = (code || '').toUpperCase();
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
    this.pendingGstinRemovals = [];
    this.selectedGstinAddressIndex = 0;
    this.isOldPanDisabled = false;
    this.isOldGstDisabled = false;
    this.lookupDone = false;
    this.lookupError = '';
    this.addressStatus = '';

    const requestId = ++this.lookupRequestId;
    if (this.lookupTimer) clearTimeout(this.lookupTimer);

    if (/^[A-Z0-9]+$/.test(code.trim())) {
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
              const storedCode = customer.customerCode || customer.code || code.trim();
              this.verifiedCustomerCode = String(storedCode).trim();
              this.form.customerCode = this.verifiedCustomerCode;
              this.form.address = customer.address || '';
              this.form.city = customer.city || '';
              this.form.pincode = customer.pincode || customer.pcoCode || '';
              this.form.email = customer.email || customer.emailId || '';
              this.form.mobile = customer.mobile || customer.phoneNumber || '';
              this.applyOldRecordDivision(customer);

              const panAvailable = this.isValueAvailable(customer.panNumber);
              const gstAvailable = this.isGstAvailable(customer.gstinNumbers)
                || (Array.isArray(customer.gstins) && customer.gstins.length > 0);

              this.isOldPanDisabled = panAvailable;
              this.isOldGstDisabled = gstAvailable;

              if (panAvailable) {
                this.form.panNumber = customer.panNumber.trim().toUpperCase();
              } else {
                this.form.panNumber = '';
              }

              if (gstAvailable) {
                const responseGstins = Array.isArray(customer.gstins) ? customer.gstins : [];
                const loadedGstins: GstinEntry[] = responseGstins.length > 0
                  ? responseGstins
                    .filter((entry: any) => entry && (entry.gstin || entry.gstinNumber))
                    .map((entry: any, idx: number) => {
                      const gstin = String(entry.gstin || entry.gstinNumber).replace(/\s/g, '').toUpperCase();
                      return {
                        ...blankGstin,
                        gstinId: entry.gstinId ?? `old-${idx}`,
                        gstin,
                        effectiveFrom: entry.effectiveFrom || '',
                        effectiveTo: entry.effectiveTo || '',
                        implementationDate: entry.implementationDate || '',
                        persistedDetail: true,
                        state: entry.state || getStateNameFromGstinCode(gstin.slice(0, 2)) || '',
                        registeredAddress: entry.registeredAddress ?? entry.address ?? '',
                        city: entry.city || '',
                        pincode: entry.pincode || ''
                      };
                    })
                  : (customer.gstinNumbers || '')
                    .replace(/[\[\]"'\s]/g, '')
                    .split(',')
                    .map((g: string) => g.trim())
                    .filter((g: string) => Boolean(g) && g.toLowerCase() !== 'null' && g.toLowerCase() !== 'undefined')
                    .map((g: string, idx: number) => ({
                      ...blankGstin,
                      gstinId: `old-${idx}`,
                      gstin: g.toUpperCase(),
                      persistedDetail: true,
                      state: getStateNameFromGstinCode(g.slice(0, 2)) || '',
                      registeredAddress: idx === 0 ? this.form.address : ''
                    }));
                this.gstins = loadedGstins.length > 0
                  ? loadedGstins
                  : [{ ...blankGstin, persistedDetail: true, registeredAddress: this.form.address }];
                this.selectedGstinAddressIndex = 0;
                if (responseGstins.length > 0) {
                  this.form.address = this.gstins[0].registeredAddress || customer.address || '';
                  this.form.city = this.gstins[0].city || customer.city || '';
                  this.form.pincode = this.gstins[0].pincode || customer.pincode || customer.pcoCode || '';
                } else {
                  this.form.address = this.gstins[0].registeredAddress || this.form.address;
                }
                if (this.gstins[0] && !this.gstins[0].registeredAddress && this.form.address) {
                  this.gstins[0].registeredAddress = this.form.address;
                }
              } else {
                this.gstins = [{ ...blankGstin, persistedDetail: false, registeredAddress: this.form.address }];
              }

              const duplicateContext = this.readDuplicateUpdateContext();
              if (duplicateContext
                && duplicateContext.codeType === type
                && duplicateContext.companyCode === this.verifiedCustomerCode) {
                this.navigationSource = duplicateContext.source;
                this.updateRedirectContext = duplicateContext;
                this.applyDuplicateUpdateContext(duplicateContext);
              }

              this.removedGstinIds = [];
              this.pendingGstinRemovals = [];
              this.lookupDone = true;
              this.lookupError = '';
              this.cdr.markForCheck();
            },
            error: (err: any) => {
              if (requestId !== this.lookupRequestId) return;
              const duplicateContext = this.readDuplicateUpdateContext();
              if (duplicateContext?.codeType === type
                && duplicateContext.companyCode === code.trim().toUpperCase()) {
                this.clearDuplicateUpdateContext();
                this.navigationSource = 'DIRECT_UPDATE';
                this.updateRedirectContext = null;
              }
              this.verifiedCustomerCode = null;
              console.error('Lookup error:', err);
              this.lookupDone = false;
              this.lookupError = err?.name === 'TimeoutError'
                ? 'Customer lookup timed out. Please try again.'
                : err?.error?.message || err?.message || 'Error occurred while fetching customer data';
              this.gstins = [{ ...blankGstin }];
              this.isOldPanDisabled = false;
              this.isOldGstDisabled = false;
              this.cdr.markForCheck();
            }
          })
        );
      }, 800);
    } else {
      this.lookupLoading = false;
      this.verifiedCustomerCode = null;
      this.lookupDone = false;
      this.gstins = [{ ...blankGstin }];
      this.isOldPanDisabled = false;
      this.isOldGstDisabled = false;
    }
  }

  handleOldCodeChange(code: string): void {
    if (this.isCompanyCodeReadOnly) {
      if (this.updateRedirectContext?.companyCode) {
        this.form.customerCode = this.updateRedirectContext.companyCode;
      }
      return;
    }
    this.triggerOldLookup(code, this.codeType);
  }

  onCustomerCodeKeydown(event: KeyboardEvent): void {
    if (this.isCompanyCodeReadOnly) {
      event.preventDefault();
    }
  }

  onCustomerCodePaste(event: ClipboardEvent): void {
    if (this.isCompanyCodeReadOnly) {
      event.preventDefault();
    }
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
    if (this.isCompanyCodeReadOnly) {
      return;
    }
    if (newType === this.oldCodeType) {
      return;
    }
    this.cancelPendingAsyncOperations();
    this.oldCodeType = newType;
    this.form = { ...blank };
    this.gstins = [{ ...blankGstin }];
    this.isOldPanDisabled = false;
    this.isOldGstDisabled = false;
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
    this.touchedFields['companyName'] = true;
    this.codeConfirmed = false;
    this.lookupError = '';
    delete this.errors['customerCode'];
    if (this.codeTimer) clearTimeout(this.codeTimer);
    this.verifyAllEligibleGstins();

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

  validate(): boolean {
    const e: Record<string, string> = {};
    if (this.mode === 'ownership') {
      if (!this.form.ownershipCode?.trim()) e['ownershipCode'] = 'Ownership Code is required';
      else if (!/^[A-Z0-9]+$/.test(this.form.ownershipCode.trim())) e['ownershipCode'] = 'Enter a valid Global Customer Code.';
      else if (this.ownSection1Source === 'INVALID_CODE' || this.ownSection1Source === 'LOOKUP_ERROR') e['ownershipCode'] = this.ownSection1LookupError;
      else if (this.ownSection1Loading || !this.ownSection1Source) e['ownershipCode'] = 'Wait for ownership code lookup to complete.';
      else if (this.ownSection2Source === 'INVALID_CODE' || this.ownSection2Source === 'LOOKUP_ERROR') e['ownershipCode'] = this.ownSection2LookupError;
      else if (this.ownSection2Loading || !this.ownSection2Source) e['ownershipCode'] = 'Wait for both ownership table lookups to complete.';
      if (!this.form.ownershipAddress?.trim()) e['ownershipAddress'] = 'Company Name is required';
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
      if (!/^[A-Z0-9]+$/i.test(code)) {
        e['customerCode'] = 'Enter a valid Customer Code.';
      } else if (this.lookupError) {
        e['customerCode'] = this.lookupError;
      } else if (!this.lookupDone) {
        e['customerCode'] = 'Wait for the customer code lookup to complete.';
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

      if (g.duplicateStatus === 'duplicate') {
        e[`gstin_${i}_gstin`] = 'Duplicate GSTIN Found – This GSTIN is already registered in the database.';
      } else if (g.duplicateStatus === 'checking') {
        e[`gstin_${i}_gstin`] = 'Please wait – verifying GSTIN duplicate status.';
      } else if (g.duplicateStatus === 'unavailable') {
        e[`gstin_${i}_gstin`] = 'Duplicate Check Unavailable – Unable to verify this GSTIN.';
      }

      if (this.mode === 'old' || this.isMultipleGstin() || this.mode === 'new') {
        const addr = (g.registeredAddress || ((this.mode === 'old' || i === 0) ? this.form.address : '') || '').trim();
        const isAddrRequired = this.mode !== 'old' || g.persistedDetail || Boolean(g.gstin);
        if (isAddrRequired) {
          if (!addr) {
            e[`gstin_${i}_address`] = `Registered address is required for ${g.gstin || 'GSTIN ' + (i + 1)}.`;
            if (!e['address'] && (i === 0 || i === this.selectedGstinAddressIndex)) {
              e['address'] = `Registered address is required for ${g.gstin || 'GSTIN ' + (i + 1)}.`;
            }
          } else if (this.getNormalizedAddress(addr).length > 100) {
            e[`gstin_${i}_address`] = `Address for ${g.gstin || 'GSTIN ' + (i + 1)} cannot exceed 100 characters.`;
          }
        }
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

  get isFormValid(): boolean {
    if (this.mode === 'ownership') {
      const code1 = (this.form.ownershipCode || '').trim().toUpperCase();
      if (!/^[A-Z0-9]+$/.test(code1)) return false;
      if (this.ownSection1Loading || !this.ownSection1Source || this.ownSection1Source === 'INVALID_CODE' || this.ownSection1Source === 'LOOKUP_ERROR') return false;

      const addr1 = (this.form.ownershipAddress || '').trim();
      if (!addr1) return false;

      const code2 = (this.form.ownershipPartyCode || '').trim().toUpperCase();
      if (code2 !== code1) return false;
      if (this.ownSection2Loading || !this.ownSection2Source || this.ownSection2Source === 'INVALID_CODE' || this.ownSection2Source === 'LOOKUP_ERROR') return false;

      return true;
    }

    if (this.mode === 'new') {
      if (this.panDuplicateStatus === 'duplicate') {
        return false;
      }
      const name = (this.form.companyName || '').trim();
      if (!name || name.length > 40) return false;

      const code = (this.form.customerCode || '').trim().toUpperCase();
      if (!code || this.codeChecking || !/^[A-Z]{4}$/.test(code)) return false;

      const pan = normalizeDocumentNumber(this.form.panNumber);
      if (!pan || !panRe.test(pan)) return false;

      const zone = (this.form.zone || '').trim();
      if (!zone) return false;

      const div = (this.form.operatingDivision || '').trim();
      if (!div) return false;

      const addr = (this.form.address || '').trim();
      if (!addr || addr.length > 100) return false;

      const pin = (this.form.pincode || '').trim();
      if (pin && !/^[1-9][0-9]{5}$/.test(pin)) return false;

      const email = (this.form.email || '').trim();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return false;

      const mobile = (this.form.mobile || '').trim();
      if (mobile && !mobileRe.test(mobile)) return false;

      if (!this.gstins || this.gstins.length === 0) return false;

      const stateSet = new Set<string>();
      const gstinSet = new Set<string>();
      for (const [i, g] of this.gstins.entries()) {
        if (g.duplicateStatus === 'duplicate' || g.duplicateStatus === 'checking' || g.duplicateStatus === 'unavailable') return false;
        const gstinAddr = (g.registeredAddress || (i === 0 ? this.form.address : '') || '').trim();
        if (!gstinAddr || gstinAddr.length > 100) return false;
        if (!g.state?.trim()) return false;
        if (stateSet.has(g.state.trim())) return false;
        stateSet.add(g.state.trim());

        const gstin = normalizeDocumentNumber(g.gstin);
        if (!gstin || !gstinRe.test(gstin) || gstin.length !== 15) return false;
        if (gstin.slice(2, 12) !== pan) return false;
        if (gstinSet.has(gstin)) return false;
        gstinSet.add(gstin);

        if (!g.file && !g.existingFileName) return false;
        if (g.file && this.checkFile(g.file)) return false;
      }

      return true;
    }

    if (this.mode === 'old') {
      const code = (this.form.customerCode || '').trim().toUpperCase();
      if (!/^[A-Z0-9]+$/.test(code)) return false;
      if (this.lookupLoading || !!this.lookupError) return false;
      if (!this.lookupDone || !this.verifiedCustomerCode || this.verifiedCustomerCode.toUpperCase() !== code) return false;

      const name = (this.form.companyName || '').trim();
      if (!name || name.length > 40) return false;

      const pan = normalizeDocumentNumber(this.form.panNumber);
      if (!pan || !panRe.test(pan)) return false;

      const addr = (this.form.address || '').trim();
      if (!addr || addr.length > 100) return false;

      const pin = (this.form.pincode || '').trim();
      if (pin && !/^[1-9][0-9]{5}$/.test(pin)) return false;

      const email = (this.form.email || '').trim();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return false;

      const mobile = (this.form.mobile || '').trim();
      if (mobile && !mobileRe.test(mobile)) return false;

      const stateSet = new Set<string>();
      const gstinSet = new Set<string>();
      for (const [i, g] of this.gstins.entries()) {
        if (this.gstins.length === 1 && !g.gstin?.trim() && !g.file && !g.state) {
          continue;
        }
        if (g.duplicateStatus === 'duplicate' || g.duplicateStatus === 'checking' || g.duplicateStatus === 'unavailable') return false;
        const gstinAddr = (g.registeredAddress || (i === this.selectedGstinAddressIndex ? this.form.address : '') || this.form.address || '').trim();
        if (!gstinAddr || gstinAddr.length > 100) return false;
        const gstin = normalizeDocumentNumber(g.gstin);
        if (!gstin || !gstinRe.test(gstin) || gstin.length !== 15) return false;
        if (gstin.slice(2, 12) !== pan) return false;
        if (gstinSet.has(gstin)) return false;
        gstinSet.add(gstin);

        if (g.state) {
          if (stateSet.has(g.state)) return false;
          stateSet.add(g.state);
        }
        if (g.file && (g.scanning || this.checkFile(g.file))) return false;
      }

      return true;
    }

    if (this.mode === 'delete') {
      return Boolean(this.deleteCodeType && this.deleteCode.trim());
    }

    return false;
  }

  markAllTouched(): void {
    const fields = [
      'companyName',
      'customerCode',
      'panNumber',
      'address',
      'pincode',
      'zone',
      'operatingDivision',
      'ownershipCode',
      'ownershipAddress',
      'ownershipPartyCode',
      'ownershipPartyAddress'
    ];
    fields.forEach(f => this.touchedFields[f] = true);
    this.gstins.forEach((_, i) => {
      this.touchedFields[`gstin_${i}_gstin`] = true;
      this.touchedFields[`gstin_${i}_state`] = true;
      this.touchedFields[`gstin_${i}_file`] = true;
    });
  }

  onFieldBlur(field: string): void {
    this.touchedFields[field] = true;
    this.validateField(field);
    this.cdr.markForCheck();
  }

  validateField(field: string): void {
    if (!this.touchedFields[field]) return;

    if (field === 'companyName') {
      const name = (this.form.companyName || '').trim();
      if (!name) {
        this.errors['companyName'] = 'This field is required';
      } else if (name.length > 40) {
        this.errors['companyName'] = 'Company name cannot exceed 40 characters.';
      } else {
        delete this.errors['companyName'];
      }
    } else if (field === 'panNumber') {
      const pan = normalizeDocumentNumber(this.form.panNumber);
      if (!pan) {
        this.errors['panNumber'] = 'This field is required';
      } else if (!panRe.test(pan)) {
        this.errors['panNumber'] = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';
      } else {
        delete this.errors['panNumber'];
      }
    } else if (field === 'address') {
      const addr = (this.form.address || '').trim();
      if (!addr) {
        this.errors['address'] = 'This field is required';
      } else if (addr.length > 100) {
        this.errors['address'] = 'Address cannot exceed 100 characters.';
      } else {
        delete this.errors['address'];
      }
    } else if (field === 'pincode') {
      const pin = (this.form.pincode || '').trim();
      if (pin && !/^[1-9][0-9]{5}$/.test(pin)) {
        this.errors['pincode'] = 'Invalid pincode';
      } else {
        delete this.errors['pincode'];
      }
    } else if (field === 'zone') {
      if (!this.form.zone?.trim()) {
        this.errors['zone'] = 'This field is required';
      } else {
        delete this.errors['zone'];
      }
    } else if (field === 'operatingDivision') {
      if (!this.form.operatingDivision?.trim()) {
        this.errors['operatingDivision'] = 'This field is required';
      } else {
        delete this.errors['operatingDivision'];
      }
    } else if (field === 'ownershipCode') {
      const code = (this.form.ownershipCode || '').trim();
      if (!code) {
        this.errors['ownershipCode'] = 'Ownership Code is required';
      } else if (!/^[A-Z0-9]+$/.test(code)) {
        this.errors['ownershipCode'] = 'Enter a valid Global Customer Code.';
      } else if (this.ownSection1Source === 'INVALID_CODE' || this.ownSection1Source === 'LOOKUP_ERROR') {
        this.errors['ownershipCode'] = this.ownSection1LookupError;
      } else if (this.ownSection1Loading || !this.ownSection1Source) {
        this.errors['ownershipCode'] = 'Wait for ownership code lookup to complete.';
      } else if (this.ownSection2Source === 'INVALID_CODE' || this.ownSection2Source === 'LOOKUP_ERROR') {
        this.errors['ownershipCode'] = this.ownSection2LookupError;
      } else if (this.ownSection2Loading || !this.ownSection2Source) {
        this.errors['ownershipCode'] = 'Wait for both ownership table lookups to complete.';
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
    }
  }

  handleCompanyNameInput(name: string): void {
    this.form.companyName = name;
    this.touchedFields['companyName'] = true;
    this.validateField('companyName');
    this.cdr.markForCheck();
  }

  handlePincodeChange(pin: string): void {
    this.form.pincode = (pin || '').trim();
    if (this.gstins && this.gstins[this.selectedGstinAddressIndex]) {
      this.gstins[this.selectedGstinAddressIndex].pincode = this.form.pincode;
    }
    this.touchedFields['pincode'] = true;
    this.validateField('pincode');
    this.cdr.markForCheck();
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
      .map((g) => ({ gstin: g.gstin.trim().toUpperCase(), state: g.state }));

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
      if (this.isCurrentDeleteVerification() && this.deleteCompanyName.trim() && this.isDeleteCompanyNameMatched()) {
        this.sendDeleteRequest();
      } else {
        this.verifyDeleteCode();
      }
      return;
    }
    if (this.loading || this.reviewSubmitting) {
      return;
    }
    if (this.gstins && this.gstins[this.selectedGstinAddressIndex]) {
      this.gstins[this.selectedGstinAddressIndex].registeredAddress = this.form.address;
      this.gstins[this.selectedGstinAddressIndex].city = this.form.city;
      this.gstins[this.selectedGstinAddressIndex].pincode = this.form.pincode;
    }
    if (this.mode !== 'old' && this.gstins && this.gstins.length > 0 && this.gstins[0].registeredAddress) {
      this.form.address = this.gstins[0].registeredAddress;
    }
    this.notice = '';
    this.markAllTouched();

    if (!this.isFormValid || !this.validate()) {
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

    if (this.mode === 'ownership') {
      const isSection1New = this.ownSection1Source === 'NEW_RECORD_FROM_GLOBAL_CUSTOMER';
      const isSection2New = this.ownSection2Source === 'NEW_RECORD_FROM_GLOBAL_CUSTOMER';
      const code1 = (this.form.ownershipCode || '').trim().toUpperCase();
      const addr1 = (this.form.ownershipAddress || '').trim();
      const code2 = (this.form.ownershipPartyCode || '').trim().toUpperCase();
      const addr2 = (this.form.ownershipPartyAddress || '').trim();

      this.reviewData = {
        operationType: (isSection1New && isSection2New) ? 'OWNERSHIP_NEW' : 'OWNERSHIP_UPDATE',
        title: (isSection1New && isSection2New) ? 'Review Ownership New Entry' : 'Review Ownership Update',
        sectionName: 'Ownership Code',
        codeType: 'OWNERSHIP',
        customerCode: code1,
        companyName: addr1,
        ownershipSection1: {
          title: 'Section 1: Global Customer Ownership (MEMGLBLCUST_OWN)',
          operation: isSection1New ? 'NEW' : 'UPDATE',
          code: code1,
          address: addr1,
          existingAddress: !isSection1New ? (this.initialOwnershipDesc || this.lastLookupRecord?.ownershipDesc) : undefined,
          newAddress: addr1,
          table: 'MEMGLBLCUST_OWN'
        },
        ownershipSection2: {
          title: 'Section 2: Ownership Party (MEMGLBLCUST_OWN_PARTY)',
          operation: isSection2New ? 'NEW' : 'UPDATE',
          partyCode: code2,
          partyAddress: addr2,
          code: code2,
          address: addr2,
          existingAddress: !isSection2New ? (this.initialPartyDesc || this.lastLookupRecord?.partyDesc) : undefined,
          newAddress: addr2,
          table: 'MEMGLBLCUST_OWN_PARTY'
        }
      };
      this.showReviewModal = true;
      this.cdr.markForCheck();
    } else if (this.mode === 'new') {
      const isGlobal = this.codeType === 'GLOBAL';
      const gstinList: ReviewGstinItem[] = this.gstins.map((g, idx) => ({
        gstin: g.gstin.toUpperCase(),
        state: g.state || '',
        address: g.registeredAddress || (idx === 0 ? this.form.address : ''),
        city: g.city || (idx === 0 ? this.form.city : ''),
        pincode: g.pincode || (idx === 0 ? this.form.pincode : '')
      }));

      this.reviewData = {
        operationType: 'NEW_ENTRY',
        title: 'Review New Entry',
        sectionName: isGlobal ? 'Global Customer Code – New Entry' : 'Handling Agent Code – New Entry',
        codeType: this.codeType,
        customerCode: this.form.customerCode.toUpperCase(),
        companyName: this.form.companyName.trim(),
        panNumber: this.form.panNumber.toUpperCase(),
        recordDetails: [
          { label: 'Record Type', value: isGlobal ? 'Global Customer Code' : 'Handling Agent Code' },
          { label: 'Company Name', value: this.form.companyName.trim() },
          { label: 'Generated Code', value: this.form.customerCode.toUpperCase() },
          { label: 'PAN Number', value: this.form.panNumber.toUpperCase() },
          { label: 'Primary Address', value: this.form.address.trim() },
          { label: 'City', value: this.form.city.trim() },
          { label: 'PIN Code', value: (this.form.pincode || '').trim() },
          { label: 'State', value: gstinList[0]?.state || '—' },
          { label: 'Railway Zone', value: (this.form.zone || '').trim() },
          { label: 'Operating Division', value: (this.form.operatingDivision || '').trim() },
          { label: 'Email', value: this.form.email ? this.form.email.trim() : '—' },
          { label: 'Mobile', value: this.form.mobile ? this.form.mobile.trim() : '—' }
        ],
        gstinList
      };
      this.showReviewModal = true;
      this.cdr.markForCheck();
    } else {
      const isGlobal = this.codeType === 'GLOBAL';
      const fieldChanges: FieldComparison[] = [];
      const checkField = (label: string, oldVal: any, newVal: any) => {
        const o = (oldVal ?? '').toString().trim();
        const n = (newVal ?? '').toString().trim();
        if (o !== n && (o || n)) {
          fieldChanges.push({ field: label, existingValue: o || '—', newValue: n || '—' });
        }
      };
      checkField('Company Name', this.lastLookupRecord?.companyName, this.form.companyName);
      checkField('PAN Number', this.lastLookupRecord?.panNumber, this.form.panNumber);
      checkField('Primary Address', this.lastLookupRecord?.address, this.form.address);
      checkField('City', this.lastLookupRecord?.city, this.form.city);
      checkField('PIN Code', this.lastLookupRecord?.pincode || this.lastLookupRecord?.pcoCode, this.form.pincode);
      if (this.divisionSelectionManuallyChanged) {
        checkField('Railway Zone', this.lastLookupRecord?.zone, this.form.zone);
        checkField('Operating Division', this.lastLookupRecord?.operatingDivision, this.form.operatingDivision);
      }
      checkField('Email', this.lastLookupRecord?.email || this.lastLookupRecord?.emailId, this.form.email);
      checkField('Mobile', this.lastLookupRecord?.mobile || this.lastLookupRecord?.phoneNumber, this.form.mobile);

      const addedGstins: ReviewGstinItem[] = [];
      const updatedGstinAddresses: ReviewGstinAddressUpdate[] = [];

      const existingGstinMap = new Map<string, any>();
      if (Array.isArray(this.lastLookupRecord?.gstins)) {
        for (const row of this.lastLookupRecord.gstins) {
          const gNum = String(row.gstin || row.gstinNumber || '').trim().toUpperCase();
          if (gNum) existingGstinMap.set(gNum, row);
        }
      }

      for (const g of this.gstins) {
        const gNum = String(g.gstin || '').trim().toUpperCase();
        if (!gNum) continue;
        const existing = existingGstinMap.get(gNum);
        if (!existing && !g.persistedDetail && !String(g.gstinId || '').startsWith('old-')) {
          addedGstins.push({
            gstin: gNum,
            state: g.state || '',
            address: g.registeredAddress || '—',
            city: g.city || '—',
            pincode: g.pincode || '—'
          });
        } else if (existing) {
          const oldAddr = (existing.registeredAddress ?? existing.address ?? '').trim();
          const newAddr = (g.registeredAddress ?? '').trim();
          if (newAddr && oldAddr !== newAddr) {
            updatedGstinAddresses.push({
              gstin: gNum,
              field: 'Registered Address',
              existingValue: oldAddr || '—',
              newValue: newAddr
            });
          }
        }
      }

      const removedGstins: ReviewGstinItem[] = (this.pendingGstinRemovals || []).map(r => {
        const existing = existingGstinMap.get(r.gstin);
        return {
          gstin: r.gstin,
          state: existing?.state || '',
          address: existing?.registeredAddress ?? existing?.address ?? '',
          effectiveTo: r.effectiveFrom || 'Today'
        };
      });

      const parentUnchanged = fieldChanges.length === 0 && (addedGstins.length > 0 || updatedGstinAddresses.length > 0 || removedGstins.length > 0);

      this.reviewData = {
        operationType: 'UPDATE_CODE',
        title: 'Review Update Request',
        sectionName: isGlobal ? 'Global Customer Code – Update Code' : 'Handling Agent Code – Update Code',
        codeType: this.codeType,
        customerCode: this.verifiedCustomerCode || this.form.customerCode.trim().toUpperCase(),
        companyName: this.form.companyName.trim(),
        panNumber: this.form.panNumber.trim().toUpperCase(),
        fieldChanges,
        addedGstins,
        updatedGstinAddresses,
        removedGstins,
        parentUnchangedNotice: parentUnchanged
          ? 'Only GSTIN detail record(s) will be added/updated. The existing company code and parent company record will remain unchanged.'
          : undefined
      };
      this.showReviewModal = true;
      this.cdr.markForCheck();
    }
  }

  onReviewConfirm(): void {
    if (this.reviewSubmitting) return;
    if (this.mode === 'delete') {
      this.executeDeleteRequest();
    } else if (this.mode === 'ownership') {
      this.executeOwnershipSubmit();
    } else if (this.mode === 'new') {
      this.executeNewSubmit();
    } else {
      this.executeOldSubmit();
    }
  }

  onReviewCancel(): void {
    if (this.reviewSubmitting) return;
    this.showReviewModal = false;
    this.cdr.markForCheck();
  }

  executeOwnershipSubmit(): void {
    this.loading = true;
    this.reviewSubmitting = true;
    this.cdr.markForCheck();

    const ownershipCode = (this.form.ownershipCode || '').trim().toUpperCase();
    const ownershipAddress = (this.form.ownershipAddress || '').trim();
    const ownershipPartyCode = ownershipCode;
    const ownershipPartyAddress = ownershipAddress;

    this.customerService.submitOwnershipJDBC(
      ownershipCode,
      ownershipAddress,
      ownershipPartyCode,
      ownershipPartyAddress
    ).pipe(
      finalize(() => {
        this.loading = false;
        this.reviewSubmitting = false;
        this.showReviewModal = false;
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
  }

  executeNewSubmit(): void {
    this.loading = true;
    this.reviewSubmitting = true;
    this.cdr.markForCheck();

    const payload: CustomerPayload = {
      ...this.form,
      customerCode: this.form.customerCode.toUpperCase(),
      panNumber: this.form.panNumber.toUpperCase(),
      codeType: this.codeType
    };
    const gstinEntries = this.gstins.map((gstin) => ({
      ...gstin,
      gstin: gstin.gstin.toUpperCase()
    }));
    this.customerService.registerCustomer(payload, gstinEntries).pipe(
      finalize(() => {
        this.loading = false;
        this.reviewSubmitting = false;
        this.showReviewModal = false;
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
  }

  executeOldSubmit(): void {
    this.loading = true;
    this.reviewSubmitting = true;
    this.cdr.markForCheck();

    const customerCode = this.verifiedCustomerCode || this.form.customerCode.trim().toUpperCase();
    this.customerService.updateOldCustomerJDBC(
      {
        ...this.form,
        customerCode,
        expectedCustomerCode: this.updateRedirectContext?.companyCode || customerCode,
        navigationSource: this.navigationSource,
        codeType: this.codeType,
        operatingDivision: this.divisionSelectionManuallyChanged && this.form.operatingDivision
          ? this.form.operatingDivision
          : undefined
      },
      this.gstins,
      this.pendingGstinRemovals
    ).pipe(
      finalize(() => {
        this.loading = false;
        this.reviewSubmitting = false;
        this.showReviewModal = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
        next: (result) => {
          if (this.isSuccessfulResponse(result)) {
            this.clearDuplicateUpdateContext();
            this.navigationSource = 'DIRECT_UPDATE';
            this.updateRedirectContext = null;
            this.clearSelectedUploads();
            this.notice = result?.message || 'Request email sent to DBA. The database change is pending DBA execution.';
            this.notificationService.success(
              'Request Submitted Successfully',
              'Your request has been submitted successfully, and the SQL query has been sent to the DBA for execution.'
            );
            this.removedGstinIds = [];
            this.pendingGstinRemovals = [];

            // Refresh from DB
            const codeToRefresh = this.verifiedCustomerCode || this.form.customerCode.trim().toUpperCase();
            if (codeToRefresh) {
              const refresh$ = this.codeType === 'HANDLING_AGENT'
                ? this.customerService.lookupHandlingAgentJDBC(codeToRefresh)
                : this.customerService.lookupOldCustomerJDBC(codeToRefresh);

              refresh$.subscribe({
                next: (refreshed: any) => {
                  if (refreshed) {
                    const selectedGstinBeforeRefresh = this.gstins[this.selectedGstinAddressIndex]?.gstin;
                    this.lastLookupRecord = refreshed;
                    this.form.companyName = refreshed.companyName || this.form.companyName;
                    this.form.address = (refreshed.address || this.form.address).replace(/,\s+/g, ',').trim();
                    this.form.city = refreshed.city || this.form.city;
                    this.form.pincode = refreshed.pincode || refreshed.pcoCode || this.form.pincode;
                    this.form.panNumber = (refreshed.panNumber || this.form.panNumber).toUpperCase();
                    this.form.email = refreshed.email || refreshed.emailId || this.form.email;
                    this.form.mobile = refreshed.mobile || refreshed.phoneNumber || this.form.mobile;
                    this.applyOldRecordDivision(refreshed);

                    const panAvailable = this.isValueAvailable(refreshed.panNumber);
                    const gstAvailable = this.isGstAvailable(refreshed.gstinNumbers)
                      || (Array.isArray(refreshed.gstins) && refreshed.gstins.length > 0);

                    this.isOldPanDisabled = panAvailable;
                    this.isOldGstDisabled = gstAvailable;

                    if (panAvailable) {
                      this.form.panNumber = (refreshed.panNumber || '').trim().toUpperCase();
                    }

                    if (gstAvailable) {
                      const detailRows = Array.isArray(refreshed.gstins) ? refreshed.gstins : [];
                      const loadedGstins: GstinEntry[] = detailRows.length
                        ? detailRows.map((entry: any, idx: number) => ({
                            ...blankGstin,
                            gstinId: entry.gstinId ?? `old-${idx}`,
                            gstin: String(entry.gstin || entry.gstinNumber || '').trim().toUpperCase(),
                            effectiveFrom: entry.effectiveFrom || '',
                            effectiveTo: entry.effectiveTo || '',
                            implementationDate: entry.implementationDate || '',
                            persistedDetail: true,
                            state: entry.state || getStateNameFromGstinCode(String(entry.gstin || entry.gstinNumber || '').slice(0, 2)) || '',
                            registeredAddress: entry.registeredAddress ?? entry.address ?? '',
                            city: entry.city || '',
                            pincode: entry.pincode || ''
                          }))
                        : (refreshed.gstinNumbers || '')
                          .replace(/[\[\]"'\s]/g, '')
                          .split(',')
                          .map((g: string) => g.trim())
                          .filter((g: string) => Boolean(g) && g.toLowerCase() !== 'null' && g.toLowerCase() !== 'undefined')
                          .map((g: string, idx: number) => ({
                            ...blankGstin,
                            gstinId: `old-${idx}`,
                            gstin: g.toUpperCase(),
                            state: getStateNameFromGstinCode(g.slice(0, 2)) || ''
                          }));
                      this.gstins = loadedGstins.length > 0 ? loadedGstins : [{ ...blankGstin }];
                      if (detailRows.length > 0) {
                        const selectedIndex = selectedGstinBeforeRefresh
                          ? loadedGstins.findIndex(entry => entry.gstin === selectedGstinBeforeRefresh)
                          : this.selectedGstinAddressIndex;
                        const validIndex = (selectedIndex >= 0 && selectedIndex < loadedGstins.length) ? selectedIndex : 0;
                        this.selectGstinDetail(validIndex);
                        if (this.gstins[0] && !this.gstins[0].registeredAddress && this.form.address) {
                          this.gstins[0].registeredAddress = this.form.address;
                        }
                      }
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

  addGstin(): void {
    this.gstins.push({
      ...blankGstin,
      registeredAddress: '',
      city: '',
      pincode: '',
      addressStatus: '',
      persistedDetail: false
    });
  }

  removeGstin(index: number): void {
    if (this.isGstinEntryDisabled(index)) {
      return;
    }
    const removed = this.gstins[index];
    if (removed?.gstinId) {
      this.removedGstinIds.push(removed.gstinId);
    }
    this.gstins.splice(index, 1);

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
    if (this.selectedGstinAddressIndex >= this.gstins.length) {
      this.selectedGstinAddressIndex = Math.max(0, this.gstins.length - 1);
    }
    if (this.gstins.length <= 1) {
      this.selectedGstinAddressIndex = 0;
    }
    const selectedAddress = this.gstins[this.selectedGstinAddressIndex]?.registeredAddress;
    if (selectedAddress) {
      this.form.address = selectedAddress;
    }
    this.cdr.markForCheck();
  }

  trackByGstin(index: number, item: GstinEntry): any {
    return item.gstinId || index;
  }

  handleGstinChange(index: number, updates: Partial<GstinEntry>): void {
    if (this.isGstinEntryDisabled(index)) return;
    const currentEntry = this.gstins[index];
    if (!currentEntry) return;
    const hasGstinUpdate = Object.prototype.hasOwnProperty.call(updates, 'gstin');
    const oldGstin = normalizeDocumentNumber(currentEntry.gstin);
    const currentGstin = hasGstinUpdate ? normalizeDocumentNumber(updates.gstin) : currentEntry.gstin;
    const gstinChanged = hasGstinUpdate && oldGstin !== normalizeDocumentNumber(currentGstin);
    this.gstins[index] = {
      ...currentEntry,
      ...updates,
      ...(hasGstinUpdate ? { gstin: normalizeDocumentNumber(currentGstin) } : {})
    };

    if (gstinChanged) this.gstins[index].scanError = '';

    if (hasGstinUpdate) {
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
      } else if (this.errors[field] && this.errors[field] !== 'GSTIN could not be detected. Please enter your GSTIN manually.') {
        delete this.errors[field];
      }
    }
  }

  handleGstinInput(index: number, rawGstin: string): void {
    if (this.isGstinEntryDisabled(index)) return;
    const gstin = normalizeDocumentNumber(rawGstin);
    const previousGstin = normalizeDocumentNumber(this.gstins[index]?.gstin);
    if (previousGstin === gstin) return;

    this.ocrRequestId++;
    const targetGstin = this.gstins[index];
    if (targetGstin) {
      targetGstin.dbVerificationStatus = undefined;
      targetGstin.dbVerificationMessage = undefined;
      targetGstin.dbVerifying = false;
      targetGstin.duplicateStatus = 'idle';
      targetGstin.duplicateMessage = undefined;
      targetGstin.duplicateRecords = [];
    }
    this.handleGstinChange(index, { gstin });

    if (this.semGstinVerifyTimer) {
      clearTimeout(this.semGstinVerifyTimer);
      this.semGstinVerifyTimer = null;
    }
    if (gstin.length === 15) {
      this.semGstinVerifyTimer = setTimeout(() => this.verifySemGstinForIndex(index), 350);
      this.triggerGstinDuplicateCheck(index, gstin);
    }
    this.cdr.markForCheck();
  }

  handleGstinBlur(index: number): void {
    const g = this.gstins[index];
    if (!g) return;
    const field = `gstin_${index}_gstin`;
    const rawGstin = (g.gstin || '').trim();
    if (!rawGstin) {
      delete this.errors[field];
      g.dbVerificationStatus = undefined;
      g.dbVerificationMessage = undefined;
      g.dbVerifying = false;
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
    if (rawGstin.length === 15) {
      this.verifySemGstinForIndex(index);
    }
  }

  verifySemGstinForIndex(index: number): void {
    const g = this.gstins[index];
    if (!g) return;
    const rawGstin = (g.gstin || '').trim().toUpperCase();
    if (rawGstin.length !== 15 || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(rawGstin)) {
      g.dbVerificationStatus = undefined;
      g.dbVerificationMessage = undefined;
      g.dbVerifying = false;
      this.cdr.markForCheck();
      return;
    }

    const reqId = (g.dbVerifyReqId || 0) + 1;
    g.dbVerifyReqId = reqId;
    g.dbVerifying = true;
    g.dbVerificationStatus = 'checking';
    this.cdr.markForCheck();

    this.customerService.verifySemGstin(rawGstin, this.form.companyName, this.form.address).subscribe({
      next: (res) => {
        if (g.dbVerifyReqId !== reqId) return;
        g.dbVerifying = false;
        if (res.status === 'VERIFIED') {
          g.dbVerificationStatus = 'verified';
        } else if (res.status === 'MISMATCH') {
          g.dbVerificationStatus = 'mismatch';
        } else if (res.status === 'NOT_FOUND') {
          g.dbVerificationStatus = 'not_found';
        } else {
          g.dbVerificationStatus = 'unavailable';
        }
        g.dbVerificationMessage = res.message;
        this.cdr.markForCheck();
      },
      error: () => {
        if (g.dbVerifyReqId !== reqId) return;
        g.dbVerifying = false;
        g.dbVerificationStatus = 'unavailable';
        g.dbVerificationMessage = 'ℹ Verification Unavailable – Unable to connect to office database.';
        this.cdr.markForCheck();
      }
    });
  }

  verifyAllEligibleGstins(debounceMs = 300): void {
    if (this.semGstinVerifyTimer) {
      clearTimeout(this.semGstinVerifyTimer);
      this.semGstinVerifyTimer = null;
    }
    const run = () => {
      this.gstins.forEach((g, idx) => {
        const raw = (g.gstin || '').trim();
        if (raw.length === 15) {
          this.verifySemGstinForIndex(idx);
        }
      });
    };
    if (debounceMs <= 0) {
      run();
    } else {
      this.semGstinVerifyTimer = setTimeout(run, debounceMs);
    }
  }

  handleGstinStateChange(index: number, state: string): void {
    if (this.isGstinEntryDisabled(index)) return;
    this.handleGstinChange(index, { state });
    const field = `gstin_${index}_state`;
    if (state && this.gstins.some((gstin, currentIndex) => currentIndex !== index && gstin.state === state)) {
      this.errors[field] = 'State already added';
    } else if (this.errors[field]) {
      delete this.errors[field];
    }
  }

  handleGstinAddressChange(index: number, address: string): void {
    if (!this.gstins[index]) return;
    this.gstins[index].registeredAddress = address;
    if (this.selectedGstinAddressIndex === index || (index === 0 && this.mode === 'new')) {
      this.form.address = address;
    }
    const field = `gstin_${index}_address`;
    if (address && address.trim()) {
      delete this.errors[field];
      if (this.selectedGstinAddressIndex === index || index === 0) {
        delete this.errors['address'];
      }
    }
    this.cdr.markForCheck();
  }

  handleGstinAddressBlur(index: number): void {
    const g = this.gstins[index];
    if (!g) return;
    let addr = g.registeredAddress || '';
    if (addr) {
      addr = this.getNormalizedAddress(addr);
      g.registeredAddress = addr;
    }
    if (this.selectedGstinAddressIndex === index || (index === 0 && this.mode === 'new')) {
      this.form.address = addr;
    }
    const field = `gstin_${index}_address`;
    const isRequired = this.mode !== 'old' || g.persistedDetail || Boolean(g.gstin);
    if (!addr.trim()) {
      if (isRequired) {
        this.errors[field] = `Registered address is required for ${g.gstin || 'GSTIN ' + (index + 1)}.`;
      }
    } else if (addr.length > 100) {
      this.errors[field] = `Address for ${g.gstin || 'GSTIN ' + (index + 1)} cannot exceed 100 characters.`;
    } else {
      delete this.errors[field];
      if (this.selectedGstinAddressIndex === index || index === 0) {
        delete this.errors['address'];
      }
    }
    this.cdr.markForCheck();
  }

  handlePanChange(value: string, isManual = true): void {
    if (this.isPanDisabled) {
      return;
    }
    if (isManual) {
      this.panManuallyEdited = true;
    }
    this.form.panNumber = value.toUpperCase();
    this.touchedFields['panNumber'] = true;
    const normalizedPan = normalizeDocumentNumber(this.form.panNumber);
    if (value && !panRe.test(normalizedPan)) {
      this.errors['panNumber'] = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';
    } else if (this.errors['panNumber']?.startsWith('Enter a valid PAN')) {
      delete this.errors['panNumber'];
    }

    if (this.mode === 'new') {
      if (normalizedPan && panRe.test(normalizedPan)) {
        this.triggerPanDuplicateCheck(normalizedPan);
      } else {
        this.panDuplicateStatus = 'idle';
        this.panDuplicateMessage = undefined;
        this.panDuplicateResult = null;
        this.selectedPanCompany = null;
      }
    }

    this.gstins.forEach((gstin, index) => {
      const status = this.getGstinPanStatus(gstin.gstin, this.form.panNumber);
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
    if (this.gstins && this.gstins[this.selectedGstinAddressIndex]) {
      this.gstins[this.selectedGstinAddressIndex].registeredAddress = this.form.address;
    }
    this.verifyAllEligibleGstins(0);
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
    if (this.gstins && this.gstins[this.selectedGstinAddressIndex]) {
      this.gstins[this.selectedGstinAddressIndex].registeredAddress = this.form.address;
    }
    if (this.errors['address'] === 'Address cannot exceed 100 characters.' && this.normalizedAddressLength <= 100) {
      delete this.errors['address'];
    }
    delete this.errors[`gstin_${this.selectedGstinAddressIndex}_address`];
  }

  async handleGstinFileChange(index: number, e: Event): Promise<void> {
    if (this.isGstinEntryDisabled(index)) return;
    const input = e.target as HTMLInputElement;
    const selected = input?.files?.[0];
    if (input) {
      input.value = '';
    }
    if (!selected) return;

    const currentReqId = ++this.ocrRequestId;
    console.info(`[GSTIN OCR] Document uploaded (${selected.type || 'unknown file type'}, ${selected.size} bytes).`);

    if (this.mode !== 'old' && index === 0) {
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
    if (index === 0) {
      delete this.errors['companyName'];
      delete this.errors['customerCode'];
      delete this.errors['panNumber'];
      delete this.errors['address'];
      delete this.errors['city'];
      delete this.errors['pincode'];
    }
    delete this.errors[`gstin_${index}_gstin`];
    delete this.errors[`gstin_${index}_file`];
    delete this.errors[`gstin_${index}_state`];

    // Clear previous GSTIN processing results for this entry
    if (this.gstins[index]) {
      this.gstins[index].gstin = '';
      this.gstins[index].state = '';
      this.gstins[index].registeredAddress = '';
      this.gstins[index].duplicateStatus = 'idle';
      this.gstins[index].duplicateMessage = undefined;
      this.gstins[index].duplicateRecords = [];
    }

    const error = this.checkFile(selected);
    if (error) {
      this.handleGstinChange(index, { file: null, scanning: false, scanStatus: 'error', scanError: error, scanProgress: '' });
      this.errors[`gstin_${index}_file`] = error;
      this.cdr.markForCheck();
      return;
    }

    this.handleGstinChange(index, {
      file: selected,
      scanning: true,
      scanStatus: 'processing',
      scanError: '',
      scanProgress: 'Preparing document for scanning...'
    });
    this.cdr.markForCheck();

    try {
      const isPdf = selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf');

      let gstin: string | null | undefined;
      let stateName: string | null | undefined;
      let address: string | null | undefined;
      let city: string | null | undefined;
      let pincode: string | null | undefined;
      let tradeName: string | null | undefined;
      let legalName: string | null | undefined;
      let businessName: string | null | undefined;
      let ocrPan: string | null | undefined;
      let panMismatch = false;
      let companyNameTooLong = false;

      if (isPdf) {
        // PDF OCR: Keep existing PDF OCR workflow untouched
        const result = await this.panOcrService.extractGstinFromFile(selected, (progress) => {
          if (currentReqId !== this.ocrRequestId || !this.gstins[index]) return;
          this.gstins[index].scanProgress = progress;
          this.cdr.markForCheck();
        });
        gstin = result.gstin;
        stateName = result.stateName;
        address = result.address;
        city = result.city;
        pincode = result.pincode;
        tradeName = result.tradeName;
        legalName = result.legalName;
        businessName = result.businessName;
        ocrPan = result.pan;
        panMismatch = !!result.panMismatch;
        companyNameTooLong = !!result.companyNameTooLong;
      } else {
        // Image OCR (PNG, JPG, JPEG) via Backend Spring Boot Tesseract OCR
        if (this.gstins[index]) {
          this.gstins[index].scanProgress = 'Processing image with Tesseract OCR...';
          this.cdr.markForCheck();
        }

        let backendHandled = false;
        try {
          const backendRes = await firstValueFrom(this.customerService.ocrImage(selected));
          if (backendRes && backendRes.success && backendRes.gstin) {
            backendHandled = true;
            gstin = backendRes.gstin;
            stateName = backendRes.stateName || backendRes.state;
            address = backendRes.address;
            city = backendRes.city;
            pincode = backendRes.pincode;
            tradeName = backendRes.tradeName;
            legalName = backendRes.legalName;
            businessName = backendRes.businessName;
            ocrPan = backendRes.pan;
            panMismatch = !!backendRes.panMismatch;
            companyNameTooLong = !!backendRes.companyNameTooLong;
          } else if (backendRes && backendRes.tesseractMissing) {
            console.warn('[Image OCR] Backend Tesseract not installed on server, falling back to client-side OCR...');
          }
        } catch (backendErr) {
          console.warn('[Image OCR] Backend OCR service call failed, trying client-side fallback:', backendErr);
        }

        if (!backendHandled) {
          const result = await this.panOcrService.extractGstinFromFile(selected, (progress) => {
            if (currentReqId !== this.ocrRequestId || !this.gstins[index]) return;
            this.gstins[index].scanProgress = progress;
            this.cdr.markForCheck();
          });
          gstin = result.gstin;
          stateName = result.stateName;
          address = result.address;
          city = result.city;
          pincode = result.pincode;
          tradeName = result.tradeName;
          legalName = result.legalName;
          businessName = result.businessName;
          ocrPan = result.pan;
          panMismatch = !!result.panMismatch;
          companyNameTooLong = !!result.companyNameTooLong;
        }
      }

      // Prevent an older OCR request from overwriting a newer upload
      if (currentReqId !== this.ocrRequestId) {
        return;
      }

      const normalizedGstin = normalizeDocumentNumber(gstin);
      const gstinDerivedPan = gstinRe.test(normalizedGstin) ? normalizedGstin.slice(2, 12) : '';
      const extractedPan = ocrPan || gstinDerivedPan;

      if (!gstinRe.test(normalizedGstin)) {
        console.info('[GSTIN OCR] Processing finished; GSTIN was not detected.');
        const message = 'GSTIN could not be detected. Please enter your GSTIN manually.';
        this.handleGstinChange(index, {
          scanning: false,
          scanStatus: gstin ? 'error' : 'notfound',
          scanError: message,
          scanProgress: ''
        });
        this.errors[`gstin_${index}_gstin`] = message;
        return;
      }

      const derivedState = stateName || (normalizedGstin ? getStateNameFromGstinCode(normalizedGstin.slice(0, 2)) : null);
      const updates: Partial<GstinEntry> = {
        gstin: normalizedGstin,
        scanning: false,
        scanStatus: 'success',
        scanError: '',
        scanProgress: ''
      };
      if (derivedState && (!this.gstins[index]?.state || this.gstins[index]?.state === '')) {
        updates.state = derivedState;
      }
      this.handleGstinChange(index, updates);
      delete this.errors[`gstin_${index}_gstin`];
      delete this.errors[`gstin_${index}_state`];

      const cleanedAddress = cleanAndShortenAddress(address);
      if (this.gstins[index]) {
        this.gstins[index].registeredAddress = cleanedAddress || '';
        this.gstins[index].city = city || '';
        this.gstins[index].pincode = pincode || '';
      }

      if (this.mode === 'old') {
        const companyPan = normalizeDocumentNumber(this.form.panNumber);
        if (companyPan && gstinDerivedPan && gstinDerivedPan !== companyPan) {
          const message = `GSTIN ${normalizedGstin} does not match company PAN ${companyPan}.`;
          this.handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message, scanProgress: '' });
          this.errors[`gstin_${index}_gstin`] = message;
          return;
        }

        if (cleanedAddress) {
          this.gstins[index].registeredAddress = cleanedAddress;
          this.gstins[index].addressStatus = 'auto-filled';
          if (city) this.gstins[index].city = city;
          if (pincode) this.gstins[index].pincode = pincode;
          if (this.selectedGstinAddressIndex === index) {
            this.form.address = cleanedAddress;
            if (city) this.form.city = city;
            if (pincode) this.form.pincode = pincode;
            this.addressStatus = 'auto-filled';
            delete this.errors['address'];
          }
          delete this.errors[`gstin_${index}_address`];
        } else {
          this.gstins[index].addressStatus = 'extraction-failed';
          if (this.selectedGstinAddressIndex === index) {
            this.addressStatus = 'extraction-failed';
          }
          this.errors[`gstin_${index}_address`] = `Unable to extract address from GSTIN document. Please enter registered address manually.`;
        }
      } else {
        // 1. Company Name (only if index === 0 or companyName is not set)
        if (index === 0 || !this.form.companyName) {
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
        }

        // 2. PAN Number (only if index === 0 or panNumber is not set)
        if (index === 0 || !this.form.panNumber) {
          if (panMismatch || (ocrPan && gstinDerivedPan && ocrPan !== gstinDerivedPan)) {
            this.errors['panNumber'] = 'Extracted PAN does not match the GSTIN.';
            this.form.panNumber = (ocrPan || gstinDerivedPan).toUpperCase();
          } else if (!panRe.test(extractedPan)) {
            const message = 'The extracted GSTIN contains an invalid PAN. Please upload a clearer GSTIN document or enter the GSTIN and PAN manually.';
            this.handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message, scanProgress: '' });
            this.errors['panNumber'] = 'PAN could not be derived because the extracted GSTIN is invalid.';
            this.errors[`gstin_${index}_gstin`] = message;
            return;
          } else {
            this.form.panNumber = extractedPan.toUpperCase();
            delete this.errors['panNumber'];
            if (this.mode === 'new') {
              this.triggerPanDuplicateCheck(this.form.panNumber);
            }
          }
        }

        // 3. Address
        if (cleanedAddress) {
          this.gstins[index].registeredAddress = cleanedAddress;
          this.gstins[index].addressStatus = 'auto-filled';
          delete this.errors[`gstin_${index}_address`];
          if (index === 0 || index === this.selectedGstinAddressIndex) {
            this.form.address = cleanedAddress;
            this.addressStatus = 'auto-filled';
            delete this.errors['address'];
          }
        } else {
          this.gstins[index].addressStatus = 'extraction-failed';
          if (index === 0 || index === this.selectedGstinAddressIndex) {
            this.addressStatus = 'extraction-failed';
          }
        }

        // 4. City Name & 5. PIN Code (only if index === 0)
        if (index === 0) {
          if (city) {
            this.form.city = city;
            delete this.errors['city'];
          }
          if (pincode) {
            this.form.pincode = pincode;
            delete this.errors['pincode'];
          }
        }
      }

      this.ocrAutoFillApplied = true;
      console.info('[GSTIN OCR] Extraction results applied to the form.');
      this.verifySemGstinForIndex(index);
      this.triggerGstinDuplicateCheck(index, normalizedGstin);

    } catch (err) {
      if (currentReqId !== this.ocrRequestId) return;
      console.error('[GSTIN OCR] Processing failed:', err);
      const message = err instanceof Error && err.message.startsWith('PDF exceeds the')
        ? `${err.message} Please upload a shorter PDF.`
        : err instanceof Error && err.message
          ? err.message
          : 'GSTIN could not be detected. Please enter your GSTIN manually.';
      this.handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message, scanProgress: '' });
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
    this.touchedFields['zone'] = true;
    this.touchedFields['operatingDivision'] = true;
    this.zoneDivisionService?.setSelection(zone, '', true);
    this.zoneSearchTerm = '';
    this.zoneOpen = false;
    delete this.errors['zone'];
    delete this.errors['operatingDivision'];
    this.cdr.markForCheck();
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
    this.touchedFields['operatingDivision'] = true;
    this.zoneDivisionService?.setSelection(this.form.zone || '', div, true);
    this.divisionOpen = false;
    delete this.errors['operatingDivision'];
    this.cdr.markForCheck();
  }
}