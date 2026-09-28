import React, { useState } from 'react';
import { 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  CloudRain, 
  Filter, 
  ShieldCheck, 
  HelpCircle,
  Eye,
  Check,
  X
} from 'lucide-react';
import { INDIAN_LOCATIONS, LAND_USE_TYPES } from '../data/mockData';

export default function GovernmentPortalView({ 
  parcels = [], 
  onApproveClaim, 
  onOpenReport,
  onOpenQR 
}) {
  const [filterState, setFilterState] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterLandType, setFilterLandType] = useState('All');
  const [selectedParcelForApproval, setSelectedParcelForApproval] = useState(null);
  const [finalClassificationDecision, setFinalClassificationDecision] = useState('Agricultural / Farmland');

  // Filter parcels
  const filtered = parcels.filter(p => {
    if (filterState !== 'All' && p.state !== filterState) return false;
    if (filterStatus !== 'All' && p.status !== filterStatus) return false;
    if (filterLandType !== 'All' && p.finalClassification !== filterLandType && p.selfDeclaredClassification !== filterLandType) return false;
    return true;
  });

  // KPI Calculations (Section 11)
  const totalClaims = parcels.length;
  const verifiedCount = parcels.filter(p => p.status === 'Verified').length;
  const partiallyVerifiedCount = parcels.filter(p => p.status === 'Partially Verified').length;
  const pendingCount = parcels.filter(p => p.status === 'Pending Verification' || p.status === 'Special Verification Required').length;
  const disputedCount = parcels.filter(p => p.status === 'Disputed').length;
  const legalCasesCount = parcels.filter(p => p.legalStatus === '⚠️ Legal Issue Detected' || p.legalStatus === 'Requires Legal Review').length;
  const missingDocCases = parcels.filter(p => p.missingDocuments?.length > 0 || p.deficiencyReport).length;
  const disasterAffectedCount = parcels.filter(p => p.hasDisasterClaim).length;
  
  const totalSanctioned = parcels
    .filter(p => p.disasterClaim)
    .reduce((sum, p) => sum + (p.disasterClaim.sanctionedAmount || 0), 0);
  const totalDistributed = parcels
    .filter(p => p.disasterClaim)
    .reduce((sum, p) => sum + (p.disasterClaim.releasedAmount || 0), 0);
  const pendingReliefAmount = totalSanctioned - totalDistributed;

  const handleApprove = async () => {
    if (!selectedParcelForApproval) return;
    await onApproveClaim(selectedParcelForApproval.landId, {
      finalClassification: finalClassificationDecision,
      officerName: "Tahsildar & Sub-Divisional Magistrate (Govt of India)"
    });
    setSelectedParcelForApproval(null);
  };

  return (
    <div className="portal-content">
      {/* Official Government Header */}
      <div className="panel-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', background: 'var(--status-verified-bg)', color: 'var(--status-verified-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Revenue Department • Government Official Portal</h2>
                <span className="black-badge" style={{ fontSize: '10px' }}>OFFICIAL SEAL</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                National Cadastral Adjudication & Disaster Relief Sanctioning Console
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 11 KPI Cards (Section 11) */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Total Land Claims</span>
            <FileText size={18} color="var(--brand-primary)" />
          </div>
          <span className="stat-val">{totalClaims}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>All Active Records</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Verified Lands</span>
            <CheckCircle2 size={18} color="#15803D" />
          </div>
          <span className="stat-val" style={{ color: '#15803D' }}>{verifiedCount}</span>
          <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 600 }}>Title Seal Granted</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Pending Review</span>
            <span className="status-pill pending" style={{ padding: '2px 8px', fontSize: '10px' }}>In Progress</span>
          </div>
          <span className="stat-val">{pendingCount + partiallyVerifiedCount}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Field inspections ongoing</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Legal / Disputed Cases</span>
            <AlertTriangle size={18} color="#B91C1C" />
          </div>
          <span className="stat-val" style={{ color: '#B91C1C' }}>{legalCasesCount}</span>
          <span style={{ fontSize: '11px', color: '#B91C1C', fontWeight: 600 }}>Action Required</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Missing Document Cases</span>
            <HelpCircle size={18} color="#B45309" />
          </div>
          <span className="stat-val">{missingDocCases}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Document Assistance</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Total Relief Sanctioned</span>
            <CloudRain size={18} color="#4338CA" />
          </div>
          <span className="stat-val">₹{totalSanctioned.toLocaleString('en-IN')}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Approved DBT</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Relief Distributed</span>
            <CheckCircle2 size={18} color="#15803D" />
          </div>
          <span className="stat-val" style={{ color: '#15803D' }}>₹{totalDistributed.toLocaleString('en-IN')}</span>
          <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 600 }}>Bank Transferred</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Pending Relief Balance</span>
            <span className="black-badge" style={{ fontSize: '10px' }}>Tranche 2</span>
          </div>
          <span className="stat-val">₹{pendingReliefAmount.toLocaleString('en-IN')}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>To be released</span>
        </div>
      </div>

      {/* Multi-Parameter Filters (Section 11) */}
      <div className="panel-card" style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
            <Filter size={15} /> Filters:
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>State/UT:</span>
            <select className="form-select" style={{ padding: '6px 12px', fontSize: '12px' }} value={filterState} onChange={e => setFilterState(e.target.value)}>
              <option value="All">All States / UTs</option>
              {Object.keys(INDIAN_LOCATIONS).map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</span>
            <select className="form-select" style={{ padding: '6px 12px', fontSize: '12px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Verified">Verified</option>
              <option value="Partially Verified">Partially Verified</option>
              <option value="Disputed">Disputed</option>
              <option value="Special Verification Required">Special Verification Required</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Land-Use:</span>
            <select className="form-select" style={{ padding: '6px 12px', fontSize: '12px' }} value={filterLandType} onChange={e => setFilterLandType(e.target.value)}>
              <option value="All">All Land Types</option>
              {LAND_USE_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Official Land Claims Management Table */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Official Land Verification & Relief Roll ({filtered.length})</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Inspect cadastral claims, resolve land-use classification disputes, and issue verified title seals
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="classification-table">
            <thead>
              <tr>
                <th>Land ID / App ID</th>
                <th>Farmer Name</th>
                <th>Survey & Jurisdiction</th>
                <th>Land-Use Classification</th>
                <th>Legal Status</th>
                <th>Status</th>
                <th>Official Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.landId}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{p.landId}</div>
                    <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{p.applicationId}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.farmerName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.areaAcres} Acres ({p.areaHectares} ha)</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>Survey #{p.surveyNumber}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.village}, {p.district}, {p.state}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: p.hasClassificationMismatch ? '#DC2626' : 'var(--text-headline)' }}>
                      {p.finalClassification}
                    </div>
                    {p.hasClassificationMismatch && (
                      <span className="status-pill mismatch" style={{ fontSize: '9px', padding: '1px 6px' }}>
                        Mismatch Detected
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: 700, 
                      color: p.legalStatus === 'Clear' ? '#15803D' : '#DC2626' 
                    }}>
                      {p.legalStatus}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${p.status === 'Verified' ? 'verified' : p.status === 'Disputed' ? 'disputed' : 'pending'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn-black-pill" 
                        style={{ fontSize: '11px', padding: '6px 12px' }}
                        onClick={() => onOpenReport(p)}
                        title="View Official Report"
                      >
                        <FileText size={12} /> Report
                      </button>

                      {p.status !== 'Verified' && (
                        <button 
                          className="btn-gradient" 
                          style={{ fontSize: '11px', padding: '6px 12px' }}
                          onClick={() => {
                            setSelectedParcelForApproval(p);
                            setFinalClassificationDecision(p.selfDeclaredClassification);
                          }}
                        >
                          <Check size={12} /> Adjudicate & Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjudication & Official Final Approval Modal */}
      {selectedParcelForApproval && (
        <div className="modal-overlay" onClick={() => setSelectedParcelForApproval(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Official Land Title Adjudication</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Land ID: {selectedParcelForApproval.landId} • Farmer: {selectedParcelForApproval.farmerName}
                </span>
              </div>
              <button className="action-icon-btn" onClick={() => setSelectedParcelForApproval(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                Classification Audit
              </h4>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Self-Declared:</strong> {selectedParcelForApproval.selfDeclaredClassification}</div>
                <div><strong>Cadastral Record:</strong> {selectedParcelForApproval.governmentRecordClassification}</div>
                <div><strong>Ground Survey Finding:</strong> {selectedParcelForApproval.groundVerificationClassification}</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Final Legally-Binding Land-Use Classification</label>
              <select className="form-select" value={finalClassificationDecision} onChange={e => setFinalClassificationDecision(e.target.value)}>
                {LAND_USE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn-black-pill" style={{ background: '#64748B' }} onClick={() => setSelectedParcelForApproval(null)}>
                Cancel
              </button>
              <button className="btn-gradient" onClick={handleApprove}>
                Grant Official Verification Seal (LAND STATUS: VERIFIED ✓)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
