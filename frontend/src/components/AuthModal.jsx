import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  User, 
  Phone, 
  Eye, 
  EyeOff, 
  X, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  KeyRound,
  Building,
  UserCheck,
  ShieldAlert
} from 'lucide-react';
import { authService } from '../services/authService';

const DEMO_PRESETS = [
  {
    role: 'CITIZEN',
    label: '🌾 Citizen / Farmer',
    identifier: '9876543210',
    password: 'Demo@123',
    badge: 'Farmer Portal',
    badgeColor: '#16a34a'
  },
  {
    role: 'VERIFICATION_OFFICER',
    label: '🔍 Verification Officer',
    identifier: '9876543211',
    password: 'Demo@123',
    badge: 'Ground Survey',
    badgeColor: '#0284c7'
  },
  {
    role: 'GOVERNMENT_OFFICER',
    label: '🏛️ Government Officer',
    identifier: '9876543212',
    password: 'Demo@123',
    badge: 'Govt Approval',
    badgeColor: '#7c3aed'
  },
  {
    role: 'ADMIN',
    label: '🛡️ System Admin',
    identifier: 'admin',
    password: 'Admin@123',
    badge: 'HQ Admin',
    badgeColor: '#ea580c'
  },
];

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regPassword, setRegPassword] = useState('');

  if (!isOpen) return null;

  const handleApplyPreset = (preset) => {
    setMode('login');
    setLoginIdentifier(preset.identifier);
    setLoginPassword(preset.password);
    setErrorMessage('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMessage('Please provide both username/mobile and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.login(loginIdentifier.trim(), loginPassword);
      setSuccessMessage(`Welcome back, ${result.user.full_name || result.user.name || result.user.username}!`);
      setTimeout(() => {
        onAuthSuccess(result.user);
        onClose();
      }, 500);
    } catch (err) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!regFullName.trim() || !regUsername.trim() || !regMobile.trim() || !regPassword) {
      setErrorMessage('Please fill in all registration fields.');
      return;
    }

    setLoading(true);
    try {
      await authService.registerCitizen({
        full_name: regFullName.trim(),
        username: regUsername.trim(),
        mobile_number: regMobile.trim(),
        password: regPassword,
      });

      // Auto-login after registration
      const result = await authService.login(regUsername.trim(), regPassword);
      setSuccessMessage(`Account created! Welcome, ${result.user.full_name || result.user.username}.`);
      setTimeout(() => {
        onAuthSuccess(result.user);
        onClose();
      }, 600);
    } catch (err) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div 
        className="auth-modal-card" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Top Decorative Band */}
        <div className="auth-top-band">
          <div className="auth-band-tricolor" />
        </div>

        {/* Modal Header */}
        <div className="auth-modal-header">
          <div className="auth-brand-pill">
            <div className="auth-shield-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="auth-portal-title">BhoomiSetu Identity Portal</h3>
              <span className="auth-portal-sub">Ministry of Land Resources & Disaster Relief</span>
            </div>
          </div>
          <button 
            className="auth-close-btn" 
            onClick={onClose} 
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Switcher Tabs */}
        <div className="auth-tabs-row">
          <button 
            className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setErrorMessage(''); setSuccessMessage(''); }}
          >
            <KeyRound size={15} />
            <span>Secure Sign In</span>
          </button>
          <button 
            className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setErrorMessage(''); setSuccessMessage(''); }}
          >
            <UserCheck size={15} />
            <span>Citizen Registration</span>
          </button>
        </div>

        {/* Feedback Alert Banners */}
        {errorMessage && (
          <div className="auth-alert-box error">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="auth-alert-box success">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 1. LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="auth-form-body">
            <div className="auth-field-group">
              <label className="auth-label">
                <User size={14} />
                <span>Username or 10-Digit Mobile Number</span>
              </label>
              <div className="auth-input-wrap">
                <input 
                  type="text"
                  className="auth-input"
                  placeholder="e.g. 9876543210 or demo_farmer"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="auth-field-group">
              <label className="auth-label">
                <Lock size={14} />
                <span>Account Password</span>
              </label>
              <div className="auth-input-wrap password-wrap">
                <input 
                  type={showPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="Enter your secure password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button 
                  type="button" 
                  className="auth-pwd-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex="-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button 
              type="submit" 
              className="auth-submit-btn primary"
              disabled={loading}
            >
              {loading ? (
                <span>Authenticating with Backend...</span>
              ) : (
                <>
                  <span>Sign In to BhoomiSetu</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Quick Demo Credentials Panel */}
            <div className="auth-demo-presets-card">
              <div className="auth-demo-header">
                <Sparkles size={14} color="#f59e0b" />
                <span>Quick Demo Accounts (1-Click Fill)</span>
              </div>
              <div className="auth-demo-grid">
                {DEMO_PRESETS.map((preset) => (
                  <button
                    key={preset.identifier}
                    type="button"
                    className="auth-preset-chip"
                    onClick={() => handleApplyPreset(preset)}
                  >
                    <div className="auth-preset-title">{preset.label}</div>
                    <div className="auth-preset-meta">
                      <code>{preset.identifier}</code>
                      <span className="auth-preset-badge" style={{ backgroundColor: preset.badgeColor }}>
                        {preset.badge}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </form>
        )}

        {/* 2. REGISTRATION FORM */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="auth-form-body">
            <div className="auth-info-callout">
              <Building size={16} color="#0284c7" />
              <div>
                <strong>Public Citizen & Farmer Enrollment</strong>
                <p>Register to submit land verification claims and receive DBT disaster relief. Government officer accounts are provisioned by regional administrators.</p>
              </div>
            </div>

            <div className="auth-grid-2col">
              <div className="auth-field-group">
                <label className="auth-label">Full Legal Name</label>
                <input 
                  type="text"
                  className="auth-input"
                  placeholder="e.g. Ramesh Kumar Patel"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  required
                />
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Username</label>
                <input 
                  type="text"
                  className="auth-input"
                  placeholder="e.g. ramesh_k"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-grid-2col">
              <div className="auth-field-group">
                <label className="auth-label">10-Digit Mobile Number</label>
                <input 
                  type="tel"
                  className="auth-input"
                  placeholder="9876543299"
                  value={regMobile}
                  onChange={(e) => setRegMobile(e.target.value)}
                  maxLength={10}
                  required
                />
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Password (Min 6 chars)</label>
                <input 
                  type="password"
                  className="auth-input"
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="auth-submit-btn success"
              disabled={loading}
            >
              {loading ? (
                <span>Creating Account on Cadastre...</span>
              ) : (
                <>
                  <span>Create Citizen Account & Sign In</span>
                  <CheckCircle2 size={16} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Modal Footer */}
        <div className="auth-modal-footer">
          <ShieldAlert size={13} />
          <span>Encrypted with SHA-256 and Bcrypt. Connected to FastAPI PostgreSQL backend.</span>
        </div>
      </div>
    </div>
  );
}
