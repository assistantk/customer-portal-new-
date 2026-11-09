import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { catchError, finalize, filter, map, of, Subscription, switchMap } from 'rxjs';
import { CustomerService, DeleteRequestCodeType } from '../../services/customer.service';
import { IMAGE_ASSETS } from '../../config/image-assets';

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
  verificationMessage = '';
  errorMessage = '';
  successMessage = '';
  verifying = false;
  submitting = false;
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
    this.verificationMessage = '';
    this.errorMessage = '';
    this.successMessage = '';
    this.verifying = false;
    this.submitting = false;
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
    return 'Freight Code Generator';
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
          this.verificationMessage = 'Code found. Please enter the exact company name shown above to confirm deletion.';
        },
        error: () => {
          if (requestId !== this.lookupRequestId) return;
          this.errorMessage = 'Unable to verify the code at this time. Please try again later.';
        }
      })
    );
  }

  sendRequest(): void {
    if (this.submitting || this.verifying) {
      return;
    }
    if (!this.isCurrentVerification()) {
      this.errorMessage = 'Verify the current code before sending a delete request.';
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

    this.errorMessage = '';
    this.successMessage = '';
    this.submitting = true;
    this.activeSub.add(
      this.customerService.submitDeleteRequest(
        this.verifiedRecord!.codeType,
        this.verifiedRecord!.code,
        this.companyName.trim()
      ).pipe(
        finalize(() => this.submitting = false)
      ).subscribe({
        next: (result) => {
          this.successMessage = result?.message || 'Delete request sent successfully. The SQL has been sent to the DBA for execution.';
          this.verifiedRecord = null;
          this.recordDetails = null;
          this.companyName = '';
          this.verificationMessage = '';
        },
        error: (error) => {
          this.errorMessage = error?.error?.message || 'Unable to send the delete request. Please try again later.';
        }
      })
    );
  }

  private isCurrentVerification(): boolean {
    return !!this.verifiedRecord
      && this.codeType === this.verifiedRecord.codeType
      && this.code.trim() === this.verifiedRecord.code;
  }

  private clearVerification(): void {
    this.lookupRequestId++;
    this.verifiedRecord = null;
    this.recordDetails = null;
    this.companyName = '';
    this.verificationMessage = '';
    this.errorMessage = '';
    this.successMessage = '';
  }
}
