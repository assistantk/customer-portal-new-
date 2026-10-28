import { Component, OnInit, OnDestroy } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { AuthService, RmsValidatedUserData } from "../../services/auth.service";
import { isValidDivisionCode, getDivisionDetails, RAILWAY_DIVISIONS } from "../../utils/division-codes";

export type AuthStep = 'LOGIN' | 'DESIGNATION' | 'OTP';

@Component({
  selector: "app-login",
  standalone: false,
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.css"]
})
export class LoginComponent implements OnInit, OnDestroy {
  currentStep: AuthStep = 'LOGIN';

  // Step 1: Login Form
  loginForm!: FormGroup;
  showPassword = false;
  readonly divisionSuggestions = RAILWAY_DIVISIONS;

  // Step 2: Designation Selection
  designationForm!: FormGroup;
  validatedUser: RmsValidatedUserData | null = null;
  availableDesignations: string[] = [];

  // Step 3: OTP Verification
  otpForm!: FormGroup;
  maskedDestination = '';
  resendCooldown = 0;
  private cooldownInterval: any = null;

  // Global UI State
  loading = false;
  error = '';
  successMessage = '';
  returnUrl = '/registration';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Step 1 Form: User ID, Password, Division Code
    this.loginForm = this.fb.group({
      userId: ["", [Validators.required, Validators.pattern(/^[A-Za-z0-9_.-]+$/)]],
      password: ["", Validators.required],
      divisionCode: ["", Validators.required]
    });

    // Step 2 Form: Designation
    this.designationForm = this.fb.group({
      designation: ["", Validators.required]
    });

    // Step 3 Form: OTP
    this.otpForm = this.fb.group({
      otp: ["", [Validators.required, Validators.pattern(/^[0-9]{4,8}$/)]]
    });

    const qUrl = this.route.snapshot.queryParams['returnUrl'];
    this.returnUrl = qUrl ? qUrl : '/registration';
  }

  ngOnDestroy(): void {
    this.clearCooldownTimer();
  }

  // ─────────────────────────────────────────────────────────────
  // Step 1: Login Submission (User ID, Password, Division Code)
  // ─────────────────────────────────────────────────────────────

  onSubmitLogin(): void {
    this.error = "";
    this.successMessage = "";

    if (this.loginForm.invalid) {
      if (this.loginForm.get('userId')?.hasError('required')) {
        this.error = "Please enter your User ID.";
        return;
      }
      if (this.loginForm.get('password')?.hasError('required')) {
        this.error = "Please enter your password.";
        return;
      }
      if (this.loginForm.get('divisionCode')?.hasError('required')) {
        this.error = "Please enter your Division Code.";
        return;
      }
    }

    const userId = (this.loginForm.get('userId')?.value || '').trim();
    const password = this.loginForm.get('password')?.value || '';
    const divisionCode = (this.loginForm.get('divisionCode')?.value || '').trim().toUpperCase();

    // Client-side division validation against verified Indian Railways division codes
    if (!isValidDivisionCode(divisionCode)) {
      this.error = `Invalid Division Code '${divisionCode}'. Please enter a recognized Indian Railways division code (e.g., TKD, NGP, CSTM, DLI, BSL).`;
      return;
    }

    this.loading = true;
    this.authService.validateUser(userId, password, divisionCode).subscribe({
      next: (res) => {
        this.loading = false;
        if (res && res.success && res.data) {
          this.validatedUser = res.data;
          this.availableDesignations = res.data.designations || [];

          if (this.availableDesignations.length === 0) {
            this.error = "No designations found for your account. Please contact your administrator.";
            return;
          }

          // Move to Step 2
          this.currentStep = 'DESIGNATION';
          // Pre-select if only 1 designation, or if SR.DCM is present
          if (this.availableDesignations.length === 1) {
            this.designationForm.patchValue({ designation: this.availableDesignations[0] });
          } else if (this.availableDesignations.includes('SR.DCM')) {
            this.designationForm.patchValue({ designation: 'SR.DCM' });
          }
          this.successMessage = "Credentials verified. Please select your designation to proceed.";
        } else {
          this.error = res.message || "Authentication failed. Please check your credentials.";
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || err?.message || "Invalid User ID, Password, or Division Code.";
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Step 2: Designation Selection & Trigger OTP
  // ─────────────────────────────────────────────────────────────

  onSubmitDesignation(): void {
    this.error = "";
    this.successMessage = "";

    const selectedDesig = (this.designationForm.get('designation')?.value || '').trim();
    if (!selectedDesig) {
      this.error = "Please select a designation.";
      return;
    }

    // Client-side check: if user picked non-SR.DCM, route immediately to access-denied
    if (selectedDesig.toUpperCase() !== 'SR.DCM') {
      this.router.navigate(['/access-denied']);
      return;
    }

    this.loading = true;
    this.authService.selectDesignation(selectedDesig).subscribe({
      next: (res) => {
        this.loading = false;
        if (res && res.accessDenied) {
          this.router.navigate(['/access-denied']);
          return;
        }

        if (res && res.success) {
          this.maskedDestination = res.data?.destinationMasked || 'registered mobile / email';
          this.currentStep = 'OTP';
          this.successMessage = res.message || "OTP generated and dispatched successfully.";
          this.startCooldown(30);
        } else {
          this.error = res.message || "Failed to generate OTP. Please try again.";
        }
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 403 || err?.error?.accessDenied) {
          this.router.navigate(['/access-denied']);
          return;
        }
        this.error = err?.error?.message || err?.message || "OTP generation failed. Please try again.";
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Step 3: OTP Verification
  // ─────────────────────────────────────────────────────────────

  onSubmitOtp(): void {
    this.error = "";
    this.successMessage = "";

    const otp = (this.otpForm.get('otp')?.value || '').trim();
    if (!otp) {
      this.error = "Please enter the OTP received on your mobile / email.";
      return;
    }

    this.loading = true;
    this.authService.verifyOtp(otp).subscribe({
      next: (res) => {
        this.loading = false;
        if (res && res.success) {
          this.successMessage = "Authentication successful! Redirecting to portal...";
          this.clearCooldownTimer();
          setTimeout(() => {
            this.router.navigateByUrl(this.returnUrl);
          }, 300);
        } else {
          this.error = res.message || "OTP verification failed. Please try again.";
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || err?.message || "Invalid OTP. Please enter the valid OTP.";
      }
    });
  }

  resendOtp(): void {
    if (this.resendCooldown > 0 || this.loading) {
      return;
    }

    this.error = "";
    this.successMessage = "";
    this.loading = true;

    this.authService.resendOtp().subscribe({
      next: (res) => {
        this.loading = false;
        if (res && res.success) {
          this.successMessage = "A new OTP has been dispatched to your registered contact.";
          if (res.data?.destinationMasked) {
            this.maskedDestination = res.data.destinationMasked;
          }
          this.startCooldown(30);
        } else {
          this.error = res.message || "Failed to resend OTP. Please try again.";
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || err?.message || "Unable to resend OTP. Please try again.";
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  restartLogin(): void {
    this.clearCooldownTimer();
    this.currentStep = 'LOGIN';
    this.error = '';
    this.successMessage = '';
    this.validatedUser = null;
    this.availableDesignations = [];
    this.loginForm.reset({ userId: '', password: '', divisionCode: '' });
    this.designationForm.reset({ designation: '' });
    this.otpForm.reset({ otp: '' });
  }

  getDivisionHelpText(): string {
    const code = (this.loginForm?.get('divisionCode')?.value || '').trim().toUpperCase();
    if (!code) return '';
    const details = getDivisionDetails(code);
    return details ? `${details.name} • ${details.zone}` : '';
  }

  private startCooldown(seconds: number): void {
    this.clearCooldownTimer();
    this.resendCooldown = seconds;
    this.cooldownInterval = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        this.clearCooldownTimer();
      }
    }, 1000);
  }

  private clearCooldownTimer(): void {
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
      this.cooldownInterval = null;
    }
  }
}