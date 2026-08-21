import { useState, useRef, useEffect, useCallback } from 'react';
import { User, Lock, ShieldCheck, RotateCcw, LogIn, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import indianRailwaysLogo from '../assets/indian-railways-logo.png';
import crisLogo from '../assets/cris-logo.png';

/* ── Captcha helpers ── */
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateCaptcha(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  return s;
}

function drawCaptcha(canvas, text) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // background
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, w, h);

  // noise lines
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `hsla(${Math.random() * 360}, 60%, 50%, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.lineTo(Math.random() * w, Math.random() * h);
    ctx.stroke();
  }

  // noise dots
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `hsla(${Math.random() * 360}, 50%, 55%, 0.45)`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // text
  const fontSize = 26;
  ctx.font = `bold italic ${fontSize}px 'Courier New', monospace`;
  ctx.textBaseline = 'middle';
  const totalWidth = ctx.measureText(text).width;
  let x = (w - totalWidth) / 2;

  for (const ch of text) {
    ctx.save();
    const angle = (Math.random() - 0.5) * 0.35;
    const yOff = (Math.random() - 0.5) * 8;
    ctx.translate(x, h / 2 + yOff);
    ctx.rotate(angle);
    const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    x += ctx.measureText(ch).width + 2;
  }
}

/* ── Component ── */
export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [captchaText, setCaptchaText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const captchaCanvas = useRef(null);

  const refreshCaptcha = useCallback(() => {
    const t = generateCaptcha();
    setCaptchaText(t);
    setCaptchaInput('');
    requestAnimationFrame(() => drawCaptcha(captchaCanvas.current, t));
  }, []);

  useEffect(() => { refreshCaptcha(); }, [refreshCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) { setError('Please enter your username'); return; }
    if (!password) { setError('Please enter your password'); return; }
    if (!captchaInput.trim()) { setError('Please enter the captcha'); return; }
    if (captchaInput.trim() !== captchaText) { setError('Captcha does not match. Please try again.'); refreshCaptcha(); return; }

    setLoading(true);
    try {
      // Simulated login — replace with actual API call
      await new Promise(r => setTimeout(r, 1200));
      if (onLoginSuccess) onLoginSuccess({ username });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUsername('');
    setPassword('');
    setCaptchaInput('');
    setError('');
    refreshCaptcha();
  };

  return (
    <div className="login-app">
      {/* Header — same style as registration */}
      <header className="login-header">
        <div className="login-brand">
          <div className="login-cris">
            <img src={crisLogo} alt="CRIS" />
          </div>
         </div>

         <span className="login-title">Login Page</span>

         <div className="login-cris">
          <img src={crisLogo} alt="CRIS" />
         </div>
      </header>

      {/* Main */}
      <main className="login-main">
        <div className="login-card">
          {/* Card head — matches registration card-head */}
          <div className="login-card-head">
            <div className="login-title-icon">
              <LogIn size={22} />
              <div>
                <h1>Login</h1>
                <p>Sign in to access the Customer Portal</p>
              </div>
            </div>
            <div className="login-railways-banner">
              <img src={indianRailwaysLogo} alt="Indian Railways" />
            </div>
          </div>

          <div className="login-rule" />

          {/* Error */}
          {error && (
            <div className="login-error-banner">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-grid" autoComplete="off">
            {/* Username */}
            <div className="login-field-wrap">
              <label htmlFor="login-user">Username <b>*</b></label>
              <div className="login-control">
                <User size={15} />
                <input
                  id="login-user"
                  type="text"
                  placeholder="Enter UserName"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field-wrap">
              <label htmlFor="login-pass">Password <b>*</b></label>
              <div className="login-control">
                <Lock size={15} />
                <input
                  id="login-pass"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Captcha */}
            <div className="login-field-wrap">
              <label htmlFor="login-captcha">Enter Captcha <b>*</b></label>
              <div className="login-control">
                <ShieldCheck size={15} />
                <input
                  id="login-captcha"
                  type="text"
                  placeholder="Enter Captcha"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Captcha display */}
            <div className="login-captcha-row">
              <canvas ref={captchaCanvas} width={150} height={40} className="login-captcha-canvas" />
              <button type="button" className="login-captcha-refresh" onClick={refreshCaptcha} aria-label="Refresh captcha">
                <RotateCcw size={15} />
              </button>
            </div>

            {/* Actions — same style as registration */}
            <div className="login-actions">
              <div className="login-secure">
                <ShieldCheck size={14} />
                <span>Secure encrypted login</span>
              </div>
              <div className="login-btns">
                <button type="button" className="login-reset" onClick={handleReset} disabled={loading}>
                  <RotateCcw size={14} />
                  Reset
                </button>
                <button type="submit" className="login-submit" disabled={loading}>
                  {loading ? <Loader2 size={14} className="spin" /> : <LogIn size={14} />}
                  {loading ? 'Signing in…' : 'Login'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>

      {/* Footer — same as registration */}
      <footer className="login-footer">
        Designed and Developed By <strong>CENTRE FOR RAILWAY INFORMATION SYSTEMS</strong> Chanakyapuri, New Delhi-110021
      </footer>
    </div>
  );
}
