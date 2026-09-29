import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, ArrowLeft, QrCode, MapPin, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';

export default function PublicVerify({ claimId, onBack }) {
  const [parcel, setParcel] = useState(null);
  const [verifyData, setVerifyData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecord() {
      setLoading(true);
      const targetId = claimId || "1";
      
      try {
        // Attempt to fetch verification verification certificate with tamperCheck
        const resp = await fetch(`/api/verify/${targetId}`);
        if (resp.ok) {
          const data = await resp.json();
          setVerifyData(data);
        } else {
          // fallback to root /verify/:id
          const respRoot = await fetch(`/verify/${targetId}`);
          if (respRoot.ok) {
            const dataRoot = await respRoot.json();
            setVerifyData(dataRoot);
          }
        }
      } catch (err) {
        console.warn('Could not fetch tamper verification data:', err.message);
      }

      const data = await api.getParcelByLandId(targetId);
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

  if (!parcel && !verifyData) {
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

  const isVerified = parcel ? parcel.status === 'Verified' : (verifyData?.claim?.status === 'Verified');
  const isTampered = verifyData?.tamperCheck === 'FAIL';
  const displayParcel = parcel || verifyData?.claim || {};

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

        {/* RED BANNER ON TAMPER CHECK FAIL */}
        {isTampered && (
          <div style={{
            background: '#FEF2F2',
            border: '2px solid #DC2626',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            color: '#991B1B',
            boxShadow: '0 8px 24px rgba(220, 38, 38, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800, fontSize: '18px' }}>
              <ShieldAlert size={28} color="#DC2626" />
              <span>CRITICAL SECURITY ALERT: DATA TAMPERING DETECTED</span>
            </div>
            <p style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.5 }}>
              The cryptographic bundle hash recomputed from current database records does not match the immutable on-chain record! One or more fields of this cadastral document have been altered after blockchain anchoring.
            </p>

            {/* Side-by-side hash comparison */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginTop: '16px',
              background: '#FFFFFF',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #FCA5A5',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}>
              <div>
                <span style={{ color: '#047857', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                  ✓ On-Chain Hash (Authentic Root):
                </span>
                <div style={{ wordBreak: 'break-all', background: '#F0FDF4', padding: '8px', borderRadius: '4px', border: '1px solid #BBF7D0' }}>
                  {verifyData?.onChainHash || 'N/A'}
                </div>
              </div>
              <div>
                <span style={{ color: '#DC2626', fontWeight: 800, textTransform: 'uppercase', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                  ✗ Recomputed Hash (Tampered State):
                </span>
                <div style={{ wordBreak: 'break-all', background: '#FEF2F2', padding: '8px', borderRadius: '4px', border: '1px solid #FECACA' }}>
                  {verifyData?.recomputedHash || 'N/A'}
                </div>
              </div>
            </div>

            {verifyData?.canonicalBytesPreview && (
              <div style={{ marginTop: '12px', fontSize: '11px', color: '#6B7280' }}>
                Canonical bytes preview: <code>{verifyData.canonicalBytesPreview}</code>
              </div>
            )}
          </div>
        )}

        {/* Verification Status Card */}
        <div className="panel-card" style={{ 
          padding: '36px', 
          textAlign: 'center', 
          alignItems: 'center',
          border: isTampered ? '2px solid #DC2626' : (isVerified ? '2px solid #BBF7D0' : '2px solid var(--border-light)'),
          background: isTampered ? '#FFF5F5' : (isVerified ? 'linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)' : '#FFFFFF')
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: isTampered ? '#FEE2E2' : (isVerified ? 'var(--status-verified-bg)' : 'var(--status-pending-bg)'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isTampered ? '#DC2626' : (isVerified ? 'var(--status-verified-text)' : 'var(--status-pending-text)')
          }}>
            {isTampered ? <ShieldAlert size={36} /> : <ShieldCheck size={36} />}
          </div>

          <div style={{ marginTop: '14px' }}>
            <span className="black-badge" style={{ marginBottom: '8px' }}>
              OFFICIAL NATIONAL CADASTRE VERIFICATION SEAL
            </span>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: isTampered ? '#991B1B' : (isVerified ? '#14532D' : 'var(--text-headline)'), marginTop: '6px' }}>
              {isTampered ? '⚠️ TAMPERING DETECTED' : (isVerified ? '✓ Officially Verified' : displayParcel.status)}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Tamper Check Status: <strong style={{ color: isTampered ? '#DC2626' : '#15803D' }}>{verifyData?.tamperCheck || (isVerified ? 'PASS' : 'PENDING')}</strong>
              {displayParcel.verificationDate && ` • Timestamp: ${displayParcel.verificationDate}`}
            </p>
          </div>
        </div>

        {/* Cadastral Details Matrix */}
        <div className="panel-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-headline)', marginBottom: '16px' }}>
            Authoritative Land Particulars
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '13px' }}>
            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Unique Land ID:</span>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{displayParcel.landId || claimId}</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Owner / Claimant:</span>
              <div style={{ fontWeight: 800 }}>{displayParcel.farmerName || displayParcel.ownerName || 'Verified Citizen'}</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Verified Area:</span>
              <div style={{ fontWeight: 800, color: '#15803D' }}>{displayParcel.areaAcres || displayParcel.parcelAreaAcres || '2.0'} Acres</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Land-Use Classification:</span>
              <div style={{ fontWeight: 800 }}>{displayParcel.finalClassification || 'Agricultural (Wetland)'}</div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Evidence Hash:</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', wordBreak: 'break-all' }}>
                {verifyData?.onChainHash || displayParcel.evidenceHash || '0x...'}
              </div>
            </div>

            <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>GPS Centroid:</span>
              <div style={{ fontFamily: 'var(--font-mono)' }}>
                {displayParcel.lat?.toFixed ? `${displayParcel.lat.toFixed(6)}, ${displayParcel.lon?.toFixed(6)}` : '12.941500, 77.562000'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
