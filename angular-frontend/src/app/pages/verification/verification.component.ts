import { PdfGeneratorService, VerificationPdfData } from '../../services/pdf-generator.service';
import { Component, OnInit, ChangeDetectorRef } from "@angular/core";
import { FormBuilder, FormGroup } from "@angular/forms";
import { finalize } from "rxjs";
import { CustomerService } from "../../services/customer.service";

@Component({
  selector: "app-verification",
  standalone: false,
  templateUrl: "./verification.component.html",
  styleUrls: ["./verification.component.css"]
})
export class VerificationComponent implements OnInit {
  verificationType: "customer" | "gstin" = "customer";
  code = "";
  loading = false;
  customers: any[] | null = null;
  error = "";
  verifiedSearchValue = "";
  private lookupRequestId = 0;

  constructor(
    private customerService: CustomerService,
    private cdr: ChangeDetectorRef,
    private pdfGeneratorService?: PdfGeneratorService
  ) {}

  ngOnInit(): void {}

  setVerificationType(type: "customer" | "gstin"): void {
    this.lookupRequestId++;
    this.verificationType = type;
    this.code = "";
    this.customers = null;
    this.error = "";
    this.verifiedSearchValue = "";
    this.loading = false;
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
    const trimmedCode = this.code.trim();
    if (!trimmedCode) {
      this.error = `Please enter a ${this.verificationType === "gstin" ? "GSTIN" : "Customer Code"}.`;
      return;
    }

    this.loading = true;
    this.error = "";
    this.customers = null;
    this.verifiedSearchValue = "";
    const requestId = ++this.lookupRequestId;
    const requestType = this.verificationType;
    this.cdr.markForCheck();

    if (requestType === "gstin") {
      this.customerService.lookupCustomerByGstinJDBC(trimmedCode).pipe(
        finalize(() => {
          if (requestId !== this.lookupRequestId) return;
          this.loading = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (data) => {
          if (requestId !== this.lookupRequestId) return;
          this.customers = (Array.isArray(data) ? data : data == null ? [] : [data])
            .filter((record) => record != null && typeof record === "object");
          if (this.customers.length > 0) this.verifiedSearchValue = trimmedCode;
          this.cdr.markForCheck();
        },
        error: (err) => {
          if (requestId !== this.lookupRequestId) return;
          console.error("Lookup error:", err);
          this.error = err?.error?.message || err?.message || "Code not found.";
          this.cdr.markForCheck();
        }
      });
    } else {
      this.customerService.lookupOldCustomerJDBC(trimmedCode).pipe(
        finalize(() => {
          if (requestId !== this.lookupRequestId) return;
          this.loading = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (data) => {
          if (requestId !== this.lookupRequestId) return;
          this.customers = data != null && typeof data === "object" ? [data] : [];
          if (this.customers.length > 0) this.verifiedSearchValue = trimmedCode;
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

    return {
      searchType: this.verificationType === "gstin" ? "GST Number" : "Global Customer Code",
      searchValue: this.verifiedSearchValue,
      columns: allColumns,
      rows,
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