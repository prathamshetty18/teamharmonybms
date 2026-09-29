import React from 'react';
import { 
  Building2, 
  UserCheck, 
  ShieldCheck, 
  Search,
  LogOut,
  QrCode
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ 
  searchQuery, 
  setSearchQuery, 
  onSearchSubmit, 
  openScanner
}) {
  const { user, logout, currentPath, navigate } = useAuth();

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <>
      {/* Government of India Official Top Strip */}
      <div className="gov-top-strip">
        <div className="gov-flag-emblem">
          <span style={{ fontSize: '13px' }}>🇮🇳</span>
          <span>Government of India • Ministry of Land Resources & Disaster Management</span>
          <span className="gov-emblem-badge">BHOOMISETU</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span>English | हिंदी | ಕನ್ನಡ | മലയാളം</span>
          <span>Helpdesk: 1800-180-1551</span>
        </div>
      </div>

      {/* Main Unified Navigation */}
      <header className="gov-navbar">
        <div 
          className="portal-brand" 
          onClick={() => navigate(user ? (user.role === 'CITIZEN' ? '/citizen' : '/dashboard') : '/')}
        >
          <div className="brand-shield-icon">
            <ShieldCheck size={22} />
          </div>
          <div className="brand-text-col">
            <h1 className="portal-title">BhoomiSetu</h1>
            <span className="portal-sub">National Land Rights & Disaster Relief Portal</span>
          </div>
        </div>

        {/* User authenticated navigation & controls */}
        {user ? (
          <>
            <nav className="portal-nav-links">
              {user.role === 'CITIZEN' ? (
                <button
                  className={`portal-tab-btn ${currentPath === '/citizen' ? 'active' : ''}`}
                  onClick={() => navigate('/citizen')}
                >
                  <UserCheck size={16} />
                  <span>Citizen Portal</span>
                </button>
              ) : (
                <button
                  className={`portal-tab-btn ${currentPath === '/dashboard' ? 'active' : ''}`}
                  onClick={() => navigate('/dashboard')}
                >
                  <Building2 size={16} />
                  <span>Government Portal</span>
                </button>
              )}
            </nav>

            <div className="nav-actions-group">
              <form onSubmit={onSearchSubmit} className="search-pill-box">
                <Search size={14} color="var(--text-placeholder)" />
                <input 
                  type="text" 
                  className="search-pill-input"
                  placeholder="Search Land ID / Survey..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>

              <button 
                className="btn-outline-pill" 
                onClick={openScanner}
                title="Scan Physical Document or QR Code"
              >
                <QrCode size={16} />
                <span>Scan Doc / QR</span>
              </button>

              {/* FIX 2 & FIX 8: Consistent Top-Right User Pill */}
              <div className="nav-user-pill" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="nav-user-avatar">
                  {getInitials(user.name)}
                </div>
                <div className="nav-user-info" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span className="nav-user-name" style={{ whiteSpace: 'nowrap' }}>
                    {user.role === 'CITIZEN' ? `Welcome, Citizen ${user.name}` : `Welcome, ${user.name} (Government)`}
                  </span>
                  <span className="nav-user-role-badge">
                    {user.role === 'CITIZEN' ? 'Citizen Portal' : 'Government Portal'}
                  </span>
                </div>
                <button 
                  className="nav-logout-btn" 
                  onClick={logout}
                  title="Sign Out of BhoomiSetu"
                  aria-label="Sign Out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* FIX 1: Clean landing page navbar with NO search icon, ID icon, or QR icon */
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Official National Cadastre
            </span>
          </div>
        )}
      </header>
    </>
  );
}
