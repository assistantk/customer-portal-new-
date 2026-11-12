import { PdfGeneratorService, VerificationPdfData } from '../../services/pdf-generator.service';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { finalize, filter, Subscription } from "rxjs";
import { CustomerService } from "../../services/customer.service";

@Component({
  selector: "app-verification",
  standalone: false,
  templateUrl: "./verification.component.html",
  styleUrls: ["./verification.component.css"]
})
export class VerificationComponent implements OnInit, OnDestroy {
  verificationType: "customer" | "gstin" | "agent" | "ownership" = "customer";
  searchMode: "CODE" | "NAME" = "CODE";
  code = "";
  loading = false;
  customers: any[] | null = null;
  error = "";
  verifiedSearchValue = "";
  private lookupRequestId = 0;
  private routerEventsSubscription?: Subscription;

  constructor(
    private customerService: CustomerService,
    private cdr: ChangeDetectorRef,
    private pdfGeneratorService?: PdfGeneratorService,
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
    this.routerEventsSubscription?.unsubscribe();
  }

  setSearchMode(mode: "CODE" | "NAME"): void {
    if (this.searchMode === mode) return;
    this.searchMode = mode;
    this.code = "";
    this.customers = null;
    this.error = "";
    this.verifiedSearchValue = "";
    this.loading = false;
    this.lookupRequestId++;
    this.cdr.markForCheck();
  }

  setVerificationType(type: "customer" | "gstin" | "agent" | "ownership"): void {
    this.lookupRequestId++;
    this.verificationType = type;
    this.searchMode = "CODE";
    this.code = "";
    this.customers = null;
    this.error = "";
    this.verifiedSearchValue = "";
    this.loading = false;
    this.cdr.markForCheck();
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.code = input.value.toUpperCase();
    input.value = this.code;
  }

  getGstinList(c: any): string[] {
    return this.getGstinDetails(c).map((detail) => detail.gstin);
  }

  getGstinDetails(record: any): Array<{
    gstin: string;
    address?: string;
    city?: string;
    pincode?: string;
    implementationDate?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
  }> {
    if (Array.isArray(record?.gstins) && record.gstins.length > 0) {
      return record.gstins
        .filter((detail: any) => detail && typeof detail === "object")
        .map((detail: any) => ({
          gstin: String(detail.gstin || "-"),
          address: detail.address,
          city: detail.city,
          pincode: detail.pincode,
          implementationDate: detail.implementationDate,
          effectiveFrom: detail.effectiveFrom,
          effectiveTo: detail.effectiveTo
        }));
    }

    const rawGstins = String(record?.gstinNumbers || "").replace(/[\[\]"\s]/g, "");
    const gstins = rawGstins.split(",").filter(Boolean);
    return (gstins.length > 0 ? gstins : ["-"]).map((gstin) => ({ gstin }));
  }

  verifyCode(e?: Event): void {
    if (e) e.preventDefault();
    const trimmedCode = this.code.trim().toUpperCase();
    if (!trimmedCode) {
      const field = this.verificationType === "gstin"
        ? "GSTIN"
        : this.searchMode === "NAME"
          ? "Company Name"
          : this.verificationType === "agent"
            ? "Handling Agent Code"
            : this.verificationType === "ownership"
              ? "Ownership Code"
              : "Customer Code";
      this.error = `Please enter a ${field}.`;
      return;
    }

    this.loading = true;
    this.error = "";
    this.customers = null;
    this.verifiedSearchValue = "";
    const requestId = ++this.lookupRequestId;
    const requestType = this.verificationType;
    const currentMode = this.searchMode;
    this.cdr.markForCheck();

    const lookup$ = requestType === "gstin"
      ? this.customerService.lookupCustomerByGstinJDBC(trimmedCode)
      : requestType === "agent"
        ? this.customerService.searchHandlingAgentsJDBC(trimmedCode, currentMode)
        : requestType === "ownership"
          ? this.customerService.searchOwnershipCodesJDBC(trimmedCode, currentMode)
          : this.customerService.lookupOldCustomerJDBC(trimmedCode, currentMode);

    lookup$.pipe(
      finalize(() => {
        if (requestId !== this.lookupRequestId) return;
        this.loading = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (data) => {
        if (requestId !== this.lookupRequestId) return;
        const records = Array.isArray(data) ? data : data == null ? [] : [data];
        this.customers = records.filter((record) => record != null && typeof record === "object");
        if (this.customers.length > 0) {
          this.verifiedSearchValue = trimmedCode;
        } else {
          if (requestType === "ownership") {
            this.error = currentMode === "NAME"
              ? "No Ownership Company Name found."
              : "No Ownership Code found.";
          } else if (requestType === "agent") {
            this.error = currentMode === "NAME"
              ? "No Handling Agent Company Name found."
              : "No Handling Agent Code found.";
          } else {
            this.error = currentMode === "NAME"
              ? "No record found for this Company Name."
              : "Code not found.";
          }
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (requestId !== this.lookupRequestId) return;
        console.error("Lookup error:", err);
        this.error = err?.error?.message || err?.message || (currentMode === "NAME" ? "No record found for this Company Name." : "Code not found.");
        this.cdr.markForCheck();
      }
    });
  }

  getHandlingAgentCodes(customer: any): string[] {
    const codes: unknown[] = Array.isArray(customer?.handlingAgentCodes) ? customer.handlingAgentCodes : [];
    return Array.from(new Set<string>(codes
      .filter((code): code is string => typeof code === "string")
      .map((code) => code.trim())
      .filter((code) => Boolean(code))));
  }

  get hasVerificationResults(): boolean {
    return !!this.customers?.length && !!this.verifiedSearchValue && !this.loading;
  }

  printVerificationPreview(): void {
    if (!this.hasVerificationResults) return;
    if (!this.pdfGeneratorService) {
      this.error = "PDF generation is unavailable.";
      return;
    }

    try {
      this.pdfGeneratorService.previewVerificationPdf(this.createVerificationPdfData());
      this.error = "";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Unable to open the PDF preview.";
    }
    this.cdr.markForCheck();
  }

  downloadVerificationPdf(): void {
    if (!this.hasVerificationResults) return;
    if (!this.pdfGeneratorService) {
      this.error = "PDF generation is unavailable.";
      return;
    }

    try {
      const data = this.createVerificationPdfData();
      const prefix = this.verificationType === "gstin"
        ? "GST_Verification"
        : this.verificationType === "agent"
          ? (this.searchMode === "NAME" ? "Handling_Agent_Name_Verification" : "Handling_Agent_Verification")
          : this.verificationType === "ownership"
            ? (this.searchMode === "NAME" ? "Ownership_Name_Verification" : "Ownership_Verification")
            : (this.searchMode === "NAME" ? "Global_Customer_Name_Verification" : "Global_Customer_Verification");
      const safeValue = this.verifiedSearchValue
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
        .replace(/\s+/g, "_");
      this.pdfGeneratorService.downloadVerificationPdf(data, `${prefix}_${safeValue}.pdf`);
      this.error = "";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Unable to download the verification PDF.";
    }
    this.cdr.markForCheck();
  }

  private createVerificationPdfData(): VerificationPdfData {
    const records = (this.customers || []).filter((record) => record != null && typeof record === "object");
    const displayedColumns = [
      "customerCode",
      "gstin",
      "companyName",
      "address",
      "city",
      "pincode",
      "panNumber",
      "division",
      "implementationDate",
      "effectiveFrom",
      "effectiveTo"
    ];
    const allColumns = [...displayedColumns];
    records.forEach((record) => {
      Object.keys(record).forEach((key) => {
        if (key !== "gstins" && key !== "gstinNumbers" && key !== "creationDate" && !allColumns.includes(key)) {
          allColumns.push(key);
        }
      });
    });

    const rows = records.flatMap((record) =>
      this.getGstinDetails(record).map((detail) =>
        allColumns.map((column) => {
          if (column === "customerCode") {
            return this.pdfCellValue(
              record.customerCode || record.code || record.ownershipCode
                || (this.searchMode === "CODE" ? this.verifiedSearchValue : "-")
            );
          }
          if (column === "gstin" || column === "address" || column === "city" || column === "pincode"
              || column === "implementationDate" || column === "effectiveFrom" || column === "effectiveTo") {
            return this.pdfCellValue(detail[column as keyof typeof detail]);
          }
          return this.pdfCellValue(record[column]);
        })
      )
    );

    const firstRecord = records[0] as Record<string, unknown> | undefined;
    const firstDetail = firstRecord ? this.getGstinDetails(firstRecord)[0] : undefined;
    const hasDetailRecords = Array.isArray(firstRecord?.['gstins']) && firstRecord['gstins'].length > 0;
    const recordDate = (firstDetail?.implementationDate || firstDetail?.effectiveFrom
      || (!hasDetailRecords
        ? firstRecord?.['creationDate'] || firstRecord?.['date'] || firstRecord?.['createdDate'] || null
        : null)) as string | Date | null;

    return {
      searchType: this.verificationType === "gstin"
        ? "GST Number"
        : this.searchMode === "NAME"
          ? "Company Name"
          : this.verificationType === "agent"
            ? "Handling Agent Code"
            : this.verificationType === "ownership"
              ? "Ownership Code"
              : "Global Customer Code",
      searchValue: this.verifiedSearchValue,
      columns: allColumns,
      rows,
      recordDate,
      generatedAt: new Date()
    };
  }

  private pdfCellValue(value: unknown): string {
    if (value == null || value === "") return "-";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value) ?? "-";
  }

  reset(): void {
    this.lookupRequestId++;
    this.code = "";
    this.customers = null;
    this.error = "";
    this.verifiedSearchValue = "";
    this.loading = false;
    this.searchMode = "CODE";
    this.cdr.markForCheck();
  }
}