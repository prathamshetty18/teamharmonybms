import React from 'react';
import { 
  X, 
  Printer, 
  Download, 
  MapPin, 
  QrCode, 
  ShieldCheck, 
  CheckCircle2, 
  Building2,
  FileText,
  CloudRain,
  Star,
  CheckCircle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function LandReportModal({ isOpen, onClose, parcel, onOpenQR }) {
  if (!isOpen || !parcel) return null;

  const handlePrint = () => {
    window.print();
  };

  // Determine if this is a disaster relief application or a land claim parcel
  const isReliefApp = Boolean(parcel.applicationId || parcel.disasterType);

  const claimId = parcel.landId || parcel.claimId || parcel.applicationId || 'N/A';
  const claimantName = parcel.citizenName || parcel.farmerName || parcel.claimantName || parcel.ownerName || 'Verified Citizen';
  const verifyUrl = `${window.location.origin}/verify/${parcel.landId || parcel.claimId || parcel.linkedClaimId || parcel.applicationId}`;
  
  const trustScore = Number(parcel.verificationScore || parcel.trustScore || (parcel.status === 'Verified' || parcel.status === 'Approved' ? 5 : parcel.status === 'Disputed' || parcel.status === 'Rejected' ? 1 : 3));
  
  const areaAcres = parcel.areaAcres ? Number(parcel.areaAcres) : 0;
  const areaHectares = parcel.areaHectares ? Number(parcel.areaHectares) : (areaAcres * 0.404686).toFixed(2);
  const areaSqM = parcel.areaSqM ? Number(parcel.areaSqM) : Math.round(areaAcres * 4046.86);

  const referenceRate = Number(parcel.referenceValuationPerAcre || 700000);
  const referenceVal = parcel.totalReferenceValue != null ? Number(parcel.totalReferenceValue) : Math.round(areaAcres * referenceRate);
  const marketVal = parcel.estimatedMarketValue != null ? Number(parcel.estimatedMarketValue) : Math.round(referenceVal * 1.3);

  const sealDate = parcel.verificationDate || parcel.approvalDate || parcel.verifiedAt || parcel.date || (parcel.createdAt ? new Date(parcel.createdAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'));
  const officer = parcel.verifiedByOfficer || parcel.verifiedBy || parcel.approvedBy || 'Revenue Divisional Authority';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '860px', padding: '32px' }} onClick={e => e.stopPropagation()}>
        {/* Modal Top Actions */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="brand-shield-icon">
              {isReliefApp ? <CloudRain size={22} /> : <ShieldCheck size={22} />}
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '0.05em' }}>
                MINISTRY OF REVENUE & DISASTER MANAGEMENT • GOVT OF INDIA
              </span>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-headline)' }}>
                {isReliefApp ? 'Official Disaster Relief Sanction & Assessment Report' : 'Official Land Verification & Title Report'}
              </h3>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-outline-pill" onClick={handlePrint}>
              <Printer size={14} /> Print Report
            </button>
            <button className="action-icon-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Report Printable Certificate Canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
          {/* Header Summary */}
          <div style={{ 
            background: 'linear-gradient(180deg, #F8FAFC 0%, #EDF2F7 100%)', 
            padding: '20px 24px', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <span className="black-badge" style={{ marginBottom: '6px' }}>
                {isReliefApp ? `RELIEF APPLICATION ID: ${parcel.applicationId}` : `UNIQUE LAND ID: ${claimId}`}
              </span>
              <h4 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-headline)' }}>
                Holding of {claimantName}
              </h4>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {isReliefApp ? (
                  <>Linked Claim: <strong>{parcel.linkedClaimId}</strong> • Event: <strong>{parcel.disasterType}</strong> ({parcel.date})</>
                ) : (
                  <>Survey #{parcel.surveyNumber || 'N/A'} {parcel.plotNumber ? `(${parcel.plotNumber})` : ''} • {parcel.village || ''}{parcel.taluk ? `, Taluk ${parcel.taluk}` : ''}{parcel.district ? `, Dist. ${parcel.district}` : ''}{parcel.state ? `, ${parcel.state}` : ''}</>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: 'white', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <QRCodeSVG value={verifyUrl} size={64} level="M" />
              </div>
              <div>
                <span className={`status-pill ${
                  parcel.status === 'Verified' || parcel.status === 'Approved' ? 'verified' :
                  parcel.status === 'Disputed' || parcel.status === 'Rejected' ? 'disputed' :
                  parcel.status === 'Verified - Awaiting Approval' ? 'ongoing' : 'pending'
                }`}>
                  {parcel.status === 'Verified' ? 'STATUS: VERIFIED ✓' :
                   parcel.status === 'Approved' ? 'STATUS: SANCTIONED ✓' :
                   `STATUS: ${parcel.status?.toUpperCase() || 'PENDING'}`}
                </span>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Verification Seal Date: {sealDate}
                </div>
              </div>
            </div>
          </div>

          {/* Trust Score & Integrity Banner */}
          <div style={{
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Cadastral Trust & Algorithmic Verification Score
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#15803D' }}>
                  ★ {trustScore}/5 Rating
                </span>
                <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>
                  ({trustScore >= 4 ? 'High Trust & Verified Integrity' : trustScore >= 3 ? 'Standard Credibility' : 'Verification Under Review'})
                </span>
              </div>
            </div>

            <div style={{ width: '180px' }}>
              <div style={{ fontSize: '10px', color: '#166534', marginBottom: '3px', fontWeight: 600 }}>
                Audit Confidence: {trustScore * 20}%
              </div>
              <div style={{ height: '8px', background: '#DCFCE7', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${trustScore * 20}%`, background: trustScore >= 4 ? '#15803D' : trustScore >= 3 ? '#EAB308' : '#DC2626' }}></div>
              </div>
            </div>
          </div>

          {/* Conditional Content: Relief App Assessment vs Cadastral Land Holding */}
          {isReliefApp ? (
            /* Relief Assessment Details */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>DISASTER EVENT</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-headline)', marginTop: '2px' }}>
                    {parcel.disasterType}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Date: {parcel.date}</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>ASSESSED DAMAGE</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#B91C1C', marginTop: '2px' }}>
                    {parcel.damagePercentage ? `${parcel.damagePercentage}% Damage` : 'Reported'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Category: {parcel.landUseCategory || 'Agricultural'}</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SUGGESTED COMPENSATION</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F766E', marginTop: '2px' }}>
                    {parcel.suggestedCompensation ? `₹${Number(parcel.suggestedCompensation).toLocaleString('en-IN')}` : '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Formula Rate Multiplier</div>
                </div>
              </div>

              {/* Compensation Details Matrix */}
              <div style={{ background: '#F8FAFC', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>
                  Financial Relief Sanction Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Citizen Requested Amount:</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-headline)' }}>
                      ₹{Number(parcel.requestedAmount || 0).toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Magistrate Sanctioned Amount:</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: parcel.approvedAmount ? '#15803D' : 'var(--text-muted)' }}>
                      {parcel.approvedAmount ? `₹${Number(parcel.approvedAmount).toLocaleString('en-IN')}` : 'Pending Sanction'}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Sanctioning Officer:</span>
                    <div style={{ fontWeight: 700 }}>{officer}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Status: {parcel.status}</div>
                  </div>
                </div>

                {parcel.description && (
                  <div style={{ marginTop: '14px', padding: '10px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '12px' }}>
                    <strong>Applicant Description:</strong> {parcel.description}
                  </div>
                )}
                {parcel.verificationNotes && (
                  <div style={{ marginTop: '8px', padding: '10px', background: '#F0FDF4', borderRadius: 'var(--radius-sm)', border: '1px solid #BBF7D0', fontSize: '12px' }}>
                    <strong>Officer Ground Inspection Notes:</strong> {parcel.verificationNotes}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Land Parcel Details */
            <>
              {/* 1. Cadastral Spatial & Boundary Extents */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SURFACE AREA (ACRES)</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
                    {areaAcres} Acres
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {areaHectares} Hectares • {areaSqM.toLocaleString()} m²
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>GPS CENTROID</span>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {parcel.lat != null && parcel.lon != null ? `${Number(parcel.lat).toFixed(6)}, ${Number(parcel.lon).toFixed(6)}` : 'Cadastral Benchmark Pegged'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Cadastral Survey Benchmark Pegged
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>LEGAL ENCUMBRANCE</span>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: parcel.legalStatus === 'Clear' ? '#15803D' : '#DC2626', marginTop: '2px' }}>
                    {parcel.legalStatus || 'Clear'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Revenue Registry Check Complete
                  </div>
                </div>
              </div>

              {/* 2. Land-Use Multi-Tier Audit */}
              <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ background: '#F8FAFC', padding: '10px 16px', fontWeight: 700, fontSize: '12px', borderBottom: '1px solid var(--border-light)' }}>
                  Land-Use Classification Multi-Tier Audit
                </div>
                <table className="classification-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Audit Stage</th>
                      <th>Classification Result</th>
                      <th>Source / Methodology</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Self-Declared (Citizen)</td>
                      <td>{parcel.selfDeclaredClassification || parcel.landUseCategory || 'Agricultural'}</td>
                      <td>Applicant Declaration</td>
                    </tr>
                    <tr>
                      <td>Government Cadastral Record</td>
                      <td>{parcel.governmentRecordClassification || parcel.landUseCategory || 'Agricultural'}</td>
                      <td>State Land Revenue Cadastre</td>
                    </tr>
                    <tr>
                      <td>Physical Ground Verification</td>
                      <td>{parcel.groundVerificationClassification || parcel.landUseCategory || 'Agricultural'}</td>
                      <td>Field Officer Physical Inspection</td>
                    </tr>
                    <tr style={{ background: '#F0FDF4', fontWeight: 700 }}>
                      <td>Official Final Classification</td>
                      <td style={{ color: parcel.hasClassificationMismatch ? '#DC2626' : '#15803D' }}>
                        {parcel.finalClassification || parcel.landUseCategory || 'Agricultural'}
                      </td>
                      <td>SDM / Tahsildar Final Seal</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 3. Valuation: Reference Value vs Market Value */}
              <div style={{ background: '#F8FAFC', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                  Government Reference Valuation vs Market Value
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Official Government Valuation:</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-headline)' }}>
                      ₹{referenceVal.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Rate: ₹{referenceRate.toLocaleString('en-IN')} / acre • Zone: {parcel.valuationZone || 'Zone A'}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Estimated Local Market Value:</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-headline)' }}>
                      ₹{marketVal.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '10px', color: '#B45309' }}>
                      * Market estimation is indicative and not represented as official government valuation.
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Attesting Authority:</span>
                    <div style={{ fontWeight: 700 }}>{officer}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Team ID: {parcel.verificationTeamId || 'CADASTRE-OFFICE'}</div>
                  </div>
                </div>
              </div>

              {/* 4. Community & Neighbor Signatures */}
              {parcel.communityAttestations && parcel.communityAttestations.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                    Community & Witness Attestation Logs ({parcel.communityAttestations.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {parcel.communityAttestations.map((att, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '12px' }}>
                        <span><strong>{att.name}</strong> ({att.role})</span>
                        <span className="black-badge" style={{ fontSize: '10px' }}>Consent Verified ✓</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Bottom Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
          <button className="btn-black-pill" onClick={handlePrint}>
            <Download size={14} /> Download Verified PDF
          </button>
          {!isReliefApp && onOpenQR && (
            <button className="btn-gradient" onClick={() => onOpenQR(parcel)}>
              <QrCode size={14} /> View Cryptographic QR Proof
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
