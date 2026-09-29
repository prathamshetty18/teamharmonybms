import React, { useState } from 'react';
import { 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Camera, 
  Users, 
  FileCheck2, 
  Clock, 
  Eye, 
  ArrowRight,
  X
} from 'lucide-react';
import { LAND_USE_TYPES } from '../data/mockData';

export default function GroundVerificationView({ 
  parcels = [], 
  onSubmitVerification 
}) {
  const [teamId, setTeamId] = useState('TEAM-WYD-04');
  const [officerName, setOfficerName] = useState('Devendra Patil (Circle Officer)');
  const [selectedCase, setSelectedCase] = useState(null);

  // Form State for Active Case Inspection
  const [groundLandUse, setGroundLandUse] = useState('Agricultural / Farmland');
  const [physicalNotes, setPhysicalNotes] = useState('');
  const [verifiedArea, setVerifiedArea] = useState('');
  const [neighborName, setNeighborName] = useState('');
  const [ngoName, setNgoName] = useState('');
  const [verificationResult, setVerificationResult] = useState('Verified');
  const [disputeReason, setDisputeReason] = useState('');

  const handleOpenCase = (parcel) => {
    setSelectedCase(parcel);
    setGroundLandUse(parcel.groundVerificationClassification !== 'Pending Verification' ? parcel.groundVerificationClassification : parcel.selfDeclaredClassification);
    setPhysicalNotes(parcel.groundNotes || 'Boundary stones checked against village revenue cadastral map. Terrain verified.');
    setVerifiedArea(parcel.areaAcres.toString());
  };

  const handleSubmitFindings = async (e) => {
    e.preventDefault();
    if (!selectedCase) return;

    const attestations = [];
    if (neighborName) {
      attestations.push({
        name: neighborName,
        role: "Neighbor",
        status: "Verified",
        weight: 1,
        date: "Today"
      });
    }
    if (ngoName) {
      attestations.push({
        name: ngoName,
        role: "Accredited NGO",
        status: "Verified",
        weight: 3,
        date: "Today"
      });
    }

    await onSubmitVerification(selectedCase.landId, {
      teamId,
      officerName,
      groundLandUse,
      groundNotes: physicalNotes,
      result: verificationResult,
      disputeReason,
      attestations
    });

    setSelectedCase(null);
  };

  return (
    <div className="portal-content">
      {/* Verification Team Header */}
      <div className="panel-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Ground Verification Taskforce</h2>
                <span className="black-badge" style={{ fontSize: '10px' }}>{teamId}</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Reporting Officer: <strong>{officerName}</strong> • Jurisdiction: South Zone
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <span className="status-pill pending">
              {parcels.filter(p => p.status !== 'Verified').length} Pending Inspection
            </span>
          </div>
        </div>
      </div>

      {/* Assigned Cases Table (Section 5) */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Assigned Field Verification Docket</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Cadastral boundaries, satellite coordinates & document verification cases
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="classification-table">
            <thead>
              <tr>
                <th>App / Land ID</th>
                <th>Farmer Name</th>
                <th>Survey & Location</th>
                <th>Land Type (Declared)</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parcels.map(p => (
                <tr key={p.landId}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-headline)' }}>{p.applicationId}</div>
                    <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{p.landId}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.farmerName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.mobile}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>Survey #{p.surveyNumber}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.village}, {p.district}</div>
                  </td>
                  <td>
                    <span className="black-badge" style={{ fontSize: '10px' }}>
                      {p.selfDeclaredClassification}
                    </span>
                  </td>
                  <td>
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: 700, 
                      color: p.hasClassificationMismatch ? '#DC2626' : '#15803D' 
                    }}>
                      {p.hasClassificationMismatch ? 'URGENT REVIEW' : 'Normal'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${p.status === 'Verified' ? 'verified' : p.status === 'Disputed' ? 'disputed' : 'pending'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <button 
                      className="btn-black-pill" 
                      style={{ fontSize: '11px', padding: '6px 14px' }}
                      onClick={() => handleOpenCase(p)}
                    >
                      <Eye size={12} /> Inspect Case
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Case Review Inspection Modal (Section 5) */}
      {selectedCase && (
        <div className="modal-overlay" onClick={() => setSelectedCase(null)}>
          <div className="modal-content" style={{ maxWidth: '780px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="black-badge">{selectedCase.applicationId}</span>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Field Verification Record</h3>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Land ID: {selectedCase.landId} • Survey #{selectedCase.surveyNumber} ({selectedCase.village}, {selectedCase.district})
                </span>
              </div>
              <button className="action-icon-btn" onClick={() => setSelectedCase(null)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitFindings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 1. Document Authenticity Audit */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileCheck2 size={16} color="var(--brand-primary)" />
                  1. Document Authenticity Check
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  {selectedCase.documents?.map((doc, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'white', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <span><strong>{doc.type}</strong> ({doc.docNumber})</span>
                      <span className="status-pill verified" style={{ padding: '2px 8px', fontSize: '10px' }}>Genuine Document ✓</span>
                    </div>
                  ))}
                  {selectedCase.missingDocuments?.length > 0 && (
                    <div style={{ background: '#FFFBEB', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid #FDE68A', color: '#92400E', marginTop: '6px' }}>
                      <strong>Missing Records:</strong> {selectedCase.missingDocuments.join(', ')}
                      <div style={{ fontSize: '11px', marginTop: '2px' }}>
                        * Alternative evidence logged. Field team must establish boundary by neighbor consensus.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Physical Ground Verification */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Camera size={16} color="var(--brand-primary)" />
                  2. Physical Inspection & Land-Use Verification
                </h4>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Self-Declared Land Use</label>
                    <input type="text" className="form-input" value={selectedCase.selfDeclaredClassification} disabled style={{ background: '#f1f5f9' }} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ground Verified Land-Use</label>
                    <select className="form-select" value={groundLandUse} onChange={e => setGroundLandUse(e.target.value)}>
                      {LAND_USE_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedCase.selfDeclaredClassification !== groundLandUse && (
                  <div className="mismatch-banner" style={{ marginTop: '12px' }}>
                    <AlertTriangle size={18} />
                    <div style={{ fontSize: '12px' }}>
                      <strong>Warning:</strong> You are reporting a land-use discrepancy! This will trigger a <code>⚠️ Land-Use Classification Mismatch</code> warning and route to Revenue Tahsildar.
                    </div>
                  </div>
                )}

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Field Surveyor Notes & Boundary Marker Findings</label>
                  <textarea 
                    className="form-textarea" 
                    rows="2"
                    value={physicalNotes}
                    onChange={e => setPhysicalNotes(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* 3. Community Verification (Section 5) */}
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={16} color="var(--brand-primary)" />
                  3. Community & Neighbor Witness Verification
                </h4>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Adjoining Plot Neighbor (Witness Name)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. S. K. Raman (Survey 142/3A)" 
                      value={neighborName}
                      onChange={e => setNeighborName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Accredited NGO / Community Body</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Kerala Disaster Relief Mission" 
                      value={ngoName}
                      onChange={e => setNgoName(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 4. Final Verdict */}
              <div className="form-group">
                <label className="form-label">Field Verification Result</label>
                <select className="form-select" value={verificationResult} onChange={e => setVerificationResult(e.target.value)}>
                  <option value="Verified">Verified (All boundaries & land use confirmed)</option>
                  <option value="Partially Verified">Partially Verified (Requires additional evidence)</option>
                  <option value="Requires Legal Review">Requires Legal Review (Dispute / Mismatch)</option>
                  <option value="Disputed">Disputed (Contested ownership)</option>
                </select>
              </div>

              {verificationResult === 'Requires Legal Review' && (
                <div className="form-group">
                  <label className="form-label">Reason for Legal Escalation</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Specify boundary dispute or land-use discrepancy details..." 
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                    required
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn-black-pill" style={{ background: '#64748B' }} onClick={() => setSelectedCase(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-gradient">
                  Submit Field Report to Government Portal →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
