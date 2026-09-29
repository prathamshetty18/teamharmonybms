import React from 'react';
import { 
  Building2, 
  UserCheck, 
  MapPin, 
  CloudRain, 
  QrCode, 
  ShieldCheck, 
  Search,
  Home,
  User,
  LogOut,
  LogIn
} from 'lucide-react';

export default function Navbar({ 
  activePortal, 
  setActivePortal, 
  searchQuery, 
  setSearchQuery, 
  onSearchSubmit, 
  openScanner,
  currentUser,
  onOpenAuthModal,
  onLogout
}) {
  const portals = [
    { id: 'landing', label: 'Home', icon: Home },
    { id: 'farmer', label: 'Farmer Portal', icon: UserCheck },
    { id: 'ground', label: 'Ground Verification', icon: MapPin },
    { id: 'government', label: 'Government Portal', icon: Building2 },
    { id: 'disaster', label: 'Disaster Relief', icon: CloudRain }
  ];

  const getRoleLabel = (role) => {
    switch (role) {
      case 'CITIZEN': return 'Citizen / Farmer';
      case 'VERIFICATION_OFFICER': return 'Verification Officer';
      case 'GOVERNMENT_OFFICER': return 'Govt Officer';
      case 'ADMIN': return 'Admin';
      default: return role || 'User';
    }
  };

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
        <div className="portal-brand" onClick={() => setActivePortal('landing')}>
          <div className="brand-shield-icon">
            <ShieldCheck size={22} />
          </div>
          <div className="brand-text-col">
            <h1 className="portal-title">BhoomiSetu</h1>
            <span className="portal-sub">National Land Rights & Disaster Relief Portal</span>
          </div>
        </div>

        {/* 5 Interconnected Portal Links */}
        <nav className="portal-nav-links">
          {portals.map(p => {
            const Icon = p.icon;
            const isActive = activePortal === p.id;
            return (
              <button
                key={p.id}
                className={`portal-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActivePortal(p.id)}
              >
                <Icon size={16} />
                <span>{p.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Search, QR Scanner & Authentication Action */}
        <div className="nav-actions-group">
          <form onSubmit={onSearchSubmit} className="search-pill-box">
            <Search size={14} color="var(--text-placeholder)" />
            <input 
              type="text" 
              className="search-pill-input"
              placeholder="Search Land ID / Survey No..." 
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

          {/* User Session Pill or Login Trigger */}
          {currentUser ? (
            <div className="nav-user-pill">
              <div className="nav-user-avatar">
                {getInitials(currentUser.full_name || currentUser.name || currentUser.username)}
              </div>
              <div className="nav-user-info">
                <span className="nav-user-name">
                  {currentUser.full_name || currentUser.name || currentUser.username}
                </span>
                <span className="nav-user-role-badge">
                  {getRoleLabel(currentUser.role)}
                </span>
              </div>
              <button 
                className="nav-logout-btn" 
                onClick={onLogout}
                title="Log out of session"
                aria-label="Log out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button 
              className="nav-login-btn" 
              onClick={onOpenAuthModal}
              title="Sign in to BhoomiSetu"
            >
              <LogIn size={15} />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </header>
    </>
  );
}
