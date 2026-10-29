import { Component, OnInit, OnDestroy, isDevMode } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { finalize, timeout } from "rxjs/operators";
import { AuthService, RmsValidatedUserData, RmsValidateUserResponse } from "../../services/auth.service";
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

    // Restore any existing in-flight RMS authentication context from session storage
    const cachedRmsUser = this.authService.getRmsTempUser();
    if (cachedRmsUser && cachedRmsUser.userId && cachedRmsUser.designations?.length) {
      this.validatedUser = cachedRmsUser;
      this.availableDesignations = [...cachedRmsUser.designations];
      this.currentStep = 'DESIGNATION';
      if (this.availableDesignations.length === 1) {
        this.designationForm.patchValue({ designation: this.availableDesignations[0] });
      } else if (this.availableDesignations.includes('SR.DCM')) {
        this.designationForm.patchValue({ designation: 'SR.DCM' });
      }
    }
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

    if (isDevMode()) {
      console.log('[RMS Auth] Request started: validate-user for userId:', userId, 'divisionCode:', divisionCode);
    }

    this.authService.validateUser(userId, password, divisionCode).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (res: RmsValidateUserResponse) => {
        const passed = Boolean(res && res.success && res.data && Array.isArray(res.data.designations) && res.data.designations.length > 0);
        const nextStep: AuthStep = passed ? 'DESIGNATION' : 'LOGIN';

        if (isDevMode()) {
          console.log('[RMS Auth] Response received. HTTP status: 200');
          console.log('[RMS Auth] Whether the response passed validation:', passed);
          console.log('[RMS Auth] The next authentication step:', nextStep);
        }

        if (passed && res.data) {
          this.validatedUser = res.data;
          this.availableDesignations = [...res.data.designations];

          // Store temporary authentication-flow state securely
          this.authService.setRmsTempUser(res.data);

          // Advance to Designation step
          this.currentStep = 'DESIGNATION';

          // Pre-select if only 1 designation, or if SR.DCM is present
          if (this.availableDesignations.length === 1) {
            this.designationForm.patchValue({ designation: this.availableDesignations[0] });
          } else if (this.availableDesignations.includes('SR.DCM')) {
            this.designationForm.patchValue({ designation: 'SR.DCM' });
          }
          this.successMessage = res.message || "Credentials verified. Please select your designation to proceed.";
        } else {
          this.currentStep = 'LOGIN';
          if (res && res.data && (!res.data.designations || res.data.designations.length === 0)) {
            this.error = "No designations found for your account. Please contact your administrator.";
          } else {
            this.error = res?.message || "Authentication failed. Please check your credentials.";
          }
        }
      },
      error: (err: any) => {
        if (isDevMode()) {
          console.error('[RMS Auth] Caught error during validate-user:', err?.message || err);
          console.log('[RMS Auth] HTTP status:', err?.status ?? 'UNKNOWN');
          console.log('[RMS Auth] Whether the response passed validation: false');
          console.log('[RMS Auth] The next authentication step: LOGIN');
        }

        this.currentStep = 'LOGIN';
        if (err?.name === 'TimeoutError') {
          this.error = "Connection timed out while validating credentials. Please check your network connection and retry.";
        } else if (err?.status === 0) {
          this.error = "Unable to reach the authentication service. Please check your server connection and retry.";
        } else if (err?.status === 401) {
          this.error = err?.error?.message || "Invalid User ID, Password, or Division Code.";
        } else if (err?.status === 400) {
          this.error = err?.error?.message || "Invalid request. Please verify your credentials.";
        } else if (err?.status === 503) {
          this.error = err?.error?.message || "Authentication service is currently unavailable. Please try again later.";
        } else {
          this.error = err?.error?.message || err?.message || "Invalid User ID, Password, or Division Code.";
        }
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

    this.loading = true;

    if (isDevMode()) {
      console.log('[RMS Auth] Request started: select-designation for designation:', selectedDesig);
    }

    this.authService.selectDesignation(selectedDesig).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (res) => {
        const passed = Boolean(res && res.success);
        const nextStep: AuthStep = passed ? 'OTP' : 'DESIGNATION';

        if (isDevMode()) {
          console.log('[RMS Auth] Response received. HTTP status: 200');
          console.log('[RMS Auth] Whether the response passed validation:', passed);
          console.log('[RMS Auth] The next authentication step:', nextStep);
        }

        if (res && res.accessDenied) {
          this.authService.setRmsTempUser(null);
          this.router.navigate(['/access-denied']);
          return;
        }

        if (passed) {
          this.maskedDestination = res.data?.destinationMasked || 'registered mobile / email';
          this.currentStep = 'OTP';
          this.successMessage = res.message || "OTP generated and dispatched successfully.";
          this.startCooldown(30);
        } else {
          this.error = res.message || "Failed to generate OTP. Please try again.";
        }
      },
      error: (err) => {
        if (isDevMode()) {
          console.error('[RMS Auth] Caught error during select-designation:', err?.message || err);
          console.log('[RMS Auth] HTTP status:', err?.status ?? 'UNKNOWN');
        }

        if (err?.status === 403 || err?.error?.accessDenied) {
          this.authService.setRmsTempUser(null);
          this.router.navigate(['/access-denied']);
          return;
        }

        if (err?.name === 'TimeoutError') {
          this.error = "Request timed out while generating OTP. Please try again.";
        } else if (err?.status === 0) {
          this.error = "Unable to connect to the authentication server. Please retry.";
        } else {
          this.error = err?.error?.message || err?.message || "OTP generation failed. Please try again.";
        }
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

    if (isDevMode()) {
      console.log('[RMS Auth] Request started: verify-otp');
    }

    this.authService.verifyOtp(otp).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (res) => {
        const passed = Boolean(res && res.success);

        if (isDevMode()) {
          console.log('[RMS Auth] Response received. HTTP status: 200');
          console.log('[RMS Auth] Whether the response passed validation:', passed);
          console.log('[RMS Auth] The next authentication step:', passed ? 'REDIRECT' : 'OTP');
        }

        if (passed) {
          this.authService.setRmsTempUser(null);
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
        if (isDevMode()) {
          console.error('[RMS Auth] Caught error during verify-otp:', err?.message || err);
          console.log('[RMS Auth] HTTP status:', err?.status ?? 'UNKNOWN');
        }

        if (err?.name === 'TimeoutError') {
          this.error = "Request timed out while verifying OTP. Please try again.";
        } else if (err?.status === 0) {
          this.error = "Unable to connect to the server. Please try again.";
        } else if (err?.status === 401) {
          this.error = err?.error?.message || "Invalid OTP. Please enter the valid OTP.";
        } else {
          this.error = err?.error?.message || err?.message || "Invalid OTP. Please enter the valid OTP.";
        }
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

    this.authService.resendOtp().pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (res) => {
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
    this.authService.setRmsTempUser(null);
    this.loading = false;
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
