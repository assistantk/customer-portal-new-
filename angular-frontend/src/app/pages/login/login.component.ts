import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { AuthService } from "../../services/auth.service";

@Component({
  selector: "app-login",
  standalone: false,
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.css"]
})
export class LoginComponent implements OnInit, AfterViewInit {
  @ViewChild("captchaCanvas") captchaCanvasRef!: ElementRef<HTMLCanvasElement>;

  loginForm!: FormGroup;
  showPassword = false;
  loading = false;
  captchaLoading = false;
  captchaAvailable = false;
  error = "";
  returnUrl = "/register";

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      userId: ["", Validators.required],
      password: ["", Validators.required],
      captchaInput: ["", Validators.required]
    });

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/register';
  }

  ngAfterViewInit(): void {
    this.refreshCaptcha();
  }

  refreshCaptcha(): void {
    if (this.captchaLoading) {
      return;
    }

    this.captchaLoading = true;
    this.captchaAvailable = false;
    this.loginForm.patchValue({ captchaInput: "" });
    this.authService.getCaptcha().subscribe({
      next: (response) => this.drawCaptcha(response.image),
      error: () => {
        this.captchaLoading = false;
        this.error = "Unable to load CAPTCHA. Please try again.";
      }
    });
  }

  private drawCaptcha(imageSource: string): void {
    const canvas = this.captchaCanvasRef?.nativeElement;
    if (!canvas) {
      this.captchaLoading = false;
      this.error = "Unable to display CAPTCHA. Please try again.";
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.captchaLoading = false;
      this.error = "Unable to display CAPTCHA. Please try again.";
      return;
    }

    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      this.captchaAvailable = true;
      this.captchaLoading = false;
    };
    image.onerror = () => {
      this.captchaLoading = false;
      this.error = "Unable to display CAPTCHA. Please try again.";
    };
    image.src = imageSource;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  handleReset(): void {
    this.loginForm.reset({
      userId: "",
      password: "",
      captchaInput: ""
    });
    this.error = "";
    this.refreshCaptcha();
  }

  onSubmit(): void {
    this.error = "";
    const { userId, password, captchaInput } = this.loginForm.value;

    if (!userId || !userId.trim()) {
      this.error = "Please enter your User ID or email address";
      return;
    }
    if (!password) {
      this.error = "Please enter your password";
      return;
    }
    if (!captchaInput || !captchaInput.trim()) {
      this.error = "Please enter the captcha";
      return;
    }
    if (!this.captchaAvailable) {
      this.error = "CAPTCHA is not ready. Please refresh and try again.";
      return;
    }

    this.loading = true;
    this.authService.login({
      username: userId.trim(),
      password,
      captchaInput: captchaInput.trim()
    }).subscribe({
      next: (res) => {
        this.loading = false;
        if (res && res.success) {
          this.router.navigateByUrl(this.returnUrl);
        } else {
          this.error = res.message || "Login failed. Please try again.";
          this.refreshCaptcha();
        }
      },
      error: (err) => {
        this.loading = false;
        const msg = err?.error?.message || err?.message || "Login failed. Please try again.";
        this.error = msg;
        this.refreshCaptcha();
      }
    });
  }
}