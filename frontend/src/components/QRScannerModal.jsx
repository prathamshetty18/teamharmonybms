import React, { useState } from 'react';
import { 
  X, 
  Camera, 
  Upload, 
  Search, 
  QrCode, 
  CheckCircle2, 
  FileText, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { simulateOCR } from '../services/api';

export default function QRScannerModal({ isOpen, onClose, parcels = [], onInspectParcel }) {
  const [activeTab, setActiveTab] = useState('camera'); // 'camera', 'upload', 'manual'
  const [manualInput, setManualInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [matchedParcel, setMatchedParcel] = useState(null);

  if (!isOpen) return null;

  const handleSimulateScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      // Pick a sample verified parcel or extract OCR
      const sample = parcels[0] || null;
      const ocr = simulateOCR("7/12 RTC Extract & Official QR");
      setScanResult(ocr);
      setMatchedParcel(sample);
      setIsScanning(false);
    }, 1200);
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (!manualInput) return;
    const found = parcels.find(p => 
      p.landId.toLowerCase().includes(manualInput.toLowerCase()) ||
      p.surveyNumber.toLowerCase().includes(manualInput.toLowerCase()) ||
      p.applicationId.toLowerCase().includes(manualInput.toLowerCase())
    );
    if (found) {
      setMatchedParcel(found);
      setScanResult({
        documentNumber: found.landId,
        documentType: "National Land Cadastre Record",
        extractedOwnerName: found.farmerName,
        extractedSurveyNumber: found.surveyNumber,
        extractedArea: `${found.areaAcres} Acres`,
        issuingAuthority: "Govt of India Land Registry",
        issueDate: found.verificationDate,
        ocrConfidence: "100% (Direct Ledger Match)",
        isVerifiedByGovt: found.status === 'Verified'
      });
    } else {
      alert("No official record found matching that ID or Survey Number.");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="landing-card-icon" style={{ width: '36px', height: '36px', background: '#FEF3C7', color: '#B45309' }}>
              <QrCode size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Document & QR Verification Scanner</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Inspect physical deeds, survey maps, or digital certificates
              </span>
            </div>
          </div>
          <button className="action-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Scan Method Switcher (Section 3) */}
        <div className="segmented-tabs" style={{ width: 'fit-content' }}>
          <button className={`seg-tab ${activeTab === 'camera' ? 'active' : ''}`} onClick={() => setActiveTab('camera')}>
            <Camera size={13} /> Camera Scan
          </button>
          <button className={`seg-tab ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
            <Upload size={13} /> Upload Image / PDF
          </button>
          <button className={`seg-tab ${activeTab === 'manual' ? 'active' : ''}`} onClick={() => setActiveTab('manual')}>
            <Search size={13} /> Enter Land ID
          </button>
        </div>

        {/* Camera Simulation Viewfinder */}
        {activeTab === 'camera' && (
          <div style={{
            height: '240px',
            background: '#0F172A',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Viewfinder Reticle */}
            <div style={{
              width: '180px',
              height: '180px',
              border: '2px dashed #3B82F6',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <QrCode size={48} color="#94A3B8" />
            </div>

            <div style={{ position: 'absolute', bottom: '16px', display: 'flex', gap: '8px' }}>
              <button className="btn-gradient" onClick={handleSimulateScan} disabled={isScanning}>
                {isScanning ? 'Processing OCR & Ledger...' : 'Scan Sample Physical Deed'}
              </button>
            </div>
          </div>
        )}

        {/* Upload View */}
        {activeTab === 'upload' && (
          <div style={{
            border: '2px dashed var(--border-light)',
            borderRadius: 'var(--radius-md)',
            padding: '40px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Upload size={32} color="var(--brand-primary)" />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Upload Land Document Image or PDF</div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Supports 7/12 RTC, Pahani, Patta Passbook, Sale Deeds (.pdf, .jpg, .png)
              </span>
            </div>
            <button className="btn-black-pill" onClick={handleSimulateScan}>
              Select File & Extract OCR
            </button>
          </div>
        )}

        {/* Manual Input View */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. LAND-IN-2026-8901 or 142/3B" 
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              style={{ flex: 1 }}
              required 
            />
            <button type="submit" className="btn-gradient">
              Search Record
            </button>
          </form>
        )}

        {/* Scan & OCR Results Display (Section 3 & 15) */}
        {scanResult && (
          <div style={{ 
            background: matchedParcel?.status === 'Verified' ? '#F0FDF4' : '#FFFBEB', 
            borderRadius: 'var(--radius-md)', 
            border: matchedParcel?.status === 'Verified' ? '1px solid #BBF7D0' : '1px solid #FDE68A',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color={matchedParcel?.status === 'Verified' ? '#15803D' : '#B45309'} />
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: matchedParcel?.status === 'Verified' ? '#14532D' : '#92400E' }}>
                  {matchedParcel?.status === 'Verified' ? '✓ Officially Verified on National Cadastre' : 'Extracted Record (Pending Verification)'}
                </h4>
              </div>
              <span className="black-badge" style={{ fontSize: '10px' }}>
                OCR Confidence: {scanResult.ocrConfidence}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px', fontSize: '12px' }}>
              <div><strong>Doc Type:</strong> {scanResult.documentType}</div>
              <div><strong>Survey / Plot:</strong> {scanResult.extractedSurveyNumber}</div>
              <div><strong>Landholder:</strong> {scanResult.extractedOwnerName}</div>
              <div><strong>Extracted Area:</strong> {scanResult.extractedArea}</div>
              <div><strong>Issuing Authority:</strong> {scanResult.issuingAuthority}</div>
              <div><strong>Audit Timestamp:</strong> {new Date().toLocaleTimeString()}</div>
            </div>

            {matchedParcel && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button 
                  className="btn-gradient" 
                  onClick={() => {
                    onInspectParcel(matchedParcel);
                    onClose();
                  }}
                >
                  Open Complete Cadastral Dossier →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
