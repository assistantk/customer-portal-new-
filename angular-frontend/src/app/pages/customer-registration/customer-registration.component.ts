import { Component, OnInit, OnDestroy } from '@angular/core';
import { CustomerService, GstinEntry, CustomerPayload } from '../../services/customer.service';
import { PanOcrService, ExtractedGstinDetails } from '../../services/pan-ocr.service';
import { generateCustomerCode } from '../../services/customer-code-generator';

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
  scanError: ''
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
  mode: 'ownership' | 'old' | 'new' = 'old';
  codeType: 'GLOBAL' | 'HANDLING_AGENT' = 'GLOBAL';
  form: CustomerPayload = { ...blank };
  gstins: GstinEntry[] = [{ ...blankGstin }];
  errors: Record<string, string> = {};
  notice = '';
  loading = false;
  lookupLoading = false;
  lookupDone = false;
  lookupError = '';
  codeConfirmed = false;
  addressStatus = '';
  ocrAutoFillApplied = false;
  removedGstinIds: any[] = [];

  // Dropdown states
  zoneOpen = false;
  zoneSearchTerm = '';
  divisionOpen = false;

  // Ownership Section 1 states
  ownSection1Loading = false;
  ownSection1Found: boolean | null = null;
  ownSection1Duplicate = false;
  private ownSection1Timer: any = null;
  private ownSection1ReqId = 0;

  // Ownership Section 2 states
  ownSection2Loading = false;
  ownSection2Found: boolean | null = null;
  ownSection2Duplicate = false;
  private ownSection2Timer: any = null;
  private ownSection2ReqId = 0;

  // Timers
  private lookupTimer: any = null;
  private lookupRequestId = 0;

  readonly INDIAN_STATES = INDIAN_STATES;
  readonly divisionsByZone = divisionsByZone;

  constructor(
    private customerService: CustomerService,
    private panOcrService: PanOcrService
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    if (this.ownSection1Timer) clearTimeout(this.ownSection1Timer);
    if (this.ownSection2Timer) clearTimeout(this.ownSection2Timer);
    if (this.lookupTimer) clearTimeout(this.lookupTimer);
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

  getGstinPanStatus(gstin: string, pan?: string): string | null {
    const normalizedGstin = normalizeDocumentNumber(gstin);
    const normalizedPan = normalizeDocumentNumber(pan || this.form.panNumber);
    if (!normalizedGstin) return null;
    if (!gstinRe.test(normalizedGstin)) return 'Enter a valid 15-character GSTIN.';
    if (normalizedPan.length !== 10 || !panRe.test(normalizedPan)) return null;
    return normalizedGstin.slice(2, 12) === normalizedPan ? 'GSTIN matches PAN' : 'GSTIN does not match the PAN number.';
  }

  reset(): void {
    this.form = { ...blank };
    this.gstins = [{ ...blankGstin }];
    this.errors = {};
    this.notice = '';
    this.lookupDone = false;
    this.lookupError = '';
    this.codeConfirmed = false;
    this.codeType = 'GLOBAL';
    this.addressStatus = '';
    this.ocrAutoFillApplied = false;
    this.removedGstinIds = [];
    this.zoneOpen = false;
    this.zoneSearchTerm = '';
    this.divisionOpen = false;
    this.ownSection1Loading = false;
    this.ownSection1Found = null;
    this.ownSection1Duplicate = false;
    this.ownSection2Loading = false;
    this.ownSection2Found = null;
    this.ownSection2Duplicate = false;
  }

  clearSelectedUploads(): void {
    this.gstins = this.gstins.map(g => ({ ...g, file: null, scanning: false, scanStatus: 'idle', scanError: '' }));
  }

  switchMode(newMode: 'ownership' | 'old' | 'new'): void {
    this.reset();
    this.mode = newMode;
  }

  /* ===== Ownership Section 1: lookup in MEMWGONOWNRSHIP ===== */
  handleOwnershipCodeChange(code: string): void {
    this.form.ownershipCode = code;
    this.form.ownershipAddress = '';
    this.ownSection1Found = null;
    this.ownSection1Duplicate = false;
    const reqId = ++this.ownSection1ReqId;
    if (this.ownSection1Timer) clearTimeout(this.ownSection1Timer);

    if (code.trim().length > 0) {
      this.ownSection1Loading = true;
      this.ownSection1Timer = setTimeout(async () => {
        try {
          const trimmed = code.trim();
          this.customerService.lookupOwnershipJDBC(trimmed).subscribe({
            next: (resp) => {
              if (reqId !== this.ownSection1ReqId) return;
              if (resp && resp.found && resp.data) {
                this.form.ownershipAddress = resp.data.ownershipDesc || '';
                this.ownSection1Found = true;
              } else {
                this.ownSection1Found = false;
              }
            },
            error: () => {
              if (reqId !== this.ownSection1ReqId) return;
              this.ownSection1Found = false;
            }
          });

          this.customerService.checkOwnershipDuplicate(trimmed).subscribe({
            next: (dupResp) => {
              if (reqId !== this.ownSection1ReqId) return;
              this.ownSection1Duplicate = dupResp && dupResp.duplicate === true;
              this.ownSection1Loading = false;
            },
            error: () => {
              if (reqId !== this.ownSection1ReqId) return;
              this.ownSection1Duplicate = false;
              this.ownSection1Loading = false;
            }
          });
        } catch {
          if (reqId === this.ownSection1ReqId) {
            this.ownSection1Loading = false;
          }
        }
      }, 600);
    } else {
      this.ownSection1Loading = false;
    }
  }

  /* ===== Ownership Section 2: lookup in MEMWGONOWNRPRTY ===== */
  handleOwnershipPartyCodeChange(code: string): void {
    this.form.ownershipPartyCode = code;
    this.form.ownershipPartyAddress = '';
    this.ownSection2Found = null;
    this.ownSection2Duplicate = false;
    const reqId = ++this.ownSection2ReqId;
    if (this.ownSection2Timer) clearTimeout(this.ownSection2Timer);

    if (code.trim().length > 0) {
      this.ownSection2Loading = true;
      this.ownSection2Timer = setTimeout(() => {
        const trimmed = code.trim();
        this.customerService.lookupOwnershipPartyJDBC(trimmed).subscribe({
          next: (resp) => {
            if (reqId !== this.ownSection2ReqId) return;
            if (resp && resp.found && resp.data) {
              this.form.ownershipPartyAddress = resp.data.partyDesc || '';
              this.ownSection2Found = true;
            } else {
              this.ownSection2Found = false;
            }
          },
          error: () => {
            if (reqId !== this.ownSection2ReqId) return;
            this.ownSection2Found = false;
          }
        });

        this.customerService.checkOwnershipPartyDuplicate(trimmed).subscribe({
          next: (dupResp) => {
            if (reqId !== this.ownSection2ReqId) return;
            this.ownSection2Duplicate = dupResp && dupResp.duplicate === true;
            this.ownSection2Loading = false;
          },
          error: () => {
            if (reqId !== this.ownSection2ReqId) return;
            this.ownSection2Duplicate = false;
            this.ownSection2Loading = false;
          }
        });
      }, 600);
    } else {
      this.ownSection2Loading = false;
    }
  }

  /* ===== Old User: lookup by customer / handling agent code ===== */
  triggerOldLookup(code: string, type: 'GLOBAL' | 'HANDLING_AGENT'): void {
    this.form.customerCode = code;
    this.form.companyName = '';
    this.form.address = '';
    this.form.city = '';
    this.form.pincode = '';
    this.form.panNumber = '';
    this.form.operatingDivision = '';
    this.form.zone = '';
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

        lookup$.subscribe({
          next: (customer: any) => {
            if (requestId !== this.lookupRequestId) return;
            this.lookupLoading = false;
            this.form.companyName = customer.companyName || '';
            this.form.customerCode = code;
            this.form.address = customer.address || '';
            this.form.city = customer.city || '';
            this.form.pincode = customer.pincode || '';
            this.form.panNumber = customer.panNumber || '';
            this.form.email = customer.email || customer.emailId || '';
            this.form.mobile = customer.mobile || customer.phoneNumber || '';

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
          },
          error: (err: any) => {
            if (requestId !== this.lookupRequestId) return;
            this.lookupLoading = false;
            console.error('Lookup error:', err);
            this.lookupDone = false;
            this.lookupError = err?.error?.message || err?.message || 'Error occurred while fetching customer data';
            this.gstins = [{ ...blankGstin }];
          }
        });
      }, 800);
    } else {
      this.lookupLoading = false;
      this.gstins = [{ ...blankGstin }];
    }
  }

  handleOldCodeChange(code: string): void {
    this.triggerOldLookup(code, this.codeType);
  }

  handleOldCodeTypeChange(newType: 'GLOBAL' | 'HANDLING_AGENT'): void {
    this.codeType = newType;
    if (this.form.customerCode.trim().length === 4) {
      this.triggerOldLookup(this.form.customerCode, newType);
    } else {
      this.lookupDone = false;
      this.lookupError = '';
    }
  }

  /* ===== New User: generate code from company name ===== */
  handleNewCompanyNameChange(newName: string): void {
    this.form.companyName = newName;
    this.form.customerCode = generateCustomerCode(newName);
    this.codeConfirmed = Boolean(this.form.customerCode);
    delete this.errors['customerCode'];
    this.lookupError = '';
  }

  handleNewCodeTypeChange(newType: 'GLOBAL' | 'HANDLING_AGENT'): void {
    this.codeType = newType;
    if (this.mode === 'new' && this.form.companyName.trim()) {
      this.handleNewCompanyNameChange(this.form.companyName);
    }
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
      else if (this.ownSection1Duplicate) e['ownershipCode'] = 'This Ownership Code already exists in MEMWGONOWNRSHIP. Duplicate entries are not allowed.';
      if (!this.form.ownershipAddress?.trim()) e['ownershipAddress'] = 'Ownership Address is required';
      if (!this.form.ownershipPartyCode?.trim()) e['ownershipPartyCode'] = 'Ownership Code is required';
      else if (this.ownSection2Duplicate) e['ownershipPartyCode'] = 'This Ownership Code already exists in MEMWGONOWNRPRTY. Duplicate entries are not allowed.';
      if (!this.form.ownershipPartyAddress?.trim()) e['ownershipPartyAddress'] = 'Ownership Address is required';
      this.errors = e;
      return !Object.keys(e).length;
    }

    const requiredFields: (keyof CustomerPayload)[] = ['companyName', 'customerCode', 'address', 'city', 'panNumber'];
    if (this.mode === 'new') requiredFields.push('operatingDivision', 'zone', 'pincode');
    requiredFields.forEach(k => {
      if (!this.form[k]) e[k] = 'This field is required';
    });

    if (this.form.address && this.form.address.length > 100) e['address'] = 'Address cannot exceed 100 characters.';
    if (this.form.email?.trim() && !/^\S+@\S+\.\S+$/.test(this.form.email.trim())) e['email'] = 'Invalid email';
    if (this.form.mobile?.trim() && !mobileRe.test(this.form.mobile.trim())) e['mobile'] = 'Enter a valid 10-digit Indian mobile number';
    if (this.form.pincode && !/^[1-9][0-9]{5}$/.test(this.form.pincode)) e['pincode'] = 'Invalid pincode';
    const normalizedPan = normalizeDocumentNumber(this.form.panNumber);
    if (this.form.panNumber && !panRe.test(normalizedPan)) e['panNumber'] = 'Enter a valid PAN (5 letters, 4 numbers, and 1 letter).';

    const stateSet = new Set<string>();
    const gstinSet = new Set<string>();
    this.gstins.forEach((g, i) => {
      if (!g.state && this.mode === 'new') e[`gstin_${i}_state`] = 'State is required';
      else if (g.state && stateSet.has(g.state)) e[`gstin_${i}_state`] = 'State already added';
      else if (g.state) stateSet.add(g.state);

      const normalizedGstin = normalizeDocumentNumber(g.gstin);
      if (!g.gstin) e[`gstin_${i}_gstin`] = 'GSTIN is required';
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

    if (this.mode === 'new' && !this.codeConfirmed && this.form.companyName) {
      e['customerCode'] = 'Could not generate a customer code from the company name.';
    }

    this.errors = e;
    return !Object.keys(e).length;
  }

  submit(e: Event): void {
    e.preventDefault();
    this.notice = '';
    if (!this.validate()) return;
    this.loading = true;

    if (this.mode === 'ownership') {
      this.customerService.submitOwnershipJDBC(
        this.form.ownershipCode!.trim().toUpperCase(),
        this.form.ownershipAddress?.trim() || '',
        this.form.ownershipPartyCode?.trim().toUpperCase() || '',
        this.form.ownershipPartyAddress?.trim() || ''
      ).subscribe({
        next: (result) => {
          this.loading = false;
          this.notice = result.message || 'Request email sent to DBA. Database changes are pending DBA execution.';
        },
        error: (err) => {
          this.loading = false;
          let msg = err?.error?.message || err?.message || 'Submission failed.';
          if (msg.length > 200) msg = msg.split('- [com.cris')[0].substring(0, 150) + '...';
          this.notice = msg;
        }
      });
    } else if (this.mode === 'new') {
      this.customerService.registerCustomer({ ...this.form, codeType: this.codeType }, this.gstins).subscribe({
        next: (result) => {
          this.loading = false;
          const assignedCode = result.customerCode;
          this.reset();
          this.notice = assignedCode
            ? `Request email sent to DBA. Database changes are pending DBA execution. Customer Code: ${assignedCode}`
            : (result.message || 'Request email sent to DBA. The database change is pending DBA execution.');
        },
        error: (err) => {
          this.loading = false;
          let msg = err?.error?.message || err?.message || 'Registration failed.';
          if (msg.length > 200) msg = msg.split('- [com.cris')[0].substring(0, 150) + '...';
          this.notice = msg;
        }
      });
    } else {
      this.customerService.updateOldCustomerJDBC({ ...this.form, codeType: this.codeType }, this.gstins).subscribe({
        next: (result) => {
          this.loading = false;
          this.clearSelectedUploads();
          this.notice = result.message || 'Request email sent to DBA. The database change is pending DBA execution.';
          this.removedGstinIds = [];

          // Refresh from DB
          const refresh$ = this.codeType === 'HANDLING_AGENT'
            ? this.customerService.lookupHandlingAgentJDBC(this.form.customerCode.trim())
            : this.customerService.lookupOldCustomerJDBC(this.form.customerCode.trim());

          refresh$.subscribe({
            next: (refreshed: any) => {
              this.form.companyName = refreshed.companyName || this.form.companyName;
              this.form.address = refreshed.address || this.form.address;
              this.form.city = refreshed.city || this.form.city;
              this.form.panNumber = refreshed.panNumber || this.form.panNumber;
              this.form.email = refreshed.email || refreshed.emailId || this.form.email;
              this.form.mobile = refreshed.mobile || refreshed.phoneNumber || this.form.mobile;

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
            },
            error: (refreshErr) => console.error('Refresh lookup error:', refreshErr)
          });
        },
        error: (err) => {
          this.loading = false;
          let msg = err?.error?.message || err?.message || 'Update failed.';
          if (msg.length > 200) msg = msg.split('- [com.cris')[0].substring(0, 150) + '...';
          this.notice = msg;
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
  }

  handleGstinChange(index: number, updates: Partial<GstinEntry>): void {
    this.gstins[index] = { ...this.gstins[index], ...updates };
    if (Object.prototype.hasOwnProperty.call(updates, 'gstin')) {
      const status = this.getGstinPanStatus(updates.gstin || '', this.form.panNumber);
      const field = `gstin_${index}_gstin`;
      if (status === 'GSTIN does not match the PAN number.') {
        this.errors[field] = 'GSTIN does not match the PAN number.';
      } else if (status?.startsWith('Enter')) {
        this.errors[field] = status;
      } else if (
        ['GSTIN does not match the PAN number.', 'Enter a valid 15-character GSTIN.'].includes(this.errors[field]) ||
        this.errors[field]?.includes('GSTIN could not be extracted') ||
        this.errors[field]?.includes('GSTIN could not be detected') ||
        this.errors[field]?.includes('valid 15-character GSTIN could not be extracted') ||
        this.errors[field]?.includes('extracted GSTIN contains an invalid PAN')
      ) {
        delete this.errors[field];
      }
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

  handlePanChange(value: string): void {
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
        this.errors[field] = status;
      } else if (['GSTIN does not match the PAN number.', 'Enter a valid 15-character GSTIN.'].includes(this.errors[field])) {
        delete this.errors[field];
      }
    });
  }

  async handleGstinFileChange(index: number, e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const selected = input.files?.[0];
    if (!selected) return;
    const error = this.checkFile(selected);
    if (error) {
      this.handleGstinChange(index, { file: null, scanning: false, scanStatus: 'error', scanError: error });
      this.errors[`gstin_${index}_file`] = error;
      return;
    }

    this.handleGstinChange(index, { file: selected, scanning: true, scanStatus: 'processing', scanError: '' });
    delete this.errors[`gstin_${index}_file`];

    try {
      const { gstin, stateName, address, city, pincode, tradeName } = await this.panOcrService.extractGstinFromFile(selected);

      if (index === 0 && tradeName && !this.form.companyName.trim()) {
        if (this.mode === 'new') {
          this.handleNewCompanyNameChange(tradeName);
        } else {
          this.form.companyName = tradeName;
        }
        this.ocrAutoFillApplied = true;
      }

      const normalizedGstin = normalizeDocumentNumber(gstin);
      const extractedPan = gstinRe.test(normalizedGstin) ? normalizedGstin.slice(2, 12) : '';

      if (!gstinRe.test(normalizedGstin)) {
        const message = 'A valid 15-character GSTIN could not be extracted. Please upload a clearer GSTIN document or enter the GSTIN manually.';
        this.handleGstinChange(index, { scanning: false, scanStatus: gstin ? 'error' : 'notfound', scanError: message });
        this.errors[`gstin_${index}_gstin`] = message;
        return;
      }

      if (!panRe.test(extractedPan)) {
        const message = 'The extracted GSTIN contains an invalid PAN. Please upload a clearer GSTIN document or enter the GSTIN and PAN manually.';
        this.handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message });
        this.errors['panNumber'] = 'PAN could not be derived because the extracted GSTIN is invalid.';
        this.errors[`gstin_${index}_gstin`] = message;
        return;
      }

      const updates: Partial<GstinEntry> = {
        gstin: normalizedGstin,
        scanning: false,
        scanStatus: 'success',
        scanError: ''
      };
      if (stateName && (!this.gstins[index]?.state || this.gstins[index]?.state === '')) {
        updates.state = stateName;
      }
      this.handleGstinChange(index, updates);

      this.form.panNumber = extractedPan;
      if (index === 0 && city) this.form.city = city;
      if (index === 0 && pincode) this.form.pincode = pincode;
      this.ocrAutoFillApplied = true;

      delete this.errors[`gstin_${index}_gstin`];
      delete this.errors[`gstin_${index}_state`];
      delete this.errors['panNumber'];

      if (index === 0) {
        if (address) {
          let shouldUpdate = true;
          let isMatch = false;

          if (this.form.address || this.form.city || this.form.pincode) {
            isMatch = this.form.address ? addressesMatch(this.form.address, address) : false;
            if (isMatch) {
              shouldUpdate = false;
              this.addressStatus = 'verified';
            } else {
              shouldUpdate = window.confirm(`Address found in GST Certificate:\n${address}\n\nUse this GST address instead of manually entered data?`);
            }
          }

          if (shouldUpdate) {
            this.addressStatus = !this.form.address ? 'auto-filled' : 'auto-corrected';
            this.form.address = address;
            if (pincode) this.form.pincode = pincode;
            if (city) this.form.city = city;
          } else if (!isMatch && this.form.address) {
            this.addressStatus = '';
          }
        } else {
          this.addressStatus = 'extraction-failed';
        }
      }
    } catch (err) {
      console.error('GSTIN OCR scan failed:', err);
      const message = err instanceof Error && err.message.startsWith('PDF exceeds the')
        ? `${err.message} Please upload a shorter PDF.`
        : 'GSTIN could not be extracted from this document. Please upload a clearer GSTIN document or enter the GSTIN manually.';
      this.handleGstinChange(index, { scanning: false, scanStatus: 'error', scanError: message });
      this.errors[`gstin_${index}_gstin`] = message;
    }
  }

  // Zone select
  toggleZoneMenu(): void {
    this.zoneOpen = !this.zoneOpen;
    if (!this.zoneOpen) this.zoneSearchTerm = '';
  }

  chooseZone(zone: string): void {
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
    this.form.operatingDivision = div;
    this.divisionOpen = false;
    delete this.errors['operatingDivision'];
  }
}