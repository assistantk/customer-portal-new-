import { Component } from '@angular/core';
import { finalize } from 'rxjs';
import { CustomerService, DeleteRequestCodeType } from '../../services/customer.service';

@Component({
  selector: 'app-delete-request',
  standalone: false,
  templateUrl: './delete-request.component.html',
  styleUrls: ['./delete-request.component.css']
})
export class DeleteRequestComponent {
  codeType: DeleteRequestCodeType | '' = '';
  code = '';
  companyName = '';
  verifiedRecord: { codeType: DeleteRequestCodeType; code: string; companyName: string } | null = null;
  verificationMessage = '';
  errorMessage = '';
  successMessage = '';
  verifying = false;
  submitting = false;
  logoLoadFailed = false;

  constructor(private customerService: CustomerService) {}

  get pageTitle(): string {
    if (this.codeType === 'GLOBAL_CUSTOMER') {
      return 'Global Customer Code Deletion Request';
    }
    if (this.codeType === 'HANDLING_AGENT') {
      return 'Handling Agent Code Deletion Request';
    }
    return 'Delete Request';
  }

  get pageSubtitle(): string {
    if (this.codeType === 'GLOBAL_CUSTOMER') {
      return 'Verify a Global Customer Code and submit a deletion request to the DBA.';
    }
    if (this.codeType === 'HANDLING_AGENT') {
      return 'Verify a Handling Agent Code and submit a deletion request to the DBA.';
    }
    return 'Select a code type, verify the code, and submit a deletion request to the DBA.';
  }

  get currentLogo(): string | null {
    if (this.codeType === 'GLOBAL_CUSTOMER') {
      return 'assets/glbl_transparent.png';
    }
    if (this.codeType === 'HANDLING_AGENT') {
      return 'assets/handling_agent_code_transparent.png';
    }
    return null;
  }

  get currentLogoAlt(): string {
    if (this.codeType === 'GLOBAL_CUSTOMER') {
      return 'Global Customer Code Logo';
    }
    if (this.codeType === 'HANDLING_AGENT') {
      return 'Handling Agent Code Logo';
    }
    return '';
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
    this.companyName = '';
    this.verifiedRecord = null;
    this.verificationMessage = '';
    this.errorMessage = '';
    this.successMessage = '';
    this.submitting = false;
    this.verifying = false;
  }

  onCodeChange(event?: Event): void {
    if (event) {
      this.code = (event.target as HTMLInputElement).value;
    }
    this.clearVerification();
  }

  onCompanyNameChange(event: Event): void {
    this.companyName = (event.target as HTMLInputElement).value;
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
    this.customerService.verifyDeleteRequest(codeType, code).pipe(
      finalize(() => this.verifying = false)
    ).subscribe({
      next: (result) => {
        if (!result.found) {
          this.verificationMessage = 'This code is not present in the records, so it cannot be deleted.';
          return;
        }
        const verifiedCode = result.code || code;
        const verifiedName = result.companyName || '';
        this.verifiedRecord = {
          codeType,
          code: verifiedCode,
          companyName: verifiedName
        };
        this.code = verifiedCode;
        this.verificationMessage = 'Code found. Please enter the company name to confirm the deletion.';
      },
      error: () => {
        this.errorMessage = 'Unable to verify the code at this time. Please try again later.';
      }
    });
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
    if (this.companyName.trim().toLowerCase() !== this.verifiedRecord!.companyName.trim().toLowerCase()) {
      this.errorMessage = 'Company name does not match the selected code. Please verify the company name.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.submitting = true;
    this.customerService.submitDeleteRequest(
      this.verifiedRecord!.codeType,
      this.verifiedRecord!.code,
      this.companyName
    ).pipe(
      finalize(() => this.submitting = false)
    ).subscribe({
      next: (result) => {
        this.successMessage = result?.message || 'Delete request sent successfully. The SQL has been sent to the DBA for execution.';
        this.verifiedRecord = null;
        this.companyName = '';
        this.verificationMessage = '';
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'Unable to send the delete request. Please try again later.';
      }
    });
  }

  private isCurrentVerification(): boolean {
    return !!this.verifiedRecord
      && this.codeType === this.verifiedRecord.codeType
      && this.code.trim() === this.verifiedRecord.code;
  }

  private clearVerification(): void {
    this.verifiedRecord = null;
    this.companyName = '';
    this.verificationMessage = '';
    this.errorMessage = '';
    this.successMessage = '';
  }
}
