import { Component, Input, Output, EventEmitter } from '@angular/core';

export type ReviewOperationType =
  | 'NEW_ENTRY'
  | 'UPDATE_CODE'
  | 'DELETE_REQUEST'
  | 'OWNERSHIP_NEW'
  | 'OWNERSHIP_UPDATE'
  | 'OWNERSHIP_DELETE';

export interface FieldComparison {
  field: string;
  existingValue: string;
  newValue: string;
}

export interface ReviewGstinItem {
  gstin: string;
  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  newEffectiveTo?: string | null;
  action?: string;
}

export interface ReviewGstinAddressUpdate {
  gstin: string;
  field: string;
  existingValue: string;
  newValue: string;
}

export interface ReviewOwnershipSection {
  title: string;
  operation: 'NEW' | 'UPDATE';
  code: string;
  address: string;
  partyCode?: string;
  partyAddress?: string;
  existingAddress?: string;
  newAddress?: string;
  table: string;
}

export interface ReviewModalData {
  operationType: ReviewOperationType;
  title: string; // e.g. "Review New Entry", "Review Update Request", "Review Delete Request", "Review Ownership Request"
  sectionName: string; // e.g. "Global Customer Code – New Entry", "Handling Agent Code – Update Code"
  codeType?: string; // 'GLOBAL' | 'HANDLING_AGENT' | 'OWNERSHIP'

  // Common Header Information
  customerCode?: string;
  companyName?: string;
  panNumber?: string;

  // New Entry Specific Information:
  recordDetails?: Array<{ label: string; value: string }>;
  gstinList?: ReviewGstinItem[];

  // Update Code Specific Information:
  fieldChanges?: FieldComparison[];
  addedGstins?: ReviewGstinItem[];
  updatedGstinAddresses?: ReviewGstinAddressUpdate[];
  removedGstins?: ReviewGstinItem[];
  parentUnchangedNotice?: string;

  // Delete / Disable Request Specific Information:
  disableScope?: 'CODE' | 'GSTIN';
  deleteWarning?: string;
  deleteDetails?: Array<{ label: string; value: string }>;
  deleteGstins?: ReviewGstinItem[];

  // Ownership Specific Information:
  ownershipSection1?: ReviewOwnershipSection;
  ownershipSection2?: ReviewOwnershipSection;
}

@Component({
  selector: 'app-review-modal',
  standalone: false,
  templateUrl: './review-modal.component.html',
  styleUrls: ['./review-modal.component.css']
})
export class ReviewModalComponent {
  @Input() isOpen = false;
  @Input() loading = false;
  @Input() data: ReviewModalData | null = null;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm(): void {
    if (this.loading) return;
    this.confirm.emit();
  }

  onCancel(): void {
    if (this.loading) return;
    this.cancel.emit();
  }

  get isDelete(): boolean {
    return this.data?.operationType === 'DELETE_REQUEST' || this.data?.operationType === 'OWNERSHIP_DELETE';
  }

  get isUpdate(): boolean {
    return this.data?.operationType === 'UPDATE_CODE' || this.data?.operationType === 'OWNERSHIP_UPDATE';
  }

  get isNew(): boolean {
    return this.data?.operationType === 'NEW_ENTRY' || this.data?.operationType === 'OWNERSHIP_NEW';
  }

  get isOwnership(): boolean {
    return this.data?.operationType === 'OWNERSHIP_NEW' || this.data?.operationType === 'OWNERSHIP_UPDATE' || this.data?.operationType === 'OWNERSHIP_DELETE';
  }
}
