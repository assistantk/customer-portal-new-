import { Component, OnInit, OnDestroy, ChangeDetectorRef, isDevMode } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { merge, Subscription } from "rxjs";
import { finalize, timeout } from "rxjs/operators";
import { AuthService, RmsValidatedUserData, RmsValidateUserResponse } from "../../services/auth.service";
import { isValidDivisionCode, getDivisionDetails, RAILWAY_DIVISIONS } from "../../utils/division-codes";

export type AuthStep = 'LOGIN' | 'DESIGNATION' | 'OTP';
const OTP_RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: "app-login",
  standalone: false,
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.css"]
})
export class LoginComponent implements OnInit, OnDestroy {
  currentStep: AuthStep = 'LOGIN';
  loadingOperation: 'LOGIN' | 'DESIGNATION' | 'RESEND' | 'REGENERATE' | 'VERIFY' | null = null;

  // Step 1: Login Form
  loginForm!: FormGroup;
  showPassword = false;
  readonly divisionSuggestions = RAILWAY_DIVISIONS;
  captchaImage = '';
  captchaError = '';

  // Step 2: Designation Selection
  designationForm!: FormGroup;
  validatedUser: RmsValidatedUserData | null = null;
  availableDesignations: string[] = [];

  // Step 3: OTP Verification
  otpForm!: FormGroup;
  maskedDestination = '';
  resendCooldown = 0;
  private cooldownInterval: ReturnType<typeof setInterval> | null = null;
  private credentialChangeSubscription?: Subscription;

  // Global UI State
  loading = false;
  error = '';
  successMessage = '';
  returnUrl = '/registration';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Step 1 Form: User ID, Password, Division Code
    this.loginForm = this.fb.group({
      userId: ["", Validators.required],
      password: ["", Validators.required],
      divisionCode: ["", Validators.required],
      captchaInput: ["", Validators.required]
    });

    // Step 2 Form: Designation
    this.designationForm = this.fb.group({
      designation: ["", Validators.required]
    });

    // Step 3 Form: OTP
    this.otpForm = this.fb.group({
      otp: ["", [Validators.required, Validators.pattern(/^[0-9]{5}$/)]]
    });

    const qUrl = this.route.snapshot.queryParams['returnUrl'];
    this.returnUrl = qUrl ? qUrl : '/registration';

    this.credentialChangeSubscription = merge(
      this.loginForm.get('userId')!.valueChanges,
      this.loginForm.get('password')!.valueChanges,
      this.loginForm.get('divisionCode')!.valueChanges
    ).subscribe(() => {
      if (this.currentStep !== 'LOGIN') {
        this.resetFlowAfterCredentialChange();
      }
    });

    this.authService.setRmsTempUser(null);
    this.loadCaptcha();
    this.checkPendingOtpStatus();
  }

  ngOnDestroy(): void {
    this.clearCooldownTimer();
    this.credentialChangeSubscription?.unsubscribe();
  }

  // ─────────────────────────────────────────────────────────────
  // Step 1: Login Submission (User ID, Password, Division Code)
  // ─────────────────────────────────────────────────────────────

  onSubmitLogin(): void {
    if (this.currentStep !== 'LOGIN') {
      return;
    }

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
      if (this.loginForm.get('captchaInput')?.hasError('required')) {
        this.error = "Please enter the CAPTCHA shown.";
        return;
      }
    }

    const userId = (this.loginForm.get('userId')?.value || '').trim();
    const password = this.loginForm.get('password')?.value || '';
    const divisionCode = (this.loginForm.get('divisionCode')?.value || '').trim().toUpperCase();
    const captchaInput = (this.loginForm.get('captchaInput')?.value || '').trim();

    // Client-side division validation against verified Indian Railways division codes
    if (!isValidDivisionCode(divisionCode)) {
      this.error = `Invalid Division Code '${divisionCode}'. Please enter a recognized Indian Railways division code (e.g., TKD, NGP, CSTM, DLI, BSL).`;
      return;
    }

    this.loading = true;
    this.loadingOperation = 'LOGIN';

    if (isDevMode()) {
      console.log('[RMS Auth] Request started: validate-user for userId:', userId, 'divisionCode:', divisionCode);
    }

    this.authService.validateUser(userId, password, divisionCode, captchaInput).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
        this.loadingOperation = null;
        this.loginForm.patchValue({ password: '', captchaInput: '' }, { emitEvent: false });
        if (this.currentStep === 'LOGIN') {
          this.loadCaptcha();
        }
        this.cdr.markForCheck();
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

          this.designationForm.reset({ designation: '' });
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

    if (this.currentStep !== 'DESIGNATION') {
      return;
    }

    const selectedDesig = (this.designationForm.get('designation')?.value || '').trim();
    if (!selectedDesig) {
      this.error = "Please select a designation.";
      return;
    }
    if (!this.availableDesignations.some((designation) => designation.toLowerCase() === selectedDesig.toLowerCase())) {
      this.error = "The selected designation is not permitted for this account.";
      return;
    }

    this.loading = true;
    this.loadingOperation = 'DESIGNATION';

    if (isDevMode()) {
      console.log('[RMS Auth] Designation selected:', selectedDesig);
      console.log('[RMS Auth] Automatically executing both Generate OTP and Regenerate OTP functions');
    }

    let transitionedToOtp = false;

    const handleOtpStepTransition = (res: any) => {
      if (transitionedToOtp) return;
      if (res && res.accessDenied) {
        this.designationForm.reset({ designation: '' });
        this.error = res.message || "The selected designation is not authorized for this portal.";
        return;
      }
      if (res && res.success) {
        transitionedToOtp = true;
        this.maskedDestination = res.data?.destinationMasked || 'registered mobile / email';
        this.currentStep = 'OTP';
        this.successMessage = res.message || "OTP sent to your registered contact.";
        const cooldown = res.data?.resendCooldownSeconds != null && res.data.resendCooldownSeconds > 0
          ? res.data.resendCooldownSeconds
          : OTP_RESEND_COOLDOWN_SECONDS;
        this.startCooldown(cooldown);
      }
    };

    // 1. Call the existing Regenerate OTP function automatically
    this.authService.regenerateOtp(selectedDesig).subscribe({
      next: (res) => {
        if (isDevMode()) {
          console.log('[RMS Auth] Regenerate OTP completed automatically:', res);
        }
        handleOtpStepTransition(res);
      },
      error: (err) => {
        if (isDevMode()) {
          console.warn('[RMS Auth] Regenerate OTP notice:', err);
        }
      }
    });

    // 2. Call the existing Generate OTP function automatically
    this.authService.generateOtp(selectedDesig).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
        this.loadingOperation = null;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (res) => {
        const passed = Boolean(res && res.success);
        const nextStep: AuthStep = passed ? 'OTP' : 'DESIGNATION';

        if (isDevMode()) {
          console.log('[RMS Auth] Generate OTP response received. HTTP status: 200');
          console.log('[RMS Auth] Whether the response passed validation:', passed);
          console.log('[RMS Auth] The next authentication step:', nextStep);
        }

        if (res && res.accessDenied) {
          this.designationForm.reset({ designation: '' });
          this.error = res.message || "The selected designation is not authorized for this portal.";
          return;
        }

        if (passed) {
          handleOtpStepTransition(res);
        } else {
          this.error = res?.message || "Failed to generate OTP. Please try again.";
        }
      },
      error: (err) => {
        if (isDevMode()) {
          console.error('[RMS Auth] Caught error during generate-otp:', err?.message || err);
          console.log('[RMS Auth] HTTP status:', err?.status ?? 'UNKNOWN');
        }

        if (transitionedToOtp) {
          return;
        }

        if (err?.status === 403 || err?.error?.accessDenied) {
          this.designationForm.reset({ designation: '' });
          this.error = err?.error?.message || "The selected designation is not authorized for this portal.";
          return;
        }

        if (err?.status === 429) {
          const retryAfterSeconds = Number(err?.error?.retryAfterSeconds);
          this.startCooldown(retryAfterSeconds > 0 ? retryAfterSeconds : OTP_RESEND_COOLDOWN_SECONDS);
          this.error = err?.error?.message || "An OTP was recently sent. Please wait before trying again.";
        } else if (err?.name === 'TimeoutError') {
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

    if (this.currentStep !== 'OTP') {
      return;
    }

    const otp = (this.otpForm.get('otp')?.value || '').trim();
    if (!otp) {
      this.error = "Please enter the 5-digit OTP received on your mobile / email.";
      return;
    }

    this.loading = true;
    this.loadingOperation = 'VERIFY';

    if (isDevMode()) {
      console.log('[RMS Auth] Request started: verify-otp');
    }

    this.authService.verifyOtp(otp).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
        this.loadingOperation = null;
        this.cdr.markForCheck();
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
          this.error = err?.error?.message || "Invalid OTP. Please enter the valid 5-digit OTP.";
        } else {
          this.error = err?.error?.message || err?.message || "Invalid OTP. Please enter the valid 5-digit OTP.";
        }
      }
    });
  }

  regenerateOtp(): void {
    if (this.loading || this.loadingOperation === 'REGENERATE') {
      return; // Prevent accidental duplicate clicks while request is processing
    }

    this.error = "";
    this.successMessage = "";
    this.loading = true;
    this.loadingOperation = 'REGENERATE';

    const selectedDesig = (this.designationForm.get('designation')?.value || '').trim();

    this.authService.regenerateOtp(selectedDesig).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
        this.loadingOperation = null;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (res) => {
        if (res && res.success) {
          this.successMessage = res.message || "OTP regenerated successfully and sent to your registered contact.";
          if (res.data?.destinationMasked) {
            this.maskedDestination = res.data.destinationMasked;
          }
          const cooldown = res.data?.resendCooldownSeconds != null && res.data.resendCooldownSeconds > 0
            ? res.data.resendCooldownSeconds
            : OTP_RESEND_COOLDOWN_SECONDS;
          this.startCooldown(cooldown);
        } else {
          this.error = res?.message || "Failed to regenerate OTP. Please try again.";
        }
      },
      error: (err) => {
        if (err?.status === 429) {
          const retryAfterSeconds = Number(err?.error?.retryAfterSeconds);
          this.startCooldown(retryAfterSeconds > 0 ? retryAfterSeconds : OTP_RESEND_COOLDOWN_SECONDS);
          this.error = err?.error?.message || "Please wait before requesting another OTP.";
        } else {
          this.error = err?.error?.message || err?.message || "Unable to regenerate OTP. Please try again.";
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
    this.loadingOperation = 'RESEND';

    const selectedDesig = (this.designationForm.get('designation')?.value || '').trim();

    this.authService.resendOtp(selectedDesig).pipe(
      timeout(15000),
      finalize(() => {
        this.loading = false;
        this.loadingOperation = null;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (res) => {
        if (res && res.success) {
          this.successMessage = res.message || "A new OTP has been dispatched to your registered contact.";
          if (res.data?.destinationMasked) {
            this.maskedDestination = res.data.destinationMasked;
          }
          const cooldown = res.data?.resendCooldownSeconds != null && res.data.resendCooldownSeconds > 0
            ? res.data.resendCooldownSeconds
            : OTP_RESEND_COOLDOWN_SECONDS;
          this.startCooldown(cooldown);
        } else {
          this.error = res.message || "Failed to resend OTP. Please try again.";
        }
      },
      error: (err) => {
        if (err?.status === 429) {
          const retryAfterSeconds = Number(err?.error?.retryAfterSeconds);
          this.startCooldown(retryAfterSeconds > 0 ? retryAfterSeconds : OTP_RESEND_COOLDOWN_SECONDS);
          this.error = err?.error?.message || "Please wait before requesting another OTP.";
        } else {
          this.error = err?.error?.message || err?.message || "Unable to resend OTP. Please try again.";
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  uppercaseUserId(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    const uppercaseValue = input.value.toUpperCase();

    if (input.value !== uppercaseValue) {
      input.value = uppercaseValue;
      this.loginForm.get('userId')?.setValue(uppercaseValue, { emitEvent: false });
      if (selectionStart !== null && selectionEnd !== null) {
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }

  restartLogin(): void {
    this.authService.setRmsTempUser(null);
    this.loading = false;
    this.loadingOperation = null;
    this.currentStep = 'LOGIN';
    this.error = '';
    this.successMessage = '';
    this.validatedUser = null;
    this.availableDesignations = [];
    this.maskedDestination = '';
    this.clearCooldownTimer();
    this.resendCooldown = 0;
    this.loginForm.reset({ userId: '', password: '', divisionCode: '', captchaInput: '' });
    this.designationForm.reset({ designation: '' });
    this.otpForm.reset({ otp: '' });
    this.loadCaptcha();
  }

  refreshCaptcha(): void {
    if (!this.loading) {
      this.loadCaptcha();
    }
  }

  getDivisionHelpText(): string {
    const code = (this.loginForm?.get('divisionCode')?.value || '').trim().toUpperCase();
    if (!code) return '';
    const details = getDivisionDetails(code);
    return details ? `${details.name} • ${details.zone}` : '';
  }

  get resendCooldownDisplay(): string {
    const clamped = Math.max(0, this.resendCooldown);
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private startCooldown(seconds: number): void {
    this.clearCooldownTimer();
    this.resendCooldown = Math.max(0, seconds);
    if (this.resendCooldown <= 0) {
      return;
    }
    this.cooldownInterval = setInterval(() => {
      if (this.resendCooldown > 0) {
        this.resendCooldown--;
      }
      this.cdr.markForCheck();
      if (this.resendCooldown <= 0) {
        this.clearCooldownTimer();
      }
    }, 1000);
  }

  private checkPendingOtpStatus(): void {
    this.authService.getOtpStatus().subscribe({
      next: (res) => {
        if (res && res.success && res.data && res.data.step === 'OTP_PENDING') {
          this.currentStep = 'OTP';
          this.maskedDestination = res.data.destinationMasked || 'registered mobile / email';
          if (res.data.userId && res.data.divisionCode && res.data.selectedDesignation) {
            this.validatedUser = {
              userId: res.data.userId,
              userName: res.data.userName,
              divisionCode: res.data.divisionCode,
              designations: [res.data.selectedDesignation]
            };
            this.authService.setRmsTempUser(this.validatedUser);
          }
          const cooldown = res.data.resendCooldownSeconds != null ? res.data.resendCooldownSeconds : 0;
          if (cooldown > 0) {
            this.startCooldown(cooldown);
          }
          this.cdr.markForCheck();
        }
      },
      error: () => {}
    });
  }

  private loadCaptcha(): void {
    this.captchaImage = '';
    this.captchaError = '';
    this.authService.getCaptcha().pipe(timeout(15000)).subscribe({
      next: (response) => {
        this.captchaImage = response.image;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.captchaError = err?.error?.message || "Unable to load CAPTCHA. Use refresh to try again.";
        this.cdr.markForCheck();
      }
    });
  }

  private clearCooldownTimer(): void {
    if (this.cooldownInterval !== null) {
      clearInterval(this.cooldownInterval);
      this.cooldownInterval = null;
    }
  }

  private resetFlowAfterCredentialChange(): void {
    this.authService.setRmsTempUser(null);
    this.currentStep = 'LOGIN';
    this.error = '';
    this.successMessage = '';
    this.validatedUser = null;
    this.availableDesignations = [];
    this.maskedDestination = '';
    this.designationForm.reset({ designation: '' });
    this.otpForm.reset({ otp: '' });
    this.clearCooldownTimer();
    this.resendCooldown = 0;
    this.loadCaptcha();
    this.cdr.markForCheck();
  }
}
