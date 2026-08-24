import { useState } from 'react';
import { Mail, User, Lock, Eye, EyeOff, AlertCircle, Loader2, UserPlus, CheckCircle2 } from 'lucide-react';
import { registerUser } from '../services/authService';
import indianRailwaysLogo from '../assets/indian-railways-logo.png';
import crisLogo from '../assets/cris-logo.png';

/* ── Validation helpers ── */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return /^[a-zA-Z][a-zA-Z0-9_-]{2,49}$/.test(username);
}

function checkPassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least one special character.';
  return '';
}

/* ── Component ── */
export default function SignUp({ onNavigateLogin }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  /* ── Client-side validation ── */
  const validate = () => {
    const errs = {};

    if (!email.trim()) errs.email = 'Email ID is required.';
    else if (!isValidEmail(email.trim())) errs.email = 'Please enter a valid email address.';

    if (!username.trim()) errs.username = 'Username is required.';
    else if (!isValidUsername(username.trim()))
      errs.username = 'Username must be 3–50 characters, start with a letter, and contain only letters, numbers, underscores, or hyphens.';

    if (!password) errs.password = 'Password is required.';
    else {
      const pwMsg = checkPassword(password);
      if (pwMsg) errs.password = pwMsg;
    }

    if (!confirmPassword) errs.confirmPassword = 'Please confirm your password.';
    else if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setLoading(true);
    try {
      await registerUser({
        email: email.trim(),
        username: username.trim(),
        password,
        confirmPassword,
      });
      setSuccess(true);
      // Redirect to login after short delay
      setTimeout(() => {
        if (onNavigateLogin) onNavigateLogin();
      }, 2500);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-app">
      {/* Header — same as Login */}
      <header className="login-header">
        <div className="login-brand">
          <div className="login-cris">
            <img src={crisLogo} alt="CRIS" />
          </div>
        </div>

        <span className="login-title">Create Account</span>

        <div className="login-cris">
          <img src={crisLogo} alt="CRIS" />
        </div>
      </header>

      {/* Main */}
      <main className="login-main">
        <div className="login-card signup-card">
          {/* Card head — same as Login */}
          <div className="login-card-head">
            <div className="login-railways-banner">
              <img src={indianRailwaysLogo} alt="Indian Railways" />
            </div>
          </div>

          <div className="login-rule" />

          {/* Success banner */}
          {success && (
            <div className="signup-success-banner">
              <CheckCircle2 size={14} />
              <span>Account created successfully. Please sign in.</span>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="login-error-banner">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          {!success && (
            <form onSubmit={handleSubmit} className="signup-form" autoComplete="off">
              <div className="signup-grid">
                {/* Email */}
                <div className="login-field-wrap">
                  <label htmlFor="signup-email">Email ID <b>*</b></label>
                  <div className={`login-control${fieldErrors.email ? ' signup-control-error' : ''}`}>
                    <Mail size={15} />
                    <input
                      id="signup-email"
                      type="email"
                      placeholder="Enter Email ID"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })); }}
                      autoFocus
                    />
                  </div>
                  {fieldErrors.email && <p className="signup-field-error">{fieldErrors.email}</p>}
                </div>

                {/* Username */}
                <div className="login-field-wrap">
                  <label htmlFor="signup-username">Username <b>*</b></label>
                  <div className={`login-control${fieldErrors.username ? ' signup-control-error' : ''}`}>
                    <User size={15} />
                    <input
                      id="signup-username"
                      type="text"
                      placeholder="Enter Username"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setFieldErrors((p) => ({ ...p, username: '' })); }}
                    />
                  </div>
                  {fieldErrors.username && <p className="signup-field-error">{fieldErrors.username}</p>}
                </div>

                {/* Password */}
                <div className="login-field-wrap">
                  <label htmlFor="signup-password">Password <b>*</b></label>
                  <div className={`login-control${fieldErrors.password ? ' signup-control-error' : ''}`}>
                    <Lock size={15} />
                    <input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter Password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })); }}
                    />
                    <button
                      type="button"
                      className="login-pw-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="signup-field-error">{fieldErrors.password}</p>}
                </div>

                {/* Confirm Password */}
                <div className="login-field-wrap">
                  <label htmlFor="signup-confirm-password">Confirm Password <b>*</b></label>
                  <div className={`login-control${fieldErrors.confirmPassword ? ' signup-control-error' : ''}`}>
                    <Lock size={15} />
                    <input
                      id="signup-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((p) => ({ ...p, confirmPassword: '' })); }}
                    />
                    <button
                      type="button"
                      className="login-pw-toggle"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p className="signup-field-error">{fieldErrors.confirmPassword}</p>}
                </div>
              </div>

              {/* Actions */}
              <div className="login-actions">
                <div className="signup-login-link">
                  Already have an account?{' '}
                  <button type="button" className="signup-link-btn" onClick={onNavigateLogin}>
                    Sign In
                  </button>
                </div>
                <div className="login-btns">
                  <button type="submit" className="login-submit" disabled={loading}>
                    {loading ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />}
                    {loading ? 'Creating Account…' : 'Sign Up'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer — same as Login */}
      <footer className="login-footer">
        Designed and Developed By <strong>CENTRE FOR RAILWAY INFORMATION SYSTEMS</strong> Chanakyapuri, New Delhi-110021
      </footer>
    </div>
  );
}
