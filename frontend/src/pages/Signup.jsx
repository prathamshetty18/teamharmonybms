import React, { useState } from 'react';
import { ShieldCheck, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const { loginWithSession, navigate } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    nationalIdCode: '',
    password: '',
    confirmPassword: ''
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [conflictError, setConflictError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear errors for that field
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
    setServerError('');
    setConflictError(false);
  };

  const validate = () => {
    const errors = {};
    const trimmedName = formData.name.trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 80) {
      errors.name = 'Name must be between 2 and 80 characters.';
    }

    const cleanNationalId = formData.nationalIdCode.trim();
    if (!cleanNationalId || cleanNationalId.length < 4 || !/^[A-Za-z0-9_-]{4,40}$/.test(cleanNationalId)) {
      errors.nationalIdCode = 'Record ID must be 4–40 alphanumeric characters (hyphens allowed).';
    }

    if (!formData.password || formData.password.length < 10) {
      errors.password = 'Password must be at least 10 characters long.';
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    setConflictError(false);

    // Client-side validation
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Capture password before clearing it from state
    const submittedPassword = formData.password;

    // Immediately clear passwords from component state & DOM
    setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));

    setLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          nationalIdCode: formData.nationalIdCode.trim(),
          password: submittedPassword
        })
      });

      const data = await response.json();

      if (response.status === 409) {
        setConflictError(true);
        return;
      }

      if (!response.ok) {
        // Field-level or server error
        if (data.field && data.error) {
          setFieldErrors({ [data.field]: data.error });
        } else {
          setServerError(data.error || 'Registration failed. Please check your inputs.');
        }
        return;
      }

      // Success: store JWT and redirect to /dashboard
      if (data.jwt) {
        const enteredAadhaar = formData.nationalIdCode.trim();
        const enteredName = formData.name.trim();
        try {
          localStorage.setItem(`bhoomi_aadhaar_${enteredName.toLowerCase()}`, enteredAadhaar);
          localStorage.setItem('bhoomi_last_registered_aadhaar', enteredAadhaar);
          if (data.userId) {
            localStorage.setItem(`bhoomi_aadhaar_uid_${data.userId}`, enteredAadhaar);
          }
        } catch (e) {}

        loginWithSession({
          jwt: data.jwt,
          userId: data.userId,
          role: data.role || 'citizen',
          name: enteredName,
          aadhaar: enteredAadhaar
        });
      }
    } catch (err) {
      setServerError('Network error. Unable to reach BhoomiSetu verification service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      background: 'radial-gradient(ellipse at top, #F1F5F9 0%, #F8FAFC 100%)'
    }}>
      <div className="panel-card" style={{ maxWidth: '480px', width: '100%', padding: '36px' }}>
        <button 
          type="button" 
          onClick={() => navigate('/')} 
          className="btn-outline-pill" 
          style={{ marginBottom: '20px', fontSize: '12px', padding: '6px 14px' }}
        >
          <ArrowLeft size={14} /> Back to Portal
        </button>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '50%', 
            background: 'var(--brand-light)', 
            color: 'var(--brand-primary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            margin: '0 auto 12px auto'
          }}>
            <ShieldCheck size={28} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-headline)', letterSpacing: '-0.02em' }}>
            Citizen Registration
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Zero-PII Sovereign Identity for Land Claims & Disaster Relief
          </p>
        </div>

        {/* 409 Conflict Banner */}
        {conflictError && (
          <div style={{
            background: '#FEF3C7',
            border: '1px solid #F59E0B',
            color: '#92400E',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px'
          }}>
            <span>An account with this ID already exists.</span>
            <button 
              type="button"
              onClick={() => navigate('/login')}
              style={{
                background: 'none',
                border: 'none',
                color: '#B45309',
                fontWeight: 700,
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: '0 4px'
              }}
            >
              [Log in instead]
            </button>
          </div>
        )}

        {/* Generic Server Error Banner */}
        {serverError && (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#B91C1C',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px'
          }}>
            <AlertCircle size={16} />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Full Name (as per Cadastral Record)</label>
            <input 
              type="text" 
              name="name"
              className="form-input" 
              placeholder="e.g. Ramesh Patel"
              value={formData.name}
              onChange={handleChange}
              autoComplete="name"
            />
            {fieldErrors.name && (
              <span style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px' }}>
                {fieldErrors.name}
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Record ID Number</label>
            <input 
              type="text" 
              name="nationalIdCode"
              className="form-input" 
              placeholder="e.g. 5432-8765-1092 or Record ID"
              value={formData.nationalIdCode}
              onChange={handleChange}
              autoComplete="off"
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Your Record ID number is hashed with a cryptographic pepper and never stored in plain text.
            </span>
            {fieldErrors.nationalIdCode && (
              <span style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px' }}>
                {fieldErrors.nationalIdCode}
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Password (at least 10 characters)</label>
            <input 
              type="password" 
              name="password"
              className="form-input" 
              placeholder="••••••••••••"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <span style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px' }}>
                {fieldErrors.password}
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input 
              type="password" 
              name="confirmPassword"
              className="form-input" 
              placeholder="••••••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword && (
              <span style={{ fontSize: '12px', color: '#DC2626', marginTop: '4px' }}>
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <button 
            type="submit" 
            className="btn-gradient" 
            style={{ width: '100%', marginTop: '8px', padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Creating Secure Account...' : 'Complete Citizen Registration →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Already registered?{' '}
          <button 
            type="button"
            onClick={() => navigate('/login')}
            style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', fontWeight: 700, cursor: 'pointer' }}
          >
            Log in here
          </button>
        </div>
      </div>
    </div>
  );
}
