import { useState, useRef, useEffect, useCallback } from 'react';
import { User, Lock, ShieldCheck, RotateCcw, LogIn, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import indianRailwaysLogo from '../assets/indian-railways-logo.png';
import crisLogo from '../assets/cris-logo.png';

/* ── helpers ── */
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
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);

  // noise lines
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `hsla(${Math.random() * 360}, 70%, 55%, 0.4)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.lineTo(Math.random() * w, Math.random() * h);
    ctx.stroke();
  }

  // noise dots
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `hsla(${Math.random() * 360}, 60%, 60%, 0.5)`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // text
  const fontSize = 28;
  ctx.font = `bold italic ${fontSize}px 'Courier New', monospace`;
  ctx.textBaseline = 'middle';
  const totalWidth = ctx.measureText(text).width;
  let x = (w - totalWidth) / 2;

  for (const ch of text) {
    ctx.save();
    const angle = (Math.random() - 0.5) * 0.4;
    const yOff = (Math.random() - 0.5) * 10;
    ctx.translate(x, h / 2 + yOff);
    ctx.rotate(angle);
    // gradient text
    const grad = ctx.createLinearGradient(0, -fontSize / 2, 0, fontSize / 2);
    grad.addColorStop(0, '#60a5fa');
    grad.addColorStop(1, '#a78bfa');
    ctx.fillStyle = grad;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    x += ctx.measureText(ch).width + 2;
  }
}

/* ── animated dot canvas ── */
function useParticles(canvasRef) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let particles = [];

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.r = Math.random() * 2 + 0.5;
        this.alpha = Math.random() * 0.5 + 0.1;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(96,165,250,${this.alpha})`;
        ctx.fill();
      }
    }

    const count = Math.min(80, Math.floor((canvas.width * canvas.height) / 12000));
    for (let i = 0; i < count; i++) particles.push(new Particle());

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) { p.update(); p.draw(); }
      // connect nearby
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(96,165,250,${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [canvasRef]);
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
  const [shake, setShake] = useState(false);

  const captchaCanvas = useRef(null);
  const bgCanvas = useRef(null);

  useParticles(bgCanvas);

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

    if (!username.trim()) { setError('Please enter your username'); triggerShake(); return; }
    if (!password) { setError('Please enter your password'); triggerShake(); return; }
    if (!captchaInput.trim()) { setError('Please enter the captcha'); triggerShake(); return; }
    if (captchaInput.trim() !== captchaText) { setError('Captcha does not match. Please try again.'); refreshCaptcha(); triggerShake(); return; }

    setLoading(true);
    try {
      // Simulated login — replace with actual API call
      await new Promise(r => setTimeout(r, 1200));
      if (onLoginSuccess) onLoginSuccess({ username });
    } catch (err) {
      setError(err.message || 'Login failed');
      triggerShake();
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

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 500); };

  return (
    <div className="login-page">
      {/* Animated background */}
      <canvas ref={bgCanvas} className="login-bg-canvas" />

      {/* Decorative gradient orbs */}
      <div className="login-orb login-orb--1" />
      <div className="login-orb login-orb--2" />
      <div className="login-orb login-orb--3" />

      {/* Header bar */}
      <header className="login-header">
        <div className="login-header__brand">
          <div className="login-header__seal">
            <img src={indianRailwaysLogo} alt="Indian Railways" />
          </div>
          <div className="login-header__text">
            <span className="login-header__title">Customer Portal</span>
            <span className="login-header__subtitle">Centre for Railway Information Systems</span>
          </div>
        </div>
        <div className="login-header__cris">
          <img src={crisLogo} alt="CRIS" />
        </div>
      </header>

      {/* Main content */}
      <main className="login-main">
        <div className={`login-card ${shake ? 'login-card--shake' : ''}`}>
          {/* Card glow */}
          <div className="login-card__glow" />

          <div className="login-card__header">
            <div className="login-card__icon-ring">
              <LogIn size={28} />
            </div>
            <h1 className="login-card__title">Welcome Back</h1>
            <p className="login-card__desc">Sign in to access the Customer Portal</p>
          </div>

          {error && (
            <div className="login-alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
            {/* Username */}
            <div className="login-field">
              <label htmlFor="login-user">Username</label>
              <div className="login-input-wrap">
                <User size={18} className="login-input-icon" />
                <input
                  id="login-user"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <label htmlFor="login-pass">Password</label>
              <div className="login-input-wrap">
                <Lock size={18} className="login-input-icon" />
                <input
                  id="login-pass"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="login-toggle-pw"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Captcha */}
            <div className="login-field">
              <label htmlFor="login-captcha">
                <ShieldCheck size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                Security Verification
              </label>
              <div className="login-captcha-row">
                <canvas ref={captchaCanvas} width={160} height={48} className="login-captcha-canvas" />
                <button type="button" className="login-captcha-refresh" onClick={refreshCaptcha} aria-label="Refresh captcha">
                  <RotateCcw size={18} />
                </button>
              </div>
              <div className="login-input-wrap login-input-wrap--captcha">
                <ShieldCheck size={18} className="login-input-icon" />
                <input
                  id="login-captcha"
                  type="text"
                  placeholder="Enter captcha shown above"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="login-actions">
              <button type="submit" className="login-btn login-btn--primary" disabled={loading}>
                {loading ? <Loader2 size={18} className="login-spinner" /> : <LogIn size={18} />}
                <span>{loading ? 'Signing in…' : 'Login'}</span>
              </button>
              <button type="button" className="login-btn login-btn--ghost" onClick={handleReset} disabled={loading}>
                <RotateCcw size={16} />
                <span>Reset</span>
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="login-footer">
        <span>Designed and Developed By</span>
        <strong>CENTRE FOR RAILWAY INFORMATION SYSTEMS</strong>
        <span>Chanakyapuri, New Delhi-110021</span>
      </footer>
    </div>
  );
}
