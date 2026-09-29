import React, { useState } from 'react';
import { 
  FileText, 
  MapPin, 
  CloudRain, 
  Building2, 
  UserCheck, 
  QrCode, 
  ArrowRight, 
  CheckCircle2, 
  Shield, 
  AlertCircle,
  Search
} from 'lucide-react';
import { INDIAN_LOCATIONS } from '../data/mockData';

export default function LandingView({ 
  onSelectGate, 
  onLocationSearch, 
  openScanner,
  parcels = [] 
}) {
  const [selectedState, setSelectedState] = useState('Karnataka');
  const [selectedDistrict, setSelectedDistrict] = useState('Mandya');
  const [selectedTaluk, setSelectedTaluk] = useState('Maddur');
  const [village, setVillage] = useState('');
  const [surveyNo, setSurveyNo] = useState('');

  const stateData = INDIAN_LOCATIONS[selectedState] || { districts: {} };
  const districts = Object.keys(stateData.districts);
  const taluks = stateData.districts[selectedDistrict] || [];

  const handleStateChange = (e) => {
    const st = e.target.value;
    setSelectedState(st);
    const newDistricts = Object.keys(INDIAN_LOCATIONS[st]?.districts || {});
    const firstDist = newDistricts[0] || '';
    setSelectedDistrict(firstDist);
    setSelectedTaluk(INDIAN_LOCATIONS[st]?.districts[firstDist]?.[0] || '');
  };

  const handleDistrictChange = (e) => {
    const dist = e.target.value;
    setSelectedDistrict(dist);
    setSelectedTaluk(stateData.districts[dist]?.[0] || '');
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    onLocationSearch({
      state: selectedState,
      district: selectedDistrict,
      taluk: selectedTaluk,
      village,
      surveyNo
    });
  };

  const totalVerified = parcels.filter(p => p.status === 'Verified').length;
  const totalClaims = parcels.length;
  const totalReliefReleased = parcels
    .filter(p => p.disasterClaim)
    .reduce((sum, p) => sum + (p.disasterClaim.releasedAmount || 0), 0);

  return (
    <div className="portal-content">
      {/* Hero Welcome Banner */}
      <div className="panel-card" style={{ 
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', 
        color: 'white',
        border: 'none',
        padding: '36px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ maxWidth: '780px', display: 'flex', flexDirection: 'column', gap: '14px', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: 'var(--radius-pill)', width: 'fit-content', fontSize: '12px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
            Unified National Land Rights & Disaster Compensation Network
          </div>

          <h2 style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: '1.2' }}>
            Secure Land Ownership, Community Verification & Direct Disaster Relief
          </h2>
          <p style={{ fontSize: '15px', color: '#94A3B8', lineHeight: '1.6' }}>
            Connecting farmers, ground survey teams, and government authorities under a single verifiable <strong>Land ID</strong>. Claim your land, resolve title deficiencies, and receive automated DBT disaster relief.
          </p>

          <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button className="btn-gradient" onClick={() => onSelectGate('claim-land')}>
              <FileText size={16} />
              Claim Your Land Now
            </button>
            <button className="btn-black-pill" style={{ background: 'rgba(255,255,255,0.15)' }} onClick={openScanner}>
              <QrCode size={16} />
              Scan Document / QR Code
            </button>
          </div>
        </div>
      </div>

      {/* National Overview KPI Metrics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Total Land Claims Lodged</span>
            <div className="stat-icon-wrap" style={{ background: '#EEF2FF', color: 'var(--brand-primary)' }}>
              <FileText size={20} />
            </div>
          </div>
          <span className="stat-val">{totalClaims}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Across all Indian States & UTs
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Verified Land Holdings</span>
            <div className="stat-icon-wrap" style={{ background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)' }}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <span className="stat-val">{totalVerified}</span>
          <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>
            ✓ Cadastral & Legal Seal Granted
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">DBT Disaster Relief Disbursed</span>
            <div className="stat-icon-wrap" style={{ background: '#E0E7FF', color: '#4338CA' }}>
              <CloudRain size={20} />
            </div>
          </div>
          <span className="stat-val">₹{totalReliefReleased.toLocaleString('en-IN')}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Direct Bank Transfer compensation
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Active Verification Teams</span>
            <div className="stat-icon-wrap" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
              <Shield size={20} />
            </div>
          </div>
          <span className="stat-val">124</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            On-ground survey teams deployed
          </span>
        </div>
      </div>

      {/* 6 Core Action Gates (From Section 1 of instructionmm) */}
      <div>
        <h3 className="panel-title" style={{ marginBottom: '6px' }}>
          Select Public Service Gateway
        </h3>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Choose your role or service pathway to continue
        </span>

        <div className="landing-grid">
          {/* Gate 1: Claim Your Land */}
          <div className="landing-card" onClick={() => onSelectGate('claim-land')}>
            <div className="landing-card-icon" style={{ background: '#EEF2FF', color: 'var(--brand-primary)' }}>
              <FileText size={26} />
            </div>
            <div>
              <h4 className="landing-card-title">1. Claim Your Land</h4>
              <p className="landing-card-desc">
                For farmers & landholders. Submit survey number, boundaries, self-declared land use, and upload available land deeds.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--brand-primary)', fontWeight: 600, fontSize: '13px' }}>
              <span>Start Land Claim</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Gate 2: Ground Verification */}
          <div className="landing-card" onClick={() => onSelectGate('ground-verification')}>
            <div className="landing-card-icon" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
              <MapPin size={26} />
            </div>
            <div>
              <h4 className="landing-card-title">2. Ground Verification</h4>
              <p className="landing-card-desc">
                For authorized field survey teams. Inspect physical boundaries, record GPS coordinates, detect land-use mismatches, and log neighbor attestations.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--status-pending-text)', fontWeight: 600, fontSize: '13px' }}>
              <span>Verification Team Access</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Gate 3: Disaster Relief Portal */}
          <div className="landing-card" onClick={() => onSelectGate('disaster-relief')}>
            <div className="landing-card-icon" style={{ background: '#E0E7FF', color: '#4338CA' }}>
              <CloudRain size={26} />
            </div>
            <div>
              <h4 className="landing-card-title">3. Disaster Relief</h4>
              <p className="landing-card-desc">
                Automated compensation calculator for flood, cyclone, or landslide damage based on verified land classification and damage percentage.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4338CA', fontWeight: 600, fontSize: '13px' }}>
              <span>Calculate & Apply Relief</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Gate 4: Government Login */}
          <div className="landing-card" onClick={() => onSelectGate('government-portal')}>
            <div className="landing-card-icon" style={{ background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)' }}>
              <Building2 size={26} />
            </div>
            <div>
              <h4 className="landing-card-title">4. Government Login</h4>
              <p className="landing-card-desc">
                For Tahsildars, SDMs, and Revenue Officers. Review case queues, resolve land classification mismatches, and sanction relief disbursements.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--status-verified-text)', fontWeight: 600, fontSize: '13px' }}>
              <span>Officer Portal</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Gate 5: Farmer Login */}
          <div className="landing-card" onClick={() => onSelectGate('farmer-portal')}>
            <div className="landing-card-icon" style={{ background: '#F8FAFC', color: 'var(--text-headline)', border: '1px solid var(--border-light)' }}>
              <UserCheck size={26} />
            </div>
            <div>
              <h4 className="landing-card-title">5. Farmer Login</h4>
              <p className="landing-card-desc">
                Sign in with mobile number and OTP. View your registered applications, verification status timeline, digital certificate, and land map.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-headline)', fontWeight: 600, fontSize: '13px' }}>
              <span>Enter Citizen Dashboard</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* Gate 6: Document / QR Scanner */}
          <div className="landing-card" onClick={openScanner}>
            <div className="landing-card-icon" style={{ background: '#FEF3C7', color: '#B45309' }}>
              <QrCode size={26} />
            </div>
            <div>
              <h4 className="landing-card-title">6. Document / QR Scanner</h4>
              <p className="landing-card-desc">
                Scan physical 7/12 records, deed photos, or certificate QR codes using optical character recognition (OCR) to inspect official verification status.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#B45309', fontWeight: 600, fontSize: '13px' }}>
              <span>Open Scanner & OCR</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* Cadastral Land Search Across All Indian States & UTs (Section 1) */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Explore Land Records by Administrative Hierarchy</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              State / UT → District → Taluk / Tehsil → Village → Survey / Plot Number
            </span>
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="form-grid">
          <div className="form-group">
            <label className="form-label">1. State / Union Territory</label>
            <select className="form-select" value={selectedState} onChange={handleStateChange}>
              {Object.keys(INDIAN_LOCATIONS).map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">2. District</label>
            <select className="form-select" value={selectedDistrict} onChange={handleDistrictChange}>
              {districts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">3. Taluk / Tehsil</label>
            <select className="form-select" value={selectedTaluk} onChange={(e) => setSelectedTaluk(e.target.value)}>
              {taluks.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">4. Village / City</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Chooralmala or Shivapura" 
              value={village}
              onChange={(e) => setVillage(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">5. Survey / Plot Number</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. 142/3B or 88/1" 
              value={surveyNo}
              onChange={(e) => setSurveyNo(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" className="btn-black-pill" style={{ width: '100%', justifyContent: 'center' }}>
              <Search size={15} />
              Search Cadastral Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
