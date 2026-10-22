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

  constructor(
    private customerService: CustomerService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  setVerificationType(type: "customer" | "gstin"): void {
    this.verificationType = type;
    this.code = "";
    this.customers = null;
    this.error = "";
  }

  getGstinList(c: any): string[] {
    if (!c.gstinNumbers || c.gstinNumbers.trim() === "") {
      return ["-"];
    }
    const clean = c.gstinNumbers.replace(/[\[\]"\s]/g, "");
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
    this.cdr.markForCheck();

    if (this.verificationType === "gstin") {
      this.customerService.lookupCustomerByGstinJDBC(trimmedCode).pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (data) => {
          this.customers = Array.isArray(data) ? data : [data];
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error("Lookup error:", err);
          this.error = err?.error?.message || err?.message || "Code not found.";
          this.cdr.markForCheck();
        }
      });
    } else {
      this.customerService.lookupOldCustomerJDBC(trimmedCode).pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (data) => {
          this.customers = [data];
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error("Lookup error:", err);
          this.error = err?.error?.message || err?.message || "Code not found.";
          this.cdr.markForCheck();
        }
      });
    }
  }

  reset(): void {
    this.code = "";
    this.customers = null;
    this.error = "";
    this.loading = false;
    this.cdr.markForCheck();
  }
}