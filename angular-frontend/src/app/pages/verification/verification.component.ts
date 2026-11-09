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
  verificationType: "customer" | "gstin" = "customer";
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

  setVerificationType(type: "customer" | "gstin" | "agent" | "ownership"): void {
    this.lookupRequestId++;
    this.verificationType = type;
    this.code = "";
    this.customers = null;
    this.error = "";
    this.verifiedSearchValue = "";
    this.loading = false;
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.code = input.value.toUpperCase();
    input.value = this.code;
  }

  getGstinList(c: any): string[] {
    const rawGstins = c?.gstinNumbers;
    if (rawGstins == null || String(rawGstins).trim() === "") {
      return ["-"];
    }
    const clean = String(rawGstins).replace(/[\[\]"\s]/g, "");
    const list = clean.split(",").filter(Boolean);
    return list.length > 0 ? list : ["-"];
  }

  verifyCode(e?: Event): void {
    if (e) e.preventDefault();
    const trimmedCode = this.code.trim().toUpperCase();
    if (!trimmedCode) {
      const field = this.verificationType === "gstin"
        ? "GSTIN"
        : this.verificationType === "agent"
          ? "Handling Agent Code or Company Name"
          : this.verificationType === "ownership"
            ? "Ownership Code or Company Name"
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
    this.cdr.markForCheck();

    const lookup$ = requestType === "gstin"
      ? this.customerService.lookupCustomerByGstinJDBC(trimmedCode)
      : requestType === "agent"
        ? this.customerService.searchHandlingAgentsJDBC(trimmedCode)
        : requestType === "ownership"
          ? this.customerService.searchOwnershipCodesJDBC(trimmedCode)
          : this.customerService.lookupOldCustomerJDBC(trimmedCode);

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
          this.error = requestType === "ownership"
            ? "No Ownership Code or Company Name found."
            : requestType === "agent"
              ? "No Handling Agent Code or Company Name found."
              : "Code not found.";
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (requestId !== this.lookupRequestId) return;
        console.error("Lookup error:", err);
        this.error = err?.error?.message || err?.message || "Code not found.";
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
        : "Global_Customer_Verification";
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
      "gstinNumbers",
      "companyName",
      "address",
      "panNumber",
      "division",
      "city",
      "creationDate"
    ];
    const allColumns = [...displayedColumns];
    records.forEach((record) => {
      Object.keys(record).forEach((key) => {
        if (!allColumns.includes(key)) allColumns.push(key);
      });
    });

    const rows = records.flatMap((record) =>
      this.getGstinList(record).map((gstin) =>
        allColumns.map((column) => {
          if (column === "customerCode") {
            return this.pdfCellValue(record.customerCode || this.verifiedSearchValue);
          }
          if (column === "gstinNumbers") return gstin;
          return this.pdfCellValue(record[column]);
        })
      )
    );

    const firstRecord = records[0] as Record<string, unknown> | undefined;
    const recordDate = (firstRecord?.['creationDate'] || firstRecord?.['date'] || firstRecord?.['createdDate'] || null) as string | Date | null;

    return {
      searchType: this.verificationType === "gstin" ? "GST Number" : "Global Customer Code",
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
    this.cdr.markForCheck();
  }
}