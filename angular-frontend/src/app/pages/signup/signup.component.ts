import { Component, OnInit } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "../../services/auth.service";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{2,49}$/.test(username);
}

function checkPassword(password: string): string {
  if (password.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one digit.";
  if (!/[^a-zA-Z0-9]/.test(password)) return "Password must contain at least one special character.";
  return "";
}

@Component({
  selector: "app-signup",
  standalone: false,
  templateUrl: "./signup.component.html",
  styleUrls: ["./signup.component.css"]
})
export class SignupComponent implements OnInit {
  form!: FormGroup;
  showPassword = false;
  showConfirmPassword = false;
  loading = false;
  error = "";
  success = false;
  fieldErrors: Record<string, string> = {};

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      email: [""],
      username: [""],
      password: [""],
      confirmPassword: [""]
    });
  }

  validate(): boolean {
    const errs: Record<string, string> = {};
    const val = this.form.value;

    const email = (val.email || "").trim();
    if (!email) errs['email'] = "Email ID is required.";
    else if (!isValidEmail(email)) errs['email'] = "Please enter a valid email address.";

    const username = (val.username || "").trim();
    if (!username) errs['username'] = "Username is required.";
    else if (!isValidUsername(username))
      errs['username'] = "Username must be 3–50 characters, start with a letter, and contain only letters, numbers, underscores, or hyphens.";

    const password = val.password || "";
    if (!password) errs['password'] = "Password is required.";
    else {
      const pwMsg = checkPassword(password);
      if (pwMsg) errs['password'] = pwMsg;
    }

    const confirmPassword = val.confirmPassword || "";
    if (!confirmPassword) errs['confirmPassword'] = "Please confirm your password.";
    else if (password !== confirmPassword) errs['confirmPassword'] = "Passwords do not match.";

    this.fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  clearFieldError(field: string): void {
    if (this.fieldErrors[field]) {
      this.fieldErrors[field] = "";
    }
  }

  onSubmit(): void {
    this.error = "";
    if (!this.validate()) return;

    this.loading = true;
    const val = this.form.value;
    this.authService.register({
      email: val.email.trim(),
      username: val.username.trim(),
      password: val.password,
      confirmPassword: val.confirmPassword
    }).subscribe({
      next: (res) => {
        this.loading = false;
        if (res && res.success) {
          this.success = true;
          setTimeout(() => this.router.navigate(["/login"]), 2500);
        } else {
          this.error = res.message || "Registration failed. Please try again.";
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || err?.message || "Registration failed. Please try again.";
      }
    });
  }

  goLogin(): void {
    this.router.navigate(["/login"]);
  }
}