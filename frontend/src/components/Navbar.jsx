import React from 'react';
import { 
  Building2, 
  UserCheck, 
  MapPin, 
  CloudRain, 
  QrCode, 
  ShieldCheck, 
  Search,
  FileCheck2,
  Home
} from 'lucide-react';

export default function Navbar({ activePortal, setActivePortal, searchQuery, setSearchQuery, onSearchSubmit, openScanner }) {
  const portals = [
    { id: 'landing', label: 'Home', icon: Home },
    { id: 'farmer', label: 'Farmer Portal', icon: UserCheck },
    { id: 'ground', label: 'Ground Verification', icon: MapPin },
    { id: 'government', label: 'Government Portal', icon: Building2 },
    { id: 'disaster', label: 'Disaster Relief', icon: CloudRain }
  ];

  return (
    <>
      {/* Government of India Official Top Strip */}
      <div className="gov-top-strip">
        <div className="gov-flag-emblem">
          <span style={{ fontSize: '13px' }}>🇮🇳</span>
          <span>Government of India • Ministry of Land Resources & Disaster Management</span>
          <span className="gov-emblem-badge">BHOOMISETU</span>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
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

        {/* 3 Interconnected Portal Links */}
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

        {/* Right Search & QR Scanner Gate */}
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
        </div>
      </header>
    </>
  );
}
