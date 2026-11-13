import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { catchError, finalize, filter, map, of, Subscription, switchMap } from 'rxjs';
import { CustomerService, DeleteRequestCodeType } from '../../services/customer.service';
import { IMAGE_ASSETS } from '../../config/image-assets';
import { ReviewModalData } from '../../components/review-modal/review-modal.component';

@Component({
  selector: 'app-delete-request',
  standalone: false,
  templateUrl: './delete-request.component.html',
  styleUrls: ['./delete-request.component.css']
})
export class DeleteRequestComponent implements OnInit, OnDestroy {
  readonly imageAssets = IMAGE_ASSETS;
  codeType: DeleteRequestCodeType | '' = '';
  code = '';
  companyName = '';
  verifiedRecord: { codeType: DeleteRequestCodeType; code: string; companyName: string } | null = null;
  recordDetails: any = null;
  disableScope: 'GSTIN' | 'CODE' = 'GSTIN';
  availableGstins: Array<{
    gstin: string;
    address?: string;
    city?: string;
    pincode?: string;
    state?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    active?: boolean;
  }> = [];
  selectedGstinMap: Record<string, boolean> = {};
  verificationMessage = '';
  errorMessage = '';
  successMessage = '';
  verifying = false;
  submitting = false;
  showReviewModal = false;
  reviewSubmitting = false;
  reviewData: ReviewModalData | null = null;
  logoLoadFailed = false;
  private lookupRequestId = 0;
  private activeSub = new Subscription();
  private routerEventsSubscription?: Subscription;

  constructor(
    private customerService: CustomerService,
    private router?: Router
  ) {}

  ngOnInit(): void {
    this.reset();
    if (this.router?.events) {
      this.routerEventsSubscription = this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => {
          this.reset();
        });
    }
  }

  ngOnDestroy(): void {
    this.lookupRequestId++;
    this.routerEventsSubscription?.unsubscribe();
    this.activeSub.unsubscribe();
    this.activeSub = new Subscription();
    this.codeType = '';
    this.code = '';
    this.clearVerification();
  }

  reset(): void {
    this.lookupRequestId++;
    this.codeType = '';
    this.code = '';
    this.companyName = '';
    this.verifiedRecord = null;
    this.recordDetails = null;
    this.disableScope = 'GSTIN';
    this.availableGstins = [];
    this.selectedGstinMap = {};
    this.verificationMessage = '';
    this.errorMessage = '';
    this.successMessage = '';
    this.verifying = false;
    this.submitting = false;
    this.showReviewModal = false;
    this.reviewSubmitting = false;
    this.reviewData = null;
    this.logoLoadFailed = false;
  }

  get pageTitle(): string {
    if (this.codeType === 'GLOBAL_CUSTOMER') {
      return 'Global Customer Code - Disable Code';
    }
    if (this.codeType === 'HANDLING_AGENT') {
      return 'Handling Agent Code - Disable Code';
    }
    return 'Disable Code';
  }

  get pageSubtitle(): string {
    if (this.codeType === 'GLOBAL_CUSTOMER') {
      return 'Verify a Global Customer Code and submit a disable request to the DBA.';
    }
    if (this.codeType === 'HANDLING_AGENT') {
      return 'Verify a Handling Agent Code and submit a disable request to the DBA.';
    }
    return 'Select a code type, verify the code, and submit a disable request to the DBA.';
  }

  get currentLogo(): string | null {
    if (this.codeType === 'GLOBAL_CUSTOMER') {
      return this.imageAssets.globalCustomerCode;
    }
    if (this.codeType === 'HANDLING_AGENT') {
      return this.imageAssets.handlingAgentCode;
    }
    return this.imageAssets.portalLogo;
  }

  get currentLogoAlt(): string {
    if (this.codeType === 'GLOBAL_CUSTOMER') {
      return 'Global Customer Code Logo';
    }
    if (this.codeType === 'HANDLING_AGENT') {
      return 'Handling Agent Code Logo';
    }
    return 'Freight Customer Code';
  }

  onLogoError(): void {
    this.logoLoadFailed = true;
  }

  onCodeTypeChange(event?: Event): void {
    if (event) {
      this.codeType = (event.target as HTMLSelectElement).value as DeleteRequestCodeType | '';
    }
    this.logoLoadFailed = false;
    this.code = '';
    this.clearVerification();
    this.submitting = false;
    this.verifying = false;
  }

  onCodeChange(event?: Event): void {
    if (event) {
      this.code = (event.target as HTMLInputElement).value.toUpperCase();
    }
    this.clearVerification();
  }

  onCompanyNameChange(event: Event): void {
    this.companyName = (event.target as HTMLInputElement).value;
  }

  getGstinList(c: any): string[] {
    const rawGstins = c?.gstinNumbers || c?.gstin;
    if (rawGstins == null || String(rawGstins).trim() === '') {
      return ['-'];
    }
    const clean = String(rawGstins).replace(/[\[\]"\s]/g, '');
    const list = clean.split(',').filter(Boolean);
    return list.length > 0 ? list : ['-'];
  }

  isCompanyNameMatched(): boolean {
    if (!this.verifiedRecord) return false;
    const entered = (this.companyName || '').trim();
    const fetched = (this.verifiedRecord.companyName || '').trim();
    return entered.length > 0 && entered === fetched;
  }

  verifyCode(): void {
    if (this.verifying || this.submitting) {
      return;
    }
    const codeType = this.codeType;
    const code = this.code.trim();
    if (!codeType) {
      this.errorMessage = 'Please select a code type.';
      return;
    }
    if (!code) {
      this.errorMessage = 'Please enter a code.';
      return;
    }

    this.clearVerification();
    this.verifying = true;
    const requestId = ++this.lookupRequestId;

    this.activeSub.add(
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
          if (requestId !== this.lookupRequestId) return;
          this.verifying = false;
        })
      ).subscribe({
        next: ({ verifyResult, details }) => {
          if (requestId !== this.lookupRequestId) return;
          if (!verifyResult || !verifyResult.found) {
            this.verificationMessage = 'This code is not present in the records, so it cannot be deleted.';
            return;
          }
          const verifiedCode = verifyResult.code || code;
          const verifiedName = details?.companyName || verifyResult.companyName || '';
          this.verifiedRecord = {
            codeType,
            code: verifiedCode,
            companyName: verifiedName
          };
          this.recordDetails = details || {
            customerCode: verifiedCode,
            code: verifiedCode,
            companyName: verifiedName
          };
          this.code = verifiedCode;

          // Populate GSTIN records with their addresses and effective dates
          let rawGstins: any[] = [];
          if (Array.isArray(verifyResult?.details) && verifyResult.details.length > 0) {
            rawGstins = verifyResult.details;
          } else if (Array.isArray(details?.gstins) && details.gstins.length > 0) {
            rawGstins = details.gstins;
          } else {
            const list = this.getGstinList(details);
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

          this.availableGstins = rawGstins.map(g => ({
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
          this.selectedGstinMap = {};
          this.availableGstins.forEach(g => {
            if (this.isGstinActive(g)) {
              this.selectedGstinMap[g.gstin] = true;
            }
          });

          this.verificationMessage = 'Code found. Please enter the exact company name shown above to confirm disabling.';
        },
        error: () => {
          if (requestId !== this.lookupRequestId) return;
          this.errorMessage = 'Unable to verify the code at this time. Please try again later.';
        }
      })
    );
  }

  sendRequest(): void {
    if (this.submitting || this.verifying || this.reviewSubmitting) {
      return;
    }
    if (!this.isCurrentVerification()) {
      this.errorMessage = 'Verify the current code before sending a disable request.';
      return;
    }
    if (!this.companyName.trim()) {
      this.errorMessage = 'Please enter the company name to confirm the request.';
      return;
    }
    if (!this.isCompanyNameMatched()) {
      this.errorMessage = 'Company name does not match the selected code. Please verify the company name.';
      return;
    }
    if (this.disableScope === 'GSTIN' && this.availableGstins.length > 0 && this.getSelectedGstins().length === 0) {
      this.errorMessage = 'Please select at least one GSTIN to disable.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    const codeTypeName = this.verifiedRecord!.codeType === 'GLOBAL_CUSTOMER' ? 'Global Customer Code' : 'Handling Agent Code';
    const selectedGstins = this.getSelectedGstins();
    const gstinsForReview = this.disableScope === 'GSTIN'
      ? this.availableGstins.filter(g => selectedGstins.includes(g.gstin))
      : this.availableGstins.filter(g => this.isGstinActive(g));

    this.reviewData = {
      operationType: 'DELETE_REQUEST',
      title: 'Review Disable Request',
      sectionName: `${codeTypeName} – Disable Request`,
      codeType: this.verifiedRecord!.codeType,
      customerCode: this.verifiedRecord!.code,
      companyName: this.companyName.trim(),
      disableScope: this.disableScope,
      deleteWarning: this.disableScope === 'GSTIN'
        ? 'Only the selected GSTIN(s) will be disabled. Other GSTINs and the company code will remain active.'
        : 'All selected records associated with this company code will be marked inactive. Historical records will be preserved.',
      deleteDetails: [
        { label: 'Record Type', value: codeTypeName },
        { label: 'Company Code', value: this.verifiedRecord!.code },
        { label: 'Company Name', value: this.companyName.trim() },
        { label: 'PAN Number', value: this.recordDetails?.panNumber || '—' },
        { label: 'Registered Address', value: this.recordDetails?.address || '—' },
        { label: 'City', value: this.recordDetails?.city || '—' },
        { label: 'PIN Code', value: this.recordDetails?.pincode || this.recordDetails?.pcoCode || '—' }
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
  }

  onReviewConfirm(): void {
    if (this.reviewSubmitting) return;
    this.reviewSubmitting = true;
    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const selectedGstins = this.disableScope === 'GSTIN' ? this.getSelectedGstins() : [];
    const request$ = (this.disableScope === 'CODE' || selectedGstins.length > 0)
      ? this.customerService.submitDeleteRequest(
          this.verifiedRecord!.codeType,
          this.verifiedRecord!.code,
          this.companyName.trim(),
          this.disableScope,
          selectedGstins
        )
      : this.customerService.submitDeleteRequest(
          this.verifiedRecord!.codeType,
          this.verifiedRecord!.code,
          this.companyName.trim()
        );

    this.activeSub.add(
      request$.pipe(
        finalize(() => {
          this.submitting = false;
          this.reviewSubmitting = false;
          this.showReviewModal = false;
        })
      ).subscribe({
        next: (result) => {
          this.successMessage = result?.message || 'Disable request sent successfully. The SQL has been sent to the DBA for execution.';
          this.verifiedRecord = null;
          this.recordDetails = null;
          this.availableGstins = [];
          this.selectedGstinMap = {};
          this.companyName = '';
          this.verificationMessage = '';
        },
        error: (error) => {
          this.errorMessage = error?.error?.message || 'Unable to send the disable request. Please try again later.';
        }
      })
    );
  }

  onReviewCancel(): void {
    if (this.reviewSubmitting) return;
    this.showReviewModal = false;
  }

  private isCurrentVerification(): boolean {
    return !!this.verifiedRecord
      && this.codeType === this.verifiedRecord.codeType
      && this.code.trim() === this.verifiedRecord.code;
  }

  isGstinActive(g: any): boolean {
    return !g?.effectiveTo && g?.active !== false;
  }

  toggleGstinSelection(gstin: string): void {
    this.selectedGstinMap[gstin] = !this.selectedGstinMap[gstin];
  }

  selectAllGstins(): void {
    this.availableGstins.forEach(g => {
      if (this.isGstinActive(g)) {
        this.selectedGstinMap[g.gstin] = true;
      }
    });
  }

  deselectAllGstins(): void {
    this.availableGstins.forEach(g => {
      this.selectedGstinMap[g.gstin] = false;
    });
  }

  getSelectedGstins(): string[] {
    return Object.keys(this.selectedGstinMap).filter(k => !!this.selectedGstinMap[k]);
  }

  private clearVerification(): void {
    this.lookupRequestId++;
    this.verifiedRecord = null;
    this.recordDetails = null;
    this.disableScope = 'GSTIN';
    this.availableGstins = [];
    this.selectedGstinMap = {};
    this.companyName = '';
    this.verificationMessage = '';
    this.errorMessage = '';
    this.successMessage = '';
  }
}
