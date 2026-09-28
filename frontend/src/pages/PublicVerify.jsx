import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, ArrowLeft, QrCode, MapPin } from 'lucide-react';
import { api } from '../services/api';

export default function PublicVerify({ claimId, onBack }) {
  const [parcel, setParcel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecord() {
      setLoading(true);
      const data = await api.getParcelByLandId(claimId || "LAND-IN-2026-8901");
      setParcel(data);
      setLoading(false);
    }
    fetchRecord();
  }, [claimId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>
          Querying National Land Registry (BhoomiSetu)...
        </span>
      </div>
    );
  }

  if (!parcel) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <h2>Cadastral Record Not Found</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
          No verified land record matching Land ID or Survey Number "{claimId}".
        </p>
        <button className="btn-black-pill" style={{ marginTop: '20px' }} onClick={onBack}>
          Return to Portal
        </button>
      </div>
    );
  }

  const isVerified = parcel.status === 'Verified';

  return (
    <div style={{ minHeight: '100vh', width: '100vw', background: 'var(--bg-app)', padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Navigation & Official Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="btn-black-pill" style={{ background: '#64748B', padding: '6px 14px', fontSize: '12px' }} onClick={onBack}>
            <ArrowLeft size={14} /> Return to Main Portal
          </button>
          <div className="gov-flag-emblem" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-headline)' }}>
            <span>🇮🇳</span> Government of India • Cadastral Proof
          </div>
        </div>

        {/* Verification Status Card (Section 15: "Show: ✓ Officially Verified with verification timestamp") */}
        <div className="panel-card" style={{ 
          padding: '36px', 
          textAlign: 'center', 
          alignItems: 'center',
          border: isVerified ? '2px solid #BBF7D0' : '2px solid var(--border-light)',
          background: isVerified ? 'linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)' : '#FFFFFF'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: isVerified ? 'var(--status-verified-bg)' : 'var(--status-pending-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isVerified ? 'var(--status-verified-text)' : 'var(--status-pending-text)'
          }}>
            <ShieldCheck size={36} />
          </div>

          <div style={{ marginTop: '14px' }}>
            <span className="black-badge" style={{ marginBottom: '8px' }}>
              OFFICIAL NATIONAL CADASTRE VERIFICATION SEAL
            </span>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: isVerified ? '#14532D' : 'var(--text-headline)', marginTop: '6px' }}>
              {isVerified ? '✓ Officially Verified' : parcel.status}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Verification Timestamp: <strong>{parcel.verificationDate}</strong> • Verified by: {parcel.verifiedByOfficer}
            </p>
          </div>
        </div>

        {/* Cadastral Details Matrix (Section 15) */}
        <div className="panel-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-headline)', marginBottom: '16px' }}>
            Authoritative Land Particulars
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Unique Land ID:</span>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{parcel.landId}</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Survey / Plot Number:</span>
              <div style={{ fontWeight: 800 }}>Survey #{parcel.surveyNumber} ({parcel.plotNumber})</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Verified Area:</span>
              <div style={{ fontWeight: 800, color: '#15803D' }}>{parcel.areaAcres} Acres ({parcel.areaHectares} ha • {parcel.areaSqM.toLocaleString()} m²)</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Land-Use Classification:</span>
              <div style={{ fontWeight: 800 }}>{parcel.finalClassification}</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Location / Jurisdiction:</span>
              <div style={{ fontWeight: 700 }}>{parcel.village}, Taluk {parcel.taluk}, {parcel.district}, {parcel.state}</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Legal Encumbrance Status:</span>
              <div style={{ fontWeight: 800, color: parcel.legalStatus === 'Clear' ? '#15803D' : '#DC2626' }}>
                {parcel.legalStatus}
              </div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Govt Reference Valuation:</span>
              <div style={{ fontWeight: 800 }}>₹{parcel.totalReferenceValue?.toLocaleString('en-IN')}</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>GPS Centroid:</span>
              <div style={{ fontFamily: 'var(--font-mono)' }}>{parcel.lat?.toFixed(6)}, {parcel.lon?.toFixed(6)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
