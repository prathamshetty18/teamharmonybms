import React, { useState } from 'react';
import { 
  UserCheck, 
  FileText, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  QrCode, 
  CloudRain, 
  Camera, 
  Upload, 
  FileCheck, 
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { INDIAN_LOCATIONS, LAND_USE_TYPES } from '../data/mockData';
import { simulateOCR } from '../services/api';
import MapView from './MapView';

export default function FarmerPortalView({ 
  parcels = [], 
  onRegisterClaim, 
  onOpenReport, 
  onOpenQR, 
  onApplyDisasterRelief 
}) {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [mobileNumber, setMobileNumber] = useState('9847123456');
  const [farmerName, setFarmerName] = useState('Raghavan Nair');
  const [activeTab, setActiveTab] = useState('my-land'); // 'claim', 'my-land', 'status', 'disputes', 'docs'

  // Claim Form state
  const [claimState, setClaimState] = useState('Kerala');
  const [claimDistrict, setClaimDistrict] = useState('Wayanad');
  const [claimTaluk, setClaimTaluk] = useState('Vythiri');
  const [village, setVillage] = useState('Chooralmala');
  const [surveyNumber, setSurveyNumber] = useState('142/3B');
  const [plotNumber, setPlotNumber] = useState('Plot #14');
  const [areaAcres, setAreaAcres] = useState('2.8');
  const [landUseType, setLandUseType] = useState('Agricultural / Farmland');
  const [idDetails, setIdDetails] = useState('Aadhaar: 4912-8821-9901');

  // Document scanning & deficiency state
  const [hasMissingDocs, setHasMissingDocs] = useState(false);
  const [missingDocTypes, setMissingDocTypes] = useState([]);
  const [alternativeEvidence, setAlternativeEvidence] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState([
    { type: "7/12 RTC Extract", docNumber: "KL-WYD-2021-9982", ocrData: null }
  ]);
  const [ocrResult, setOcrResult] = useState(null);
  const [simulatedMismatch, setSimulatedMismatch] = useState(false);

  // Active verified parcel of logged-in farmer
  const verifiedParcel = parcels.find(p => p.farmerName.toLowerCase().includes(farmerName.toLowerCase()) || p.landId === "LAND-IN-2026-8901") || parcels[0];

  const handleSimulateScan = () => {
    const ocr = simulateOCR("RTC 7/12 Pahani Extract");
    setOcrResult(ocr);
    setUploadedDocs(prev => [
      ...prev,
      { type: ocr.documentType, docNumber: ocr.documentNumber, ocrData: ocr }
    ]);
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();

    let deficiency = null;
    if (hasMissingDocs) {
      deficiency = {
        missing: missingDocTypes.length > 0 ? missingDocTypes : ["Pattadar Passbook", "Pre-Disaster Title Deed"],
        alternativeEvidence: alternativeEvidence || "Affidavit from Village Gram Panchayat and electricity meter bill.",
        requiredNextAction: "Application routed for Special Verification / Document Assistance."
      };
    }

    await onRegisterClaim({
      farmerName,
      mobile: mobileNumber,
      idDetails,
      state: claimState,
      district: claimDistrict,
      taluk: claimTaluk,
      village,
      surveyNumber,
      plotNumber,
      areaAcres,
      landUseType,
      hasMissingDocs,
      missingDocuments: deficiency ? deficiency.missing : [],
      deficiencyReport: deficiency,
      hasMismatch: simulatedMismatch,
      documents: uploadedDocs
    });

    setActiveTab('status');
  };

  if (!isLoggedIn) {
    return (
      <div className="portal-content" style={{ maxWidth: '480px', marginTop: '40px' }}>
        <div className="panel-card" style={{ padding: '32px', textAlign: 'center' }}>
          <div className="landing-card-icon" style={{ background: '#EEF2FF', color: 'var(--brand-primary)', margin: '0 auto 16px auto' }}>
            <UserCheck size={28} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800 }}>Farmer & Landholder Login</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Access your registered land records, survey status, and disaster relief.
          </p>

          <form onSubmit={() => setIsLoggedIn(true)} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px', textAlign: 'left' }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input type="text" className="form-input" value={farmerName} onChange={e => setFarmerName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Registered Mobile Number</label>
              <input type="tel" className="form-input" placeholder="e.g. 9847123456" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Enter OTP (Simulated: 123456)</label>
              <input type="password" className="form-input" defaultValue="123456" required />
            </div>
            <button type="submit" className="btn-gradient" style={{ width: '100%', justifyContent: 'center' }}>
              Sign In to Farmer Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-content">
      {/* Farmer Profile Header */}
      <div className="panel-card" style={{ padding: '20px 24px', background: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--brand-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '18px' }}>
              {farmerName[0]}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800 }}>{farmerName}</h2>
                <span className="black-badge" style={{ fontSize: '10px' }}>VERIFIED CITIZEN</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Mobile: {mobileNumber} • Primary Holding: {verifiedParcel.state} ({verifiedParcel.district})
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-outline-pill" onClick={() => setActiveTab('claim')}>
              + New Land Claim
            </button>
            <button className="btn-gradient" onClick={() => onApplyDisasterRelief(verifiedParcel)}>
              <CloudRain size={15} />
              Apply Disaster Relief
            </button>
          </div>
        </div>

        {/* Farmer Navigation Tabs (Section 2) */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', marginTop: '16px' }}>
          {[
            { id: 'my-land', label: 'My Land' },
            { id: 'claim', label: 'Claim Your Land' },
            { id: 'applications', label: 'My Applications' },
            { id: 'status', label: 'Verification Status' },
            { id: 'map', label: 'Land Map' },
            { id: 'disputes', label: 'Legal Issues / Disputes' },
            { id: 'documents', label: 'Documents' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`seg-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. TAB: MY LAND SUMMARY (Section 17: FINAL FARMER DASHBOARD) */}
      {activeTab === 'my-land' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Official Verification Seal Card */}
          <div className="panel-card" style={{ 
            border: '2px solid #BBF7D0', 
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)',
            padding: '28px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={32} />
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#15803D', letterSpacing: '0.05em' }}>
                    MINISTRY OF REVENUE & LAND RESOURCES • GOVT OF INDIA
                  </span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#14532D', marginTop: '2px' }}>
                    LAND STATUS: VERIFIED ✓
                  </h3>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-black-pill" onClick={() => onOpenQR(verifiedParcel)}>
                  <QrCode size={15} /> Show QR Code
                </button>
                <button className="btn-gradient" onClick={() => onOpenReport(verifiedParcel)}>
                  <FileText size={15} /> View Full Report
                </button>
              </div>
            </div>

            {/* Final Farmer Details Matrix (Section 17) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
              <div style={{ background: 'white', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid #DCFCE7' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>UNIQUE LAND ID</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-headline)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                  {verifiedParcel.landId}
                </div>
              </div>

              <div style={{ background: 'white', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid #DCFCE7' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SURVEY NUMBER</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-headline)', marginTop: '4px' }}>
                  {verifiedParcel.surveyNumber} ({verifiedParcel.plotNumber})
                </div>
              </div>

              <div style={{ background: 'white', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid #DCFCE7' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>VERIFIED AREA</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                  {verifiedParcel.areaAcres} Acres
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  ({verifiedParcel.areaHectares} ha • {verifiedParcel.areaSqM.toLocaleString()} m²)
                </div>
              </div>

              <div style={{ background: 'white', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid #DCFCE7' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>LAND-USE TYPE</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-headline)', marginTop: '4px' }}>
                  {verifiedParcel.finalClassification}
                </div>
              </div>

              <div style={{ background: 'white', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid #DCFCE7' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>GOVT REFERENCE VALUE</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-headline)', marginTop: '4px' }}>
                  ₹{verifiedParcel.totalReferenceValue.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  (Est. Market: ₹{verifiedParcel.estimatedMarketValue.toLocaleString('en-IN')})
                </div>
              </div>

              <div style={{ background: 'white', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid #DCFCE7' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>LEGAL STATUS</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                  {verifiedParcel.legalStatus}
                </div>
              </div>
            </div>

            {/* Quick Action Buttons (Section 17) */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button className="btn-black-pill" onClick={() => setActiveTab('map')}>
                <MapPin size={14} /> View Land Map
              </button>
              <button className="btn-black-pill" onClick={() => onOpenReport(verifiedParcel)}>
                <FileCheck size={14} /> Download Certificate (PDF)
              </button>
              <button className="btn-black-pill" onClick={() => onOpenQR(verifiedParcel)}>
                <QrCode size={14} /> Show Verification QR
              </button>
              <button className="btn-gradient" onClick={() => onApplyDisasterRelief(verifiedParcel)}>
                <CloudRain size={14} /> Apply for Disaster Relief
              </button>
            </div>
          </div>

          {/* Disaster Relief Snapshot if Active */}
          {verifiedParcel.hasDisasterClaim && (
            <div className="panel-card">
              <div className="panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CloudRain size={20} color="#4F46E5" />
                  <h3 className="panel-title">Linked Disaster Relief Claim: {verifiedParcel.disasterClaim.claimId}</h3>
                </div>
                <span className="status-pill verified">
                  {verifiedParcel.disasterClaim.approvalStatus}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Disaster Event</span>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>{verifiedParcel.disasterClaim.disasterType} ({verifiedParcel.disasterClaim.disasterDate})</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Assessed Damage</span>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#DC2626' }}>{verifiedParcel.disasterClaim.damagePercentage}% Impact</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sanctioned Compensation</span>
                  <div style={{ fontSize: '15px', fontWeight: 800 }}>₹{verifiedParcel.disasterClaim.sanctionedAmount.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>DBT Released Amount</span>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803D' }}>₹{verifiedParcel.disasterClaim.releasedAmount.toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. TAB: CLAIM YOUR LAND (Section 2, 3, 4) */}
      {activeTab === 'claim' && (
        <form onSubmit={handleClaimSubmit} className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Claim Your Land (New Cadastral Registration)</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Step-by-step land record registration with Document OCR and Deficiency Support
              </span>
            </div>
          </div>

          {/* Section: Cadastral Location Details */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>
              1. Geographic & Cadastral Location
            </h4>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">State / UT</label>
                <select className="form-select" value={claimState} onChange={e => setClaimState(e.target.value)}>
                  {Object.keys(INDIAN_LOCATIONS).map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">District</label>
                <input type="text" className="form-input" value={claimDistrict} onChange={e => setClaimDistrict(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Taluk / Tehsil</label>
                <input type="text" className="form-input" value={claimTaluk} onChange={e => setClaimTaluk(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Village / Locality</label>
                <input type="text" className="form-input" value={village} onChange={e => setVillage(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Survey / Plot Number</label>
                <input type="text" className="form-input" value={surveyNumber} onChange={e => setSurveyNumber(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Total Land Area (Acres)</label>
                <input type="number" step="0.1" className="form-input" value={areaAcres} onChange={e => setAreaAcres(e.target.value)} required />
              </div>
            </div>
          </div>

          {/* Section: Land-Use Classification (Section 4) */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
              2. Land-Use Type (Self-Declared)
            </h4>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Select the primary category of your land. This will initially be marked <strong>Self-Declared</strong> and verified against official revenue records and ground survey.
            </span>

            <div className="form-grid" style={{ marginTop: '14px' }}>
              <div className="form-group">
                <label className="form-label">Select Land-Use Category</label>
                <select className="form-select" value={landUseType} onChange={e => setLandUseType(e.target.value)}>
                  {LAND_USE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Demo Mismatch Simulation Toggle */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-headline)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={simulatedMismatch} 
                    onChange={e => setSimulatedMismatch(e.target.checked)} 
                  />
                  <span>Simulate Government Record Mismatch (For Testing Review Workflow)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section: Document Scanning & Missing Documents (Section 3) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700 }}>
                  3. Existing Documents & OCR Scanner
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Upload physical deeds, 7/12 RTC, Patta passbooks, or scan using camera
                </span>
              </div>

              <button 
                type="button" 
                className="btn-outline-pill"
                onClick={handleSimulateScan}
              >
                <Camera size={15} />
                Scan Document with OCR
              </button>
            </div>

            {/* OCR Extracted Result Banner */}
            {ocrResult && (
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                    ✓ OCR Extracted Data (Confidence: {ocrResult.ocrConfidence})
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    * Extracted information is subject to official field verification
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '10px', fontSize: '12px' }}>
                  <div><strong>Doc Type:</strong> {ocrResult.documentType}</div>
                  <div><strong>Doc No:</strong> {ocrResult.documentNumber}</div>
                  <div><strong>Survey:</strong> {ocrResult.extractedSurveyNumber}</div>
                  <div><strong>Extracted Area:</strong> {ocrResult.extractedArea}</div>
                  <div><strong>Issuing Authority:</strong> {ocrResult.issuingAuthority}</div>
                </div>
              </div>
            )}

            {/* Missing Documents Flow (Section 3: "I don't have the required documents") */}
            <div style={{ marginTop: '20px', padding: '18px', background: '#FFFBEB', borderRadius: 'var(--radius-md)', border: '1px solid #FDE68A' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HelpCircle size={18} color="#B45309" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>
                    “I don't have the required documents / Physical records were lost in disaster”
                  </span>
                </div>
                <button 
                  type="button" 
                  className="btn-black-pill" 
                  style={{ background: hasMissingDocs ? '#B45309' : '#0F172A', fontSize: '11px', padding: '6px 14px' }}
                  onClick={() => setHasMissingDocs(!hasMissingDocs)}
                >
                  {hasMissingDocs ? 'Enabled: Document Assistance' : 'Request Document Assistance'}
                </button>
              </div>

              {hasMissingDocs && (
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <p style={{ fontSize: '12px', color: '#78350F' }}>
                    Your claim will NOT be rejected. A <strong>Document Deficiency Report</strong> will be created, and an authorized Field Officer will be assigned for Special Ground & Community Verification.
                  </p>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#78350F' }}>Which documents are missing?</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Original Ancestral Deed, Title Passbook washed away in flood" 
                      onChange={e => setMissingDocTypes([e.target.value])} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: '#78350F' }}>Alternative Evidence Available</label>
                    <textarea 
                      className="form-textarea" 
                      rows="2"
                      placeholder="e.g. Electricity bill, Panchayat tax receipt, statements from adjoining plot neighbors..."
                      value={alternativeEvidence}
                      onChange={e => setAlternativeEvidence(e.target.value)}
                    />
                  </div>

                  <span className="status-pill pending" style={{ width: 'fit-content' }}>
                    Status: Document Assistance / Special Verification Required
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button type="submit" className="btn-gradient">
              Submit Land Claim for Verification →
            </button>
          </div>
        </form>
      )}

      {/* 3. TAB: VERIFICATION STATUS TIMELINE (Section 7 & 16) */}
      {activeTab === 'status' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Unified Application Verification Journey</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Application: <strong>{verifiedParcel.applicationId}</strong> • Land ID: <strong>{verifiedParcel.landId}</strong>
              </span>
            </div>
            <span className={`status-pill ${verifiedParcel.status === 'Verified' ? 'verified' : verifiedParcel.status === 'Disputed' ? 'disputed' : 'pending'}`}>
              {verifiedParcel.status}
            </span>
          </div>

          {/* Stepper Progress Bar (Section 7: 6 Stages) */}
          <div className="timeline-stepper">
            {[
              { label: "1. Claim Submitted", completed: true },
              { label: "2. Document Verif.", completed: true },
              { label: "3. Ground Verif.", completed: true },
              { label: "4. Community/NGO", completed: verifiedParcel.verificationScore >= 4 },
              { label: "5. Land Classification", completed: verifiedParcel.verificationScore >= 4 },
              { label: "6. Govt Approval", completed: verifiedParcel.status === 'Verified' }
            ].map((step, idx) => (
              <div key={idx} className="timeline-step">
                <div className={`step-bubble ${step.completed ? 'completed' : 'active'}`}>
                  {step.completed ? '✓' : idx + 1}
                </div>
                <span className={`step-label ${step.completed ? 'active' : ''}`}>{step.label}</span>
              </div>
            ))}
          </div>

          {/* Land-Use Classification Comparison Table (Section 4) */}
          <div style={{ background: '#F8FAFC', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
              Multi-Tier Land-Use Classification Audit
            </h4>

            {verifiedParcel.hasClassificationMismatch && (
              <div className="mismatch-banner" style={{ marginBottom: '14px' }}>
                <AlertTriangle size={20} />
                <div>
                  <div className="mismatch-title">⚠️ Land-Use Classification Mismatch Detected</div>
                  <div className="mismatch-desc">
                    Self-declared usage does not match the authoritative government cadastral registry or physical ground inspection. Sent for legal review.
                  </div>
                </div>
              </div>
            )}

            <table className="classification-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Source</th>
                  <th>Classification</th>
                  <th>Verification Seal</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1. Applicant Declaration</td>
                  <td>Farmer Application</td>
                  <td>{verifiedParcel.selfDeclaredClassification}</td>
                  <td>Self-Declared</td>
                </tr>
                <tr>
                  <td>2. Cadastral Survey</td>
                  <td>Govt Revenue Ledger</td>
                  <td>{verifiedParcel.governmentRecordClassification}</td>
                  <td>State Cadastral Map</td>
                </tr>
                <tr>
                  <td>3. Field Inspection</td>
                  <td>Ground Survey Team</td>
                  <td>{verifiedParcel.groundVerificationClassification}</td>
                  <td>Physical GPS & Boundary Pegs</td>
                </tr>
                <tr style={{ background: '#FFFFFF', fontWeight: 700 }}>
                  <td>4. Final Classification</td>
                  <td>Authorized Officer Seal</td>
                  <td style={{ color: verifiedParcel.hasClassificationMismatch ? '#DC2626' : '#15803D' }}>
                    {verifiedParcel.finalClassification}
                  </td>
                  <td>{verifiedParcel.hasClassificationMismatch ? 'Action Required' : 'Approved ✓'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. TAB: CADASTRAL MAP (Section 6) */}
      {activeTab === 'map' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Cadastral Boundary Map: Survey #{verifiedParcel.surveyNumber}</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                GPS: {verifiedParcel.lat.toFixed(4)}, {verifiedParcel.lon.toFixed(4)} • Verified Area: {verifiedParcel.areaAcres} Acres
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="black-badge">{verifiedParcel.areaHectares} Hectares</span>
              <span className="black-badge">{verifiedParcel.areaSqM.toLocaleString()} Sq. Metres</span>
            </div>
          </div>

          <div style={{ height: '520px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <MapView 
              parcels={[verifiedParcel]} 
              selectedParcel={verifiedParcel} 
              onSelectParcel={() => {}} 
            />
          </div>
        </div>
      )}

      {/* 5. TAB: LEGAL STATUS & DISPUTES (Section 8) */}
      {activeTab === 'disputes' && (
        <div className="panel-card">
          <div className="panel-header">
            <h3 className="panel-title">Legal Title & Dispute Audit</h3>
            <span className={`status-pill ${verifiedParcel.legalStatus === 'Clear' ? 'verified' : 'disputed'}`}>
              {verifiedParcel.legalStatus}
            </span>
          </div>

          {verifiedParcel.disputeDetails ? (
            <div className="mismatch-banner">
              <AlertTriangle size={24} />
              <div>
                <div className="mismatch-title">⚠️ Legal Issue Detected</div>
                <div className="mismatch-desc">{verifiedParcel.disputeDetails}</div>
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#991B1B' }}>
                  <strong>Relevant Office:</strong> Sub-Divisional Magistrate / Land Adjudication Tribunal
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px', background: '#F0FDF4', borderRadius: 'var(--radius-md)', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <CheckCircle2 size={24} color="#15803D" />
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#14532D' }}>
                  Title Clear: No Encumbrances or Disputes Logged
                </h4>
                <p style={{ fontSize: '12px', color: '#166534', marginTop: '2px' }}>
                  This land holding has completed comprehensive title checks, neighbor boundary consents, and municipal clearance.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. TAB: MY APPLICATIONS (Section 2) */}
      {activeTab === 'applications' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">My Registered Land Claim Applications</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Track progress across ground verification, cadastral review, and government sanction
              </span>
            </div>
            <button className="btn-black-pill" onClick={() => setActiveTab('claim')}>
              + File New Claim
            </button>
          </div>

          <table className="classification-table">
            <thead>
              <tr>
                <th>Application ID</th>
                <th>Land ID</th>
                <th>Survey / Plot</th>
                <th>Land Type</th>
                <th>Current Stage</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parcels.filter(p => p.farmerName.toLowerCase().includes(farmerName.toLowerCase()) || p.landId === verifiedParcel.landId).map(p => (
                <tr key={p.landId}>
                  <td><strong>{p.applicationId}</strong></td>
                  <td><code style={{ fontFamily: 'var(--font-mono)' }}>{p.landId}</code></td>
                  <td>Survey #{p.surveyNumber} ({p.village})</td>
                  <td>{p.finalClassification}</td>
                  <td><span className="black-badge" style={{ fontSize: '10px' }}>{p.stage}</span></td>
                  <td>
                    <span className={`status-pill ${p.status === 'Verified' ? 'verified' : p.status === 'Disputed' ? 'disputed' : 'pending'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn-outline-pill" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => setActiveTab('status')}>
                      View Timeline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 7. TAB: DOCUMENTS & DEFICIENCY DOSSIER (Section 3) */}
      {activeTab === 'documents' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Land Records & Document Deficiency Dossier</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Section 3: Documents Available • Missing Documents • Alternative Evidence • Next Actions
              </span>
            </div>
            <button className="btn-outline-pill" onClick={handleSimulateScan}>
              <Camera size={14} /> Scan New Physical Document
            </button>
          </div>

          {/* Section 3 Display: Available, Missing, Pending, Alternative Evidence, Next Action */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Documents Available */}
            <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#15803D', marginBottom: '8px' }}>
                ✓ Documents Available & Verified ({verifiedParcel.documents?.length || 0})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {verifiedParcel.documents?.map((d, i) => (
                  <div key={i} style={{ background: 'white', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <strong>{d.type}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Doc #{d.docNumber}</div>
                    </div>
                    <span className="status-pill verified" style={{ fontSize: '10px', padding: '2px 8px' }}>Officially Verified</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Documents Missing & Deficiency Report */}
            <div style={{ background: '#FFFBEB', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid #FDE68A' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#B45309', marginBottom: '8px' }}>
                ⚠️ Documents Missing & Alternative Evidence
              </h4>
              {verifiedParcel.missingDocuments?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  <div>
                    <strong>Missing Documents:</strong>
                    <div style={{ color: '#92400E', marginTop: '2px' }}>{verifiedParcel.missingDocuments.join(', ')}</div>
                  </div>
                  <div>
                    <strong>Alternative Evidence Logged:</strong>
                    <div style={{ color: 'var(--text-body)', marginTop: '2px' }}>
                      {verifiedParcel.deficiencyReport?.alternativeEvidence || "Panchayat consensus testimony and historical electricity tariff receipts."}
                    </div>
                  </div>
                  <div style={{ marginTop: '4px', padding: '8px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid #FDE68A' }}>
                    <strong>Required Next Action:</strong>
                    <div style={{ color: '#B45309' }}>
                      {verifiedParcel.deficiencyReport?.requiredNextAction || "Special Verification Team will visit parcel for neighbor boundary consensus."}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#78350F' }}>
                  No missing documents reported. Full cadastral dossier is complete.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
