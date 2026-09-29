import React, { useState } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  AlertCircle,
  LogOut,
  Building2,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LandingView() {
  const { user, login, loginWithSession, logout, navigate } = useAuth();
  const [selectedRole, setSelectedRole] = useState(null); // null, 'CITIZEN', 'GOVERNMENT'
  
  // Government Portal Tabs: 'signin' or 'register'
  const [govTab, setGovTab] = useState('signin');

  // Form states for login
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Form states for government registration
  const [govRegData, setGovRegData] = useState({
    name: '',
    badgeCode: '',
    department: 'Revenue & Land Records Cadastre',
    designation: 'Sub-Divisional Magistrate (SDM)',
    password: '',
    confirmPassword: ''
  });
  const [govRegErrors, setGovRegErrors] = useState({});

  const handleSelectOption = (role) => {
    setSelectedRole(role);
    setError('');
    setUsername('');
    setPassword('');
    setGovTab('signin');
  };

  const handleBack = () => {
    setSelectedRole(null);
    setError('');
    setUsername('');
    setPassword('');
    setGovRegErrors({});
  };

  const handleGovLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Please enter both your Officer Badge ID and Password.');
      return;
    }

    setLoading(true);
    const submittedPassword = password;
    setPassword('');

    try {
      // Attempt backend verification
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nationalIdCode: username.trim(),
          password: submittedPassword
        })
      });

      const data = await res.json();

      if (res.status === 401) {
        setError('Invalid credentials. No registered official found with this Officer Badge ID, or password was incorrect. Please register first.');
        return;
      }

      if (res.status === 429) {
        setError('Too many failed sign-in attempts. Please try again in 15 minutes.');
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Authentication failed. Please verify credentials or register.');
        return;
      }

      if (data.role !== 'government' && data.role !== 'GOVERNMENT') {
        setError('Unauthorized: This account does not possess Government Officer credentials.');
        return;
      }

      loginWithSession({
        jwt: data.jwt,
        userId: data.userId,
        role: 'GOVERNMENT',
        name: data.name || username.trim()
      });
    } catch {
      setError('Network error: Unable to reach BhoomiSetu authentication database.');
    } finally {
      setLoading(false);
    }
  };

  const handleGovRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setGovRegErrors({});

    const errs = {};
    const trimmedName = govRegData.name.trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 80) {
      errs.name = 'Official Name must be between 2 and 80 characters.';
    }

    const cleanBadge = govRegData.badgeCode.trim();
    if (!cleanBadge || cleanBadge.length < 4 || !/^[A-Za-z0-9_-]{4,40}$/.test(cleanBadge)) {
      errs.badgeCode = 'Officer Badge Code must be 4–40 alphanumeric characters.';
    }

    if (!govRegData.password || govRegData.password.length < 10) {
      errs.password = 'Password must be at least 10 characters long.';
    }

    if (govRegData.password !== govRegData.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errs).length > 0) {
      setGovRegErrors(errs);
      return;
    }

    setLoading(true);
    const submittedPw = govRegData.password;
    setGovRegData(prev => ({ ...prev, password: '', confirmPassword: '' }));

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          nationalIdCode: cleanBadge,
          password: submittedPw,
          role: 'government',
          department: govRegData.department,
          designation: govRegData.designation
        })
      });

      const data = await response.json();

      if (response.status === 409) {
        setError('An official account with this Officer ID already exists. Please sign in.');
        return;
      }

      if (!response.ok) {
        setError(data.error || 'Registration failed. Please check inputs.');
        return;
      }

      // Success
      if (loginWithSession) {
        loginWithSession({
          jwt: data.jwt,
          userId: data.userId,
          role: 'GOVERNMENT',
          name: trimmedName
        });
      } else {
        login(trimmedName, submittedPw, 'GOVERNMENT');
      }
    } catch {
      setError('Network error. Unable to reach BhoomiSetu verification service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 120px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      background: 'radial-gradient(ellipse at top, #F1F5F9 0%, #F8FAFC 100%)'
    }}>
      {/* BhoomiSetu Heading & Tagline */}
      <div style={{ textAlign: 'center', marginBottom: '32px', maxWidth: '640px' }}>
        <h1 style={{ 
          fontSize: '36px', 
          fontWeight: 800, 
          color: 'var(--text-headline)', 
          letterSpacing: '-0.03em',
          marginBottom: '8px'
        }}>
          BhoomiSetu
        </h1>

        <p style={{ 
          fontSize: '16px', 
          color: 'var(--text-muted)', 
          lineHeight: '1.5',
          fontWeight: 500
        }}>
          National Land Rights & Disaster Relief Portal
        </p>
      </div>

      {/* Main Centered Sign-in Card */}
      <div className="panel-card" style={{ 
        width: '100%', 
        maxWidth: selectedRole === 'GOVERNMENT' && govTab === 'register' ? '560px' : '520px', 
        padding: '36px', 
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border-light)'
      }}>
        {/* If user is already logged in */}
        {user ? (
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>
              Active Session Detected
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Signed in as <strong>{user.name}</strong> ({user.role === 'CITIZEN' ? 'Citizen' : 'Government Officer'}).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className="btn-gradient" 
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                onClick={() => navigate(user.role === 'CITIZEN' ? '/citizen' : '/dashboard')}
              >
                Go to {user.role === 'CITIZEN' ? 'Citizen Portal' : 'Government Portal'} →
              </button>

              <button 
                className="btn-outline-pill" 
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                onClick={logout}
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        ) : selectedRole === null ? (
          /* Selection Step: Centered card with two options */
          <div>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-headline)', marginBottom: '6px' }}>
                Select Portal Sign In
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Please choose your portal to access registered records
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Option 1: Citizen Registration */}
              <button
                type="button"
                onClick={() => navigate('/login')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '20px 24px',
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid var(--border-light)',
                  background: 'var(--bg-card)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--brand-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--brand-light)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                }}
              >
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-headline)', marginBottom: '4px' }}>
                    Sign in to Citizen Registration
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    For landowners and farmers managing claims & disaster relief
                  </div>
                </div>
                <ArrowRight size={18} color="var(--text-placeholder)" />
              </button>

              {/* Option 2: Government Registration */}
              <button
                type="button"
                onClick={() => handleSelectOption('GOVERNMENT')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '20px 24px',
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid var(--border-light)',
                  background: 'var(--bg-card)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#0F172A';
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                }}
              >
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-headline)', marginBottom: '4px' }}>
                    Sign in to Government Registration
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    For revenue officers, cadastral surveyors, and magistrates
                  </div>
                </div>
                <ArrowRight size={18} color="var(--text-placeholder)" />
              </button>
            </div>
          </div>
        ) : (
          /* Government Flow: Sign In OR Register New Official */
          <div>
            {/* Header with Back button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <button 
                type="button" 
                onClick={handleBack}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--brand-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <ArrowLeft size={16} />
                Back
              </button>

              <span className="top-bar-tag">
                GOVERNMENT OFFICIAL CONSOLE
              </span>
            </div>

            {/* Sub-Tabs: Sign In vs Register Official */}
            <div style={{ 
              display: 'flex', 
              background: '#F1F5F9', 
              borderRadius: 'var(--radius-sm)', 
              padding: '4px', 
              marginBottom: '20px' 
            }}>
              <button
                type="button"
                onClick={() => { setGovTab('signin'); setError(''); }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: govTab === 'signin' ? 700 : 500,
                  color: govTab === 'signin' ? 'var(--text-headline)' : 'var(--text-muted)',
                  background: govTab === 'signin' ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: govTab === 'signin' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Sign In as Officer
              </button>
              <button
                type="button"
                onClick={() => { setGovTab('register'); setError(''); }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: govTab === 'register' ? 700 : 500,
                  color: govTab === 'register' ? 'var(--text-headline)' : 'var(--text-muted)',
                  background: govTab === 'register' ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: govTab === 'register' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Register Government Official
              </button>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-headline)', marginBottom: '2px' }}>
                {govTab === 'signin' ? 'Official Sign In' : 'Register New Government Official'}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {govTab === 'signin' 
                  ? 'Access cadastral registry, ground inspection review, and magistrate sanction' 
                  : 'Register authorized revenue officer, cadastral surveyor, or magistrate credentials'}
              </p>
            </div>

            {error && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#B91C1C',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '18px'
              }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {govTab === 'signin' ? (
              /* TAB 1: Government Officer Sign In */
              <form onSubmit={handleGovLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Officer Badge ID / Government Code</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. GOV-REV-2024-001 or Officer Sharma"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
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
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-gradient"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '6px' }}
                  disabled={loading}
                >
                  {loading ? 'Authenticating...' : 'Sign In to Official Console →'}
                </button>
              </form>
            ) : (
              /* TAB 2: Government Official Registration (Requirement 1) */
              <form onSubmit={handleGovRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Full Official Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Devendra Patil"
                    value={govRegData.name}
                    onChange={e => setGovRegData(prev => ({ ...prev, name: e.target.value }))}
                  />
                  {govRegErrors.name && (
                    <span style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>{govRegErrors.name}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Officer Badge / Government Employee ID</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. GOV-REV-2024-4411"
                    value={govRegData.badgeCode}
                    onChange={e => setGovRegData(prev => ({ ...prev, badgeCode: e.target.value }))}
                  />
                  {govRegErrors.badgeCode && (
                    <span style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>{govRegErrors.badgeCode}</span>
                  )}
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select
                      className="form-select"
                      value={govRegData.department}
                      onChange={e => setGovRegData(prev => ({ ...prev, department: e.target.value }))}
                    >
                      <option value="Revenue & Land Records Cadastre">Revenue & Land Cadastre</option>
                      <option value="Survey, Settlement & Land Records">Survey & Settlement</option>
                      <option value="Sub-Divisional Magistrate Office">SDM / Tahsildar Office</option>
                      <option value="Disaster Relief Management Authority">Disaster Relief Authority</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Designation</label>
                    <select
                      className="form-select"
                      value={govRegData.designation}
                      onChange={e => setGovRegData(prev => ({ ...prev, designation: e.target.value }))}
                    >
                      <option value="Sub-Divisional Magistrate (SDM)">SDM (Magistrate)</option>
                      <option value="Tahsildar / Circle Officer">Tahsildar / Circle Officer</option>
                      <option value="Cadastral Ground Surveyor">Cadastral Surveyor</option>
                      <option value="District Revenue Officer">District Revenue Officer</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Password (≥ 10 characters)</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••••••"
                    value={govRegData.password}
                    onChange={e => setGovRegData(prev => ({ ...prev, password: e.target.value }))}
                  />
                  {govRegErrors.password && (
                    <span style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>{govRegErrors.password}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••••••"
                    value={govRegData.confirmPassword}
                    onChange={e => setGovRegData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                  {govRegErrors.confirmPassword && (
                    <span style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>{govRegErrors.confirmPassword}</span>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn-gradient"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '4px' }}
                  disabled={loading}
                >
                  {loading ? 'Registering Officer...' : 'Register Official Credentials & Enter Console →'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Official Footer Note */}
      <div style={{ marginTop: '28px', textAlign: 'center', fontSize: '11px', color: 'var(--text-placeholder)' }}>
        National Informatics Centre • Ministry of Land Resources & Disaster Management • Govt. of India
      </div>
    </div>
  );
}
