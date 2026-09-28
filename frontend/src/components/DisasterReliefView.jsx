import React, { useState } from 'react';
import { 
  CloudRain, 
  CheckCircle2, 
  AlertTriangle, 
  Calculator, 
  MapPin, 
  ArrowRight,
  ShieldAlert,
  UploadCloud,
  FileCheck
} from 'lucide-react';
import { DISASTER_TYPES, RELIEF_RATE_PER_ACRE } from '../data/mockData';
import MapView from './MapView';

export default function DisasterReliefView({ 
  parcels = [], 
  onSubmitDisasterClaim,
  preSelectedParcel 
}) {
  const [selectedLandId, setSelectedLandId] = useState(preSelectedParcel ? preSelectedParcel.landId : parcels[0]?.landId || '');
  const [disasterType, setDisasterType] = useState('Flood');
  const [disasterDate, setDisasterDate] = useState('September 2026');
  const [affectedArea, setAffectedArea] = useState('');
  const [damagePercentage, setDamagePercentage] = useState('70');
  const [damageDesc, setDamageDesc] = useState('');
  const [activeTab, setActiveTab] = useState('calculator'); // 'calculator', 'map', 'claims'

  // Auto-populate land information based on selected Land ID (Section 12)
  const currentParcel = parcels.find(p => p.landId === selectedLandId) || parcels[0];

  const parsedAffectedArea = parseFloat(affectedArea) || (currentParcel ? currentParcel.areaAcres : 2.0);
  const parsedDamagePct = parseFloat(damagePercentage) || 70;
  
  // Dynamic compensation calculation (Section 13)
  const ratePerAcre = RELIEF_RATE_PER_ACRE[currentParcel?.finalClassification] || 35000;
  const estimatedEligibleRelief = Math.round(parsedAffectedArea * ratePerAcre * (parsedDamagePct / 100));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentParcel) return;

    await onSubmitDisasterClaim(currentParcel.landId, {
      disasterType,
      disasterDate,
      affectedAreaAcres: parsedAffectedArea,
      damagePercentage: parsedDamagePct,
      cropDamageDescription: damageDesc || `${disasterType} damage causing ${damagePercentage}% loss to standing crop/property.`
    });

    setActiveTab('claims');
  };

  const disasterParcels = parcels.filter(p => p.hasDisasterClaim);

  return (
    <div className="portal-content">
      {/* Header */}
      <div className="panel-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', background: '#E0E7FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CloudRain size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800 }}>National Disaster Relief Portal</h2>
                <span className="black-badge" style={{ fontSize: '10px' }}>DBT INTEGRATED</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Targeted financial compensation benchmarked by verified land-use and damage severity
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={`seg-tab ${activeTab === 'calculator' ? 'active' : ''}`} onClick={() => setActiveTab('calculator')}>
              Apply & Relief Calculator
            </button>
            <button className={`seg-tab ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>
              Interactive Disaster Map
            </button>
            <button className={`seg-tab ${activeTab === 'claims' ? 'active' : ''}`} onClick={() => setActiveTab('claims')}>
              Active Relief Claims ({disasterParcels.length})
            </button>
          </div>
        </div>
      </div>

      {/* 1. APPLY & DYNAMIC RELIEF CALCULATOR (Sections 12 & 13) */}
      {activeTab === 'calculator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Claim Submission Form */}
          <form onSubmit={handleSubmit} className="panel-card">
            <h3 className="panel-title">Apply for Government Disaster Relief</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Select verified Land ID to auto-populate cadastral and land-use records
            </span>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Select Verified Land Holding (Land ID)</label>
              <select className="form-select" value={selectedLandId} onChange={e => setSelectedLandId(e.target.value)}>
                {parcels.map(p => (
                  <option key={p.landId} value={p.landId}>
                    {p.landId} — {p.farmerName} ({p.surveyNumber}, {p.village})
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-populated details card */}
            {currentParcel && (
              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                <div><strong>Farmer:</strong> {currentParcel.farmerName}</div>
                <div><strong>Survey No:</strong> {currentParcel.surveyNumber}</div>
                <div><strong>Total Verified Area:</strong> {currentParcel.areaAcres} Acres</div>
                <div><strong>Verified Land Type:</strong> <span style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>{currentParcel.finalClassification}</span></div>
                <div><strong>Location:</strong> {currentParcel.village}, {currentParcel.district}</div>
                <div><strong>Legal Status:</strong> {currentParcel.legalStatus}</div>
              </div>
            )}

            <div className="form-grid" style={{ marginTop: '14px' }}>
              <div className="form-group">
                <label className="form-label">Disaster Type (Govt Recognized)</label>
                <select className="form-select" value={disasterType} onChange={e => setDisasterType(e.target.value)}>
                  {DISASTER_TYPES.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Month & Year of Disaster</label>
                <input type="text" className="form-input" value={disasterDate} onChange={e => setDisasterDate(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Affected Area (Acres)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  className="form-input" 
                  placeholder={currentParcel ? currentParcel.areaAcres.toString() : '2.0'}
                  value={affectedArea} 
                  onChange={e => setAffectedArea(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Assessed Damage Percentage (%)</label>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  step="5" 
                  value={damagePercentage} 
                  onChange={e => setDamagePercentage(e.target.value)} 
                />
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#B91C1C' }}>
                  {damagePercentage}% Crop / Structure Damage
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">Crop / Property Damage Narrative</label>
              <textarea 
                className="form-textarea" 
                rows="2"
                placeholder="Describe loss of standing crop, siltation, livestock, or structural breaches..."
                value={damageDesc}
                onChange={e => setDamageDesc(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-gradient" style={{ alignSelf: 'flex-start', marginTop: '14px' }}>
              Submit Relief Application & Sanction Request →
            </button>
          </form>

          {/* Dynamic Relief Calculation Card (Section 13) */}
          <div className="panel-card" style={{ height: 'fit-content', border: '2px solid #E0E7FF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calculator size={20} color="var(--brand-primary)" />
              <h3 className="panel-title">Dynamic Compensation Calculator</h3>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Non-uniform relief rate formulated by verified land category & State SDRF guidelines
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Verified Land Type:</span>
                <strong>{currentParcel?.finalClassification || 'Agricultural'}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Applicable Scheme:</span>
                <span>National Disaster Response Fund (NDRF / SDRF)</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Applicable Unit Rate:</span>
                <strong>₹{ratePerAcre.toLocaleString('en-IN')} / acre</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Affected Area Evaluated:</span>
                <strong>{parsedAffectedArea} Acres</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Damage Intensity Factor:</span>
                <span style={{ color: '#B91C1C', fontWeight: 700 }}>{parsedDamagePct}%</span>
              </div>

              {/* Total Calculation Highlight */}
              <div style={{ background: '#EEF2FF', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid #C7D2FE', marginTop: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Estimated Eligibility
                </div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-headline)', marginTop: '4px' }}>
                  ₹{estimatedEligibleRelief.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  * Labeled as <em>Estimated Eligibility</em> until final sanction and DBT release by authorized Revenue Authority.
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>First Tranche (60%):</strong> ₹{Math.round(estimatedEligibleRelief * 0.6).toLocaleString('en-IN')}</div>
                <div><strong>Second Tranche (40%):</strong> ₹{Math.round(estimatedEligibleRelief * 0.4).toLocaleString('en-IN')}</div>
                <div><strong>Expected Processing Time:</strong> 3-5 Working Days via DBT</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. INTERACTIVE DISASTER MAP (Section 14) */}
      {activeTab === 'map' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Interactive Geospatial Disaster Map</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Visualizing flood inundation, landslide zones, and affected cadastral parcels with damage severity overlays
              </span>
            </div>
            <span className="status-pill disputed">
              Severe Weather Alert Active (South-West Monsoon)
            </span>
          </div>

          <div style={{ height: '540px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <MapView 
              parcels={parcels} 
              selectedParcel={currentParcel} 
              onSelectParcel={() => {}} 
            />
          </div>
        </div>
      )}

      {/* 3. ACTIVE RELIEF CLAIMS DOCKET */}
      {activeTab === 'claims' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Sanctioned & Disbursed Relief Claims</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Track direct bank transfer (DBT) installments across disaster zones
              </span>
            </div>
          </div>

          <table className="classification-table">
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Land ID / Farmer</th>
                <th>Disaster Event</th>
                <th>Damage %</th>
                <th>Sanctioned Amount</th>
                <th>Released DBT</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {disasterParcels.map(p => (
                <tr key={p.landId}>
                  <td>
                    <span className="black-badge" style={{ fontSize: '10px' }}>
                      {p.disasterClaim.claimId}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{p.landId}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.farmerName} (Survey #{p.surveyNumber})</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.disasterClaim.disasterType}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.disasterClaim.disasterDate}</div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: '#B91C1C' }}>
                      {p.disasterClaim.damagePercentage}%
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 800 }}>₹{p.disasterClaim.sanctionedAmount.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>@ ₹{p.disasterClaim.reliefRatePerUnit}/acre</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 800, color: '#15803D' }}>₹{p.disasterClaim.releasedAmount.toLocaleString('en-IN')}</div>
                  </td>
                  <td>
                    <span className="status-pill verified">
                      {p.disasterClaim.approvalStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
