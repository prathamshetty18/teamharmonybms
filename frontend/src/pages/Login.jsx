import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertCircle, ArrowLeft, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithSession, navigate } = useAuth();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errorBanner, setErrorBanner] = useState('');
  const [rateLimitSeconds, setRateLimitSeconds] = useState(null);
  const [loading, setLoading] = useState(false);

  // Countdown timer for rate limiting (429)
  useEffect(() => {
    if (rateLimitSeconds === null || rateLimitSeconds <= 0) return;
    const interval = setInterval(() => {
      setRateLimitSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimitSeconds]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorBanner('');

    if (rateLimitSeconds !== null && rateLimitSeconds > 0) {
      return;
    }

    // Name is a string which cannot be null or empty
    if (!name || typeof name !== 'string' || !name.trim()) {
      setErrorBanner('Name is required and cannot be empty.');
      return;
    }

    if (!password) {
      setErrorBanner('Password is required.');
      return;
    }

    const submittedPassword = password;
    // Immediately clear password from component state & DOM
    setPassword('');

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          password: submittedPassword
        })
      });

      const data = await response.json();

      if (response.status === 401) {
        setErrorBanner('Incorrect name or password. Please try again.');
        return;
      }

      if (response.status === 429) {
        // Rate limit requirement
        const retry = data.retryAfter || 900;
        setRateLimitSeconds(retry);
        return;
      }

      if (!response.ok) {
        setErrorBanner(data.error || 'Authentication failed. Please check your credentials.');
        return;
      }

      // Success
      if (data.jwt) {
        const citizenNameClean = (data.name || name).trim();
        const storedAadhaar = localStorage.getItem(`bhoomi_aadhaar_${citizenNameClean.toLowerCase()}`)
          || (data.userId ? localStorage.getItem(`bhoomi_aadhaar_uid_${data.userId}`) : null)
          || localStorage.getItem('bhoomi_last_registered_aadhaar')
          || '';

        loginWithSession({
          jwt: data.jwt,
          userId: data.userId,
          role: data.role || 'citizen',
          name: citizenNameClean,
          aadhaar: storedAadhaar
        });
      }
    } catch (err) {
      setErrorBanner('Network error. Unable to reach BhoomiSetu verification service.');
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (seconds) => {
    if (!seconds) return '15 minutes';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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
      <div className="panel-card" style={{ maxWidth: '440px', width: '100%', padding: '36px' }}>
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
            Citizen Portal Login
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            National Land Rights & Disaster Relief Verification
          </p>
        </div>

        {/* 401 Generic Red Banner */}
        {errorBanner && (
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
            <span>{errorBanner}</span>
          </div>
        )}

        {/* 429 Rate Limit Banner with Countdown */}
        {rateLimitSeconds !== null && rateLimitSeconds > 0 && (
          <div style={{
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            color: '#92400E',
            padding: '14px 16px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <Clock size={16} color="#D97706" />
              <span>Too many failed attempts. Please try again in 15 minutes.</span>
            </div>
            <div style={{ fontSize: '12px', color: '#B45309' }}>
              Time remaining: <strong>{formatCountdown(rateLimitSeconds)}</strong>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Enter your registered full name"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setErrorBanner('');
              }}
              autoComplete="name"
              disabled={rateLimitSeconds !== null && rateLimitSeconds > 0}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••••••"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setErrorBanner('');
              }}
              autoComplete="current-password"
              disabled={rateLimitSeconds !== null && rateLimitSeconds > 0}
            />
          </div>

          <button 
            type="submit" 
            className="btn-gradient" 
            style={{ width: '100%', marginTop: '8px', padding: '12px' }}
            disabled={loading || (rateLimitSeconds !== null && rateLimitSeconds > 0)}
          >
            {loading ? 'Verifying Credentials...' : 'Sign In to Citizen Portal →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Don't have an account yet?{' '}
          <button 
            type="button"
            onClick={() => navigate('/signup')}
            style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', fontWeight: 700, cursor: 'pointer' }}
          >
            Register here
          </button>
        </div>
      </div>
    </div>
  );
}
