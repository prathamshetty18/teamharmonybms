import React, { useState } from 'react';
import { X, QrCode, ShieldCheck, Printer, Download, Check, ExternalLink, Star } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRCertificateModal({ isOpen, onClose, parcel }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !parcel) return null;

  const claimId = parcel.landId || parcel.claimId || 'N/A';
  const claimantName = parcel.citizenName || parcel.farmerName || parcel.claimantName || parcel.ownerName || 'Verified Citizen';
  const verifyUrl = `${window.location.origin}/verify/${claimId}`;

  const trustScore = Number(parcel.verificationScore || parcel.trustScore || (parcel.status === 'Verified' ? 5 : parcel.status === 'Disputed' ? 1 : 3));
  const areaAcres = parcel.areaAcres ? Number(parcel.areaAcres) : 0;
  const areaHectares = parcel.areaHectares ? Number(parcel.areaHectares) : (areaAcres * 0.404686).toFixed(2);

  const referenceVal = parcel.totalReferenceValue != null 
    ? Number(parcel.totalReferenceValue) 
    : Math.round(areaAcres * Number(parcel.referenceValuationPerAcre || 700000));

  const sealDate = parcel.verificationDate || parcel.verifiedAt || (parcel.createdAt ? new Date(parcel.createdAt).toLocaleDateString('en-IN') : 'Certified');
  const officer = parcel.verifiedByOfficer || parcel.verifiedBy || 'Revenue Divisional Officer';

  const copyUrl = () => {
    navigator.clipboard.writeText(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '600px', padding: '28px' }} onClick={e => e.stopPropagation()}>
        {/* Modal Top Actions */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="brand-shield-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Digital Land Ownership Certificate</h3>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Government of India • National Cadastre Registry
              </span>
            </div>
          </div>
          <button className="action-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Certificate Card Printable Body */}
        <div style={{
          border: '2px solid #BBF7D0',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
          textAlign: 'center',
          position: 'relative'
        }}>
          {/* Top Emblem & Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span className="black-badge">LAND ID: {claimId}</span>
            <span className={`status-pill ${parcel.status === 'Verified' ? 'verified' : 'pending'}`}>
              {parcel.status === 'Verified' ? 'LAND STATUS: VERIFIED ✓' : `STATUS: ${parcel.status?.toUpperCase() || 'PENDING'}`}
            </span>
          </div>

          <div style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803D', letterSpacing: '0.05em' }}>
              OFFICIAL TITLE REGISTRATION CERTIFICATE
            </span>
            <h4 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-headline)', marginTop: '2px' }}>
              {claimantName}
            </h4>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Survey #{parcel.surveyNumber || 'N/A'} {parcel.plotNumber ? `(${parcel.plotNumber})` : ''} • {parcel.village || ''}{parcel.taluk ? `, ${parcel.taluk}` : ''}{parcel.district ? `, ${parcel.district}` : ''}{parcel.state ? `, ${parcel.state}` : ''}
            </span>
          </div>

          {/* QR Code Container */}
          <div style={{
            background: 'white',
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            border: '1px solid #DCFCE7'
          }}>
            <QRCodeSVG value={verifyUrl} size={150} level="H" />
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Scan with any mobile device to inspect the official <strong>✓ Officially Verified</strong> record on the National Registry
          </div>

          {/* Verified Particulars Matrix */}
          <div style={{ 
            width: '100%', 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '8px', 
            textAlign: 'left',
            background: 'white',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #DCFCE7',
            fontSize: '11px'
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Verified Area:</span>
              <div style={{ fontWeight: 700, color: '#15803D' }}>{areaAcres} Acres ({areaHectares} ha)</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Trust Score:</span>
              <div style={{ fontWeight: 700, color: '#15803D' }}>★ {trustScore}/5 Rating</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Land-Use Classification:</span>
              <div style={{ fontWeight: 700 }}>{parcel.finalClassification || parcel.landUseCategory || 'Agricultural'}</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Govt Reference Valuation:</span>
              <div style={{ fontWeight: 700 }}>₹{referenceVal.toLocaleString('en-IN')}</div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Legal Status:</span>
              <div style={{ fontWeight: 700, color: parcel.legalStatus === 'Clear' ? '#15803D' : '#DC2626' }}>
                {parcel.legalStatus || 'Clear'}
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Verification Seal Date:</span>
              <div style={{ fontWeight: 700 }}>{sealDate}</div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ color: 'var(--text-muted)' }}>Issuing Attestation Officer:</span>
              <div style={{ fontWeight: 700 }}>{officer}</div>
            </div>
            <div style={{ gridColumn: 'span 2', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '8px 12px', borderRadius: 'var(--radius-sm)', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>
                  ⛓️ MST Blockchain Testnet Proof:
                </span>
                {(parcel.approvalTxHash || parcel.txHash) ? (
                  <a 
                    href={parcel.explorerUrl || `https://testnet.mstscan.com/tx/${parcel.approvalTxHash || parcel.txHash}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ fontSize: '11px', fontWeight: 800, color: '#15803D', textDecoration: 'underline' }}
                  >
                    🔗 View Tx {(parcel.approvalTxHash || parcel.txHash).slice(0, 14)}... ↗
                  </a>
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748B' }}>[pending]</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <button className="btn-black-pill" onClick={handlePrint}>
            <Printer size={14} /> Print Certificate
          </button>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-outline-pill" onClick={copyUrl}>
              {copied ? <Check size={14} color="#15803D" /> : <QrCode size={14} />}
              {copied ? 'Link Copied!' : 'Copy Verification URL'}
            </button>
            <a 
              href={`/verify/${claimId}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn-gradient"
            >
              Public Agency View
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
