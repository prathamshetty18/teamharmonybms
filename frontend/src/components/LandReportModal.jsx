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
  FileText
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function LandReportModal({ isOpen, onClose, parcel, onOpenQR }) {
  if (!isOpen || !parcel) return null;

  const handlePrint = () => {
    window.print();
  };

  const verifyUrl = `${window.location.origin}/verify/${parcel.landId}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '840px', padding: '32px' }} onClick={e => e.stopPropagation()}>
        {/* Modal Top Actions */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="brand-shield-icon">
              <ShieldCheck size={22} />
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--brand-primary)', letterSpacing: '0.05em' }}>
                MINISTRY OF REVENUE & DISASTER MANAGEMENT • GOVT OF INDIA
              </span>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-headline)' }}>
                Official Land Verification Report
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
                UNIQUE LAND ID: {parcel.landId}
              </span>
              <h4 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-headline)' }}>
                Holding of {parcel.farmerName}
              </h4>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Survey #{parcel.surveyNumber} ({parcel.plotNumber}) • {parcel.village}, Taluk {parcel.taluk}, Dist. {parcel.district}, {parcel.state}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: 'white', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <QRCodeSVG value={verifyUrl} size={64} level="M" />
              </div>
              <div>
                <span className={`status-pill ${parcel.status === 'Verified' ? 'verified' : 'pending'}`}>
                  {parcel.status === 'Verified' ? 'LAND STATUS: VERIFIED ✓' : parcel.status}
                </span>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Verification Seal Date: {parcel.verificationDate}
                </div>
              </div>
            </div>
          </div>

          {/* 1. Cadastral Spatial & Boundary Extents (Section 6 & 9) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SURFACE AREA (ACRES)</span>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
                {parcel.areaAcres} Acres
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {parcel.areaHectares} Hectares • {parcel.areaSqM.toLocaleString()} m²
              </div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>GPS CENTROID</span>
              <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                {parcel.lat.toFixed(6)}, {parcel.lon.toFixed(6)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Cadastral Survey Benchmark Pegged
              </div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>LEGAL ENCUMBRANCE</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: parcel.legalStatus === 'Clear' ? '#15803D' : '#DC2626', marginTop: '2px' }}>
                {parcel.legalStatus}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Revenue Registry Check Complete
              </div>
            </div>
          </div>

          {/* 2. Land-Use Multi-Tier Audit (Section 4 & 9) */}
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
                  <td>Self-Declared (Farmer)</td>
                  <td>{parcel.selfDeclaredClassification}</td>
                  <td>Applicant Declaration</td>
                </tr>
                <tr>
                  <td>Government Cadastral Record</td>
                  <td>{parcel.governmentRecordClassification}</td>
                  <td>State Land Revenue Cadastre</td>
                </tr>
                <tr>
                  <td>Physical Ground Verification</td>
                  <td>{parcel.groundVerificationClassification}</td>
                  <td>Field Officer Physical Inspection</td>
                </tr>
                <tr style={{ background: '#F0FDF4', fontWeight: 700 }}>
                  <td>Official Final Classification</td>
                  <td style={{ color: parcel.hasClassificationMismatch ? '#DC2626' : '#15803D' }}>
                    {parcel.finalClassification}
                  </td>
                  <td>SDM / Tahsildar Final Seal</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 3. Valuation: Reference Value vs Market Value (Section 10) */}
          <div style={{ background: '#F8FAFC', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
              Government Reference Valuation vs Market Value
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Official Government Valuation:</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-headline)' }}>
                  ₹{parcel.totalReferenceValue.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Rate: ₹{(parcel.referenceValuationPerAcre || 700000).toLocaleString('en-IN')} / acre • Zone: {parcel.valuationZone}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Estimated Local Market Value:</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-headline)' }}>
                  ₹{(parcel.estimatedMarketValue || parcel.totalReferenceValue * 1.3).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '10px', color: '#B45309' }}>
                  * Market estimation is indicative and not represented as official government valuation.
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Attesting Authority:</span>
                <div style={{ fontWeight: 700 }}>{parcel.verifiedByOfficer}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Team ID: {parcel.verificationTeamId}</div>
              </div>
            </div>
          </div>

          {/* 4. Community & Neighbor Signatures */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
              Community & Witness Attestation Logs ({parcel.communityAttestations?.length || 0})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {parcel.communityAttestations?.map((att, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '12px' }}>
                  <span><strong>{att.name}</strong> ({att.role})</span>
                  <span className="black-badge" style={{ fontSize: '10px' }}>Consent Verified ✓</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
          <button className="btn-black-pill" onClick={handlePrint}>
            <Download size={14} /> Download Verified PDF
          </button>
          <button className="btn-gradient" onClick={() => onOpenQR(parcel)}>
            <QrCode size={14} /> View Cryptographic QR Proof
          </button>
        </div>
      </div>
    </div>
  );
}
