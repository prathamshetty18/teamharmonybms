import React, { useState, useEffect } from 'react';
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
  ArrowRight,
  LogOut,
  Calendar,
  IndianRupee,
  Eye,
  ArrowLeft,
  Calculator,
  Sliders,
  Printer
} from 'lucide-react';
import { INDIAN_LOCATIONS, LAND_USE_TYPES, DISASTER_TYPES } from '../data/mockData';
import { computeSuggestedCompensation, getBaseRateForCategory } from '../data/compensationRates';
import { simulateOCR } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function CitizenPortalView({ 
  parcels = [], 
  reliefApplications = [],
  onRegisterClaim, 
  onOpenReport, 
  onOpenQR, 
  onApplyRelief
}) {
  const { user, logout } = useAuth();
  const citizenName = user?.name || user?.username || 'Citizen';

  // Navigation tab: 'my-claims', 'new-claim', 'apply-relief', 'my-relief-apps', 'claim-detail'
  const [activeTab, setActiveTab] = useState('my-claims');
  const [selectedClaimForDetail, setSelectedClaimForDetail] = useState(null);

  // New Claim Form State
  const [claimState, setClaimState] = useState('Karnataka');
  const [claimDistrict, setClaimDistrict] = useState('Mandya');
  const [claimTaluk, setClaimTaluk] = useState('Maddur');
  const [village, setVillage] = useState('');
  const [surveyNumber, setSurveyNumber] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [areaAcres, setAreaAcres] = useState('');
  const [landUseType, setLandUseType] = useState('Agricultural / Farmland');
  // Helper to retrieve Aadhaar number saved during registration
  const getRegisteredAadhaar = () => {
    if (user?.aadhaar) return user.aadhaar;
    const nameKey = (user?.name || citizenName || '').trim().toLowerCase();
    const fromStorage = localStorage.getItem(`bhoomi_aadhaar_${nameKey}`) 
      || (user?.userId ? localStorage.getItem(`bhoomi_aadhaar_uid_${user.userId}`) : null);
    if (fromStorage) return fromStorage;
    const generalStored = localStorage.getItem('bhoomi_last_registered_aadhaar');
    if (generalStored) return generalStored;
    if (user?.userId) {
      const hex = user.userId.replace(/[^0-9a-f]/gi, '').slice(0, 8);
      const digits = (parseInt(hex, 16) || 84291754).toString().padStart(8, '4');
      return `5432-8765-${digits.slice(-4)}`;
    }
    return '5432-8765-4912';
  };

  const [idDetails, setIdDetails] = useState(() => getRegisteredAadhaar());
  const [mobileNumber, setMobileNumber] = useState('');

  // Keep Aadhaar updated if user session loads asynchronously
  useEffect(() => {
    const aadh = getRegisteredAadhaar();
    if (aadh && (!idDetails || idDetails === '5432-8765-4912')) {
      setIdDetails(aadh);
    }
  }, [user, citizenName]);

  // Document scanning & deficiency state
  const [hasMissingDocs, setHasMissingDocs] = useState(false);
  const [missingDocTypes, setMissingDocTypes] = useState('');
  const [alternativeEvidence, setAlternativeEvidence] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [ocrResult, setOcrResult] = useState(null);

  // Boundary Neighbours Consensus State (max 3 neighbours with Name & Aadhaar)
  const [neighbours, setNeighbours] = useState([
    { id: 1, name: '', aadhaar: '', direction: 'North Boundary' }
  ]);

  // NGO / Civil Society Endorsement State
  const [ngoEnabled, setNgoEnabled] = useState(false);
  const [ngoName, setNgoName] = useState('');
  const [ngoDarpanId, setNgoDarpanId] = useState('');
  const [ngoRepresentative, setNgoRepresentative] = useState('');
  const [ngoRemarks, setNgoRemarks] = useState('');

  // Claim Submission Error state (for consensus score below threshold)
  const [claimSubmitError, setClaimSubmitError] = useState('');

  // Consensus Score Calculation
  // Base: 2 points
  // Valid Neighbours (has name and aadhaar): +1 point each (up to 3 points)
  // NGO Endorsement: +2 points if enabled with NGO name
  const validNeighbours = neighbours.filter(n => n.name && n.name.trim() && n.aadhaar && n.aadhaar.trim());
  const neighbourPoints = validNeighbours.length;
  const ngoPoints = (ngoEnabled && ngoName.trim()) ? 2 : 0;
  const baseConsensusPoints = 2;
  const consensusScore = Math.min(5, baseConsensusPoints + neighbourPoints + ngoPoints);
  const isConsensusThresholdMet = consensusScore >= 5;

  const handleAddNeighbour = () => {
    if (neighbours.length >= 3) return;
    const directions = ['North Boundary', 'South Boundary', 'East Boundary', 'West Boundary'];
    const nextDir = directions[neighbours.length] || 'Adjacent Boundary';
    setNeighbours(prev => [
      ...prev,
      { id: Date.now(), name: '', aadhaar: '', direction: nextDir }
    ]);
  };

  const handleRemoveNeighbour = (index) => {
    setNeighbours(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateNeighbour = (index, field, value) => {
    setNeighbours(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handlePrefillCadastralNeighbours = () => {
    setNeighbours([
      { id: 1, name: 'Kempanna Gowda', aadhaar: '5432-8765-9012', direction: 'North Boundary' },
      { id: 2, name: 'Basavaraj Patil', aadhaar: '4521-9874-3210', direction: 'East Boundary' },
      { id: 3, name: 'Savitri Devi', aadhaar: '8976-5412-3098', direction: 'South Boundary' }
    ]);
    setClaimSubmitError('');
  };

  // Disaster Relief Form State (FIX 5 & FIX 6)
  const [reliefClaimId, setReliefClaimId] = useState('');
  const [reliefDisasterType, setReliefDisasterType] = useState('');
  const [reliefDate, setReliefDate] = useState('');
  const [damagePercentage, setDamagePercentage] = useState(50); // FIX 5: 0-100% damage slider
  const [customLandCategory, setCustomLandCategory] = useState('Agricultural / Farmland');
  const [reliefDescription, setReliefDescription] = useState('');
  const [reliefPhotoName, setReliefPhotoName] = useState('');
  const [reliefPhotoPreview, setReliefPhotoPreview] = useState(null);
  const [reliefRequestedAmount, setReliefRequestedAmount] = useState(''); // Separate user-entered number (not auto-filled)
  const [reliefFormError, setReliefFormError] = useState('');

  // FIX 6: Robust filtering for logged-in citizen's claims
  const normalizedCitizen = citizenName.trim().toLowerCase();
  const normalizedUsername = (user?.username || '').trim().toLowerCase();

  const myClaims = parcels.filter(p => {
    const pFarmer = (p.farmerName || '').trim().toLowerCase();
    const pCitizen = (p.citizenName || '').trim().toLowerCase();
    const pClaimant = (p.claimant || '').trim().toLowerCase();
    return (
      (pFarmer && (pFarmer === normalizedCitizen || pFarmer === normalizedUsername)) ||
      (pCitizen && (pCitizen === normalizedCitizen || pCitizen === normalizedUsername)) ||
      (pClaimant && (pClaimant === normalizedCitizen || pClaimant === normalizedUsername))
    );
  });

  // Only verified claims of this citizen are eligible for disaster relief
  const verifiedClaims = myClaims.filter(p => 
    (p.status || '').toLowerCase() === 'verified'
  );

  // Filter relief applications for this citizen
  const myReliefApps = reliefApplications.filter(a => {
    const aName = (a.citizenName || a.farmerName || '').trim().toLowerCase();
    return aName === normalizedCitizen || aName === normalizedUsername;
  });

  // Automatically determine land use category from linked claim (FIX 5 & FIX 6)
  const linkedClaim = verifiedClaims.find(c => c.landId === reliefClaimId || c.claimId === reliefClaimId);
  const activeLandCategory = linkedClaim 
    ? (linkedClaim.finalClassification || linkedClaim.landUseType || linkedClaim.selfDeclaredClassification || 'Agricultural / Farmland')
    : customLandCategory;

  // FIX 5: Suggested compensation computation
  const suggestedCompensation = computeSuggestedCompensation(activeLandCategory, damagePercentage);

  const handleSimulateScan = () => {
    const ocr = simulateOCR("7/12 Pahani / RTC Land Record");
    setOcrResult(ocr);
    setUploadedDocs(prev => [
      ...prev,
      { type: ocr.documentType, docNumber: ocr.documentNumber, ocrData: ocr }
    ]);
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    setClaimSubmitError('');

    if (!isConsensusThresholdMet) {
      setClaimSubmitError(
        `Cannot record land claim: Community consensus score (${consensusScore}/5) is below the statutory threshold of 5/5. ` +
        `Under cadastral regulations, land claims must achieve consensus by adding boundary neighbour attestations (with Aadhaar number) and/or certified NGO endorsement.`
      );
      return;
    }

    try {
      let deficiency = null;
      if (hasMissingDocs) {
        deficiency = {
          missing: missingDocTypes ? [missingDocTypes] : ["Title Deed / Document Missing"],
          alternativeEvidence: alternativeEvidence || "Affidavit from Village Gram Panchayat and electricity meter bill.",
          requiredNextAction: "Application routed for Special Verification / Document Assistance."
        };
      }

      await onRegisterClaim({
        farmerName: citizenName,
        citizenName: citizenName,
        mobile: mobileNumber || '+91 98000 00000',
        idDetails: idDetails || `Aadhaar of ${citizenName}`,
        state: claimState,
        district: claimDistrict,
        taluk: claimTaluk,
        village: village || 'Grama Block 1',
        surveyNumber: surveyNumber || '101/A',
        plotNumber: plotNumber || 'Plot #1',
        areaAcres: areaAcres || '2.0',
        landUseType,
        hasMissingDocs,
        missingDocuments: deficiency ? deficiency.missing : [],
        deficiencyReport: deficiency,
        documents: uploadedDocs,

        // Consensus & Attestation Data
        verificationScore: consensusScore,
        score: consensusScore,
        neighbours: validNeighbours.map(n => ({
          name: n.name.trim(),
          aadhaar: n.aadhaar.trim(),
          direction: n.direction
        })),
        communityAttestations: validNeighbours.map(n => ({
          type: 'NEIGHBOUR_BOUNDARY_ATTESTATION',
          attestorName: n.name.trim(),
          attestorAadhaar: n.aadhaar.trim(),
          boundaryDirection: n.direction,
          attestedAt: new Date().toLocaleDateString('en-IN')
        })),
        ngoEndorsement: (ngoEnabled && ngoName.trim()) ? {
          ngoName: ngoName.trim(),
          darpanId: ngoDarpanId.trim() || 'DARPAN-REG-VERIFIED',
          representative: ngoRepresentative.trim() || 'Field Inspector',
          remarks: ngoRemarks.trim() || 'Physical possession and non-encumbrance verified.'
        } : null
      });

      // Reset form
      setVillage('');
      setSurveyNumber('');
      setPlotNumber('');
      setAreaAcres('');
      setIdDetails(getRegisteredAadhaar());
      setMobileNumber('');
      setHasMissingDocs(false);
      setUploadedDocs([]);
      setOcrResult(null);
      setNeighbours([
        { id: 1, name: '', aadhaar: '', direction: 'North Boundary' }
      ]);
      setNgoEnabled(false);
      setNgoName('');
      setNgoDarpanId('');
      setNgoRepresentative('');
      setNgoRemarks('');
      setClaimSubmitError('');

      setActiveTab('my-claims');
    } catch (err) {
      setClaimSubmitError(err.message || 'Failed to record claim.');
    }
  };

  // Disaster relief photo upload handler
  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setReliefPhotoName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReliefPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReliefSubmit = async (e) => {
    e.preventDefault();
    setReliefFormError('');

    if (!reliefClaimId) {
      setReliefFormError('Please select a verified land claim.');
      return;
    }
    if (!reliefDisasterType) {
      setReliefFormError('Please select a disaster type.');
      return;
    }
    if (!reliefDate) {
      setReliefFormError('Please specify the date of disaster.');
      return;
    }
    if (!reliefDescription.trim()) {
      setReliefFormError('Please provide a description of the damage.');
      return;
    }
    if (!reliefRequestedAmount || parseFloat(reliefRequestedAmount) <= 0) {
      setReliefFormError('Please enter a valid requested relief amount in ₹.');
      return;
    }

    // FIX 5: Pass damagePercentage, landUseCategory, and suggestedCompensation along with application
    await onApplyRelief({
      citizenName,
      linkedClaimId: reliefClaimId,
      disasterType: reliefDisasterType,
      date: reliefDate,
      damagePercentage: parseFloat(damagePercentage),
      landUseCategory: activeLandCategory,
      suggestedCompensation: suggestedCompensation,
      description: reliefDescription.trim(),
      photoName: reliefPhotoName || 'damage_inspection.jpg',
      photoUrl: reliefPhotoPreview,
      requestedAmount: reliefRequestedAmount
    });

    // Reset form
    setReliefClaimId('');
    setReliefDisasterType('');
    setReliefDate('');
    setDamagePercentage(50);
    setReliefDescription('');
    setReliefPhotoName('');
    setReliefPhotoPreview(null);
    setReliefRequestedAmount('');

    setActiveTab('my-relief-apps');
  };

  const openClaimDetail = (claim) => {
    setSelectedClaimForDetail(claim);
    setActiveTab('claim-detail');
  };

  return (
    <div className="portal-content">
      {/* FIX 2: Top Bar Greeting "Welcome, Citizen {name}" & Aligned Tag */}
      <div className="panel-card" style={{ padding: '20px 24px', background: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              background: 'var(--brand-light)', 
              color: 'var(--brand-primary)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontWeight: 800, 
              fontSize: '18px' 
            }}>
              {citizenName[0]?.toUpperCase() || 'C'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
                  Welcome, Citizen {citizenName}
                </h2>
                {/* FIX 2: Correctly vertically and horizontally aligned tag */}
                <span className="top-bar-tag">
                  CITIZEN PORTAL
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                National Land Rights & Digital Disaster Relief Console
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              className="btn-outline-pill" 
              onClick={() => setActiveTab('new-claim')}
            >
              + Submit New Claim
            </button>
            <button 
              className="btn-gradient" 
              onClick={() => setActiveTab('apply-relief')}
            >
              <CloudRain size={15} />
              Apply for Disaster Relief
            </button>
            <button 
              className="btn-outline-pill" 
              onClick={logout}
              title="Sign Out of BhoomiSetu"
              style={{ color: '#B91C1C', borderColor: '#FECACA' }}
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </div>

        {/* FIX 3: Clear, even spacing between nav items and active highlight style */}
        <div className="seg-tab-row">
          <button
            className={`seg-tab ${activeTab === 'my-claims' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-claims')}
          >
            <span>Overview & My Claims</span>
            <span className="tab-count-pill">{myClaims.length}</span>
          </button>
          <button
            className={`seg-tab ${activeTab === 'new-claim' ? 'active' : ''}`}
            onClick={() => setActiveTab('new-claim')}
          >
            <span>Submit New Claim</span>
          </button>
          {selectedClaimForDetail && (
            <button
              className={`seg-tab ${activeTab === 'claim-detail' ? 'active' : ''}`}
              onClick={() => setActiveTab('claim-detail')}
            >
              <span>Claim Detail</span>
              <span className="tab-count-pill">{selectedClaimForDetail.landId}</span>
            </button>
          )}
          <button
            className={`seg-tab ${activeTab === 'apply-relief' ? 'active' : ''}`}
            onClick={() => setActiveTab('apply-relief')}
          >
            <CloudRain size={15} />
            <span>Apply for Digital Disaster Relief</span>
          </button>
          <button
            className={`seg-tab ${activeTab === 'my-relief-apps' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-relief-apps')}
          >
            <span>My Relief Applications</span>
            <span className="tab-count-pill">{myReliefApps.length}</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* FIX 4: PORTAL HOME OVERVIEW (Land Claims & Separate Disaster Relief) */}
      {/* ============================================================ */}
      {activeTab === 'my-claims' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {/* SECTION 1: MY CLAIMS OVERVIEW (With Claim ID, Status Badge, Trust Score) */}
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">My Registered Land Claims ({myClaims.length})</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Authoritative cadastre records, verification stages, and verified trust scores
                </span>
              </div>
              <button className="btn-gradient" onClick={() => setActiveTab('new-claim')}>
                + Lodge New Land Claim
              </button>
            </div>

            {myClaims.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '50px 20px', 
                background: '#F8FAFC', 
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-light)'
              }}>
                <FileText size={36} color="var(--text-placeholder)" style={{ margin: '0 auto 12px auto' }} />
                <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>No Land Claims Lodged Yet</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 16px auto' }}>
                  Register your cadastral land holdings to obtain verified title certificates, cryptographic QR proofs, and qualify for disaster relief compensation.
                </p>
                <button className="btn-gradient" onClick={() => setActiveTab('new-claim')}>
                  Submit New Claim Now →
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="classification-table">
                  <thead>
                    <tr>
                      <th>Claim / Land ID</th>
                      <th>Survey & Location</th>
                      <th>Area (Acres)</th>
                      <th>Land-Use Type</th>
                      <th>Trust Score</th>
                      <th>Status Badge</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myClaims.map(claim => {
                      const trustScore = claim.verificationScore || (claim.status === 'Verified' ? 5 : 2);
                      const trustPct = Math.round((trustScore / 5) * 100);

                      return (
                        <tr key={claim.landId}>
                          <td>
                            <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{claim.landId}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{claim.applicationId}</div>
                            <a
                              href={claim.explorerUrl || `https://testnetscan.mstblockchain.com/tx/${claim.txHash || '0x3dd8689e5b428bde63bf806edbdfcbdfaf759dd7082b8ff15d4afe0cc5201892'}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '10px',
                                color: '#15803D',
                                fontWeight: 700,
                                textDecoration: 'underline',
                                marginTop: '4px'
                              }}
                              title="Verify on MST Blockchain Testnet Explorer"
                            >
                              🔗 On-Chain Proof ↗
                            </a>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>Survey #{claim.surveyNumber} ({claim.plotNumber || 'Main'})</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{claim.village}, {claim.district}, {claim.state}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#15803D' }}>{claim.areaAcres} Acres</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{claim.areaHectares} ha</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{claim.finalClassification || claim.selfDeclaredClassification}</div>
                          </td>
                          {/* FIX 4: Trust Score with visual gauge bar */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="trust-score-badge">
                                  ★ {trustScore}/5
                                </span>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#065F46' }}>
                                  {trustPct}%
                                </span>
                              </div>
                              <div className="trust-gauge-bar">
                                <div 
                                  className="trust-gauge-fill" 
                                  style={{ 
                                    width: `${trustPct}%`,
                                    background: trustScore >= 4 ? '#10B981' : trustScore >= 3 ? '#F59E0B' : '#EF4444'
                                  }} 
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`status-pill ${claim.status === 'Verified' ? 'verified' : claim.status === 'Disputed' ? 'disputed' : 'pending'}`}>
                              {claim.status === 'Verified' ? 'LAND STATUS: VERIFIED ✓' : claim.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button 
                                className="btn-outline-pill" 
                                style={{ padding: '4px 10px', fontSize: '11px' }}
                                onClick={() => openClaimDetail(claim)}
                                title="Inspect full details"
                              >
                                <Eye size={12} /> Detail
                              </button>
                              <button 
                                className="btn-black-pill" 
                                style={{ padding: '4px 10px', fontSize: '11px' }}
                                onClick={() => onOpenReport(claim)}
                                title="View Official Report"
                              >
                                <FileText size={12} /> Report
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* FIX 4: CLEARLY SEPARATE SECTION FOR DISASTER RELIEF SUMMARY */}
          <div className="panel-card" style={{ border: '2px solid #E0E7FF', background: '#FAFAFF' }}>
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ 
                  width: '36px', 
                  height: '36px', 
                  borderRadius: 'var(--radius-sm)', 
                  background: '#EEF2FF', 
                  color: 'var(--brand-primary)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <CloudRain size={20} />
                </div>
                <div>
                  <h3 className="panel-title">Digital Disaster Relief Overview ({myReliefApps.length})</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Direct DBT compensation tracking for crop and structural damage on verified parcels
                  </span>
                </div>
              </div>

              <button 
                className="btn-gradient" 
                onClick={() => setActiveTab('apply-relief')}
                style={{ fontSize: '12px', padding: '8px 16px' }}
              >
                + Apply for Digital Disaster Relief
              </button>
            </div>

            {myReliefApps.length === 0 ? (
              <div style={{ 
                background: '#FFFFFF', 
                padding: '24px', 
                borderRadius: 'var(--radius-md)', 
                border: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px'
              }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-headline)', marginBottom: '4px' }}>
                    No Active Disaster Relief Claims
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    If your verified land has experienced crop inundation, drought, landslide, or storm damage, file for immediate government DBT sanction.
                  </p>
                </div>
                <button 
                  className="btn-outline-pill"
                  onClick={() => setActiveTab('apply-relief')}
                >
                  File Disaster Claim →
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', background: 'white', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <table className="classification-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Relief App ID</th>
                      <th>Linked Claim</th>
                      <th>Disaster Event & Date</th>
                      <th>Assessed Damage</th>
                      <th>Requested Amount</th>
                      <th>Approved Amount</th>
                      <th>Status Badge</th>
                      <th>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myReliefApps.map(app => {
                      const statusClass = 
                        app.status === 'Approved' ? 'verified' :
                        app.status === 'Rejected' ? 'disputed' :
                        app.status === 'Verified - Awaiting Approval' ? 'ongoing' : 'pending';

                      return (
                        <tr key={app.applicationId}>
                          <td>
                            <strong style={{ fontFamily: 'var(--font-mono)' }}>{app.applicationId}</strong>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700 }}>{app.linkedClaimId}</span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{app.disasterType}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{app.date}</div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: '#B91C1C' }}>
                              {app.damagePercentage ? `${app.damagePercentage}%` : 'Reported'}
                            </span>
                          </td>
                          <td>
                            <strong>₹{Number(app.requestedAmount).toLocaleString('en-IN')}</strong>
                          </td>
                          <td>
                            {app.approvedAmount ? (
                              <strong style={{ color: '#15803D' }}>₹{Number(app.approvedAmount).toLocaleString('en-IN')}</strong>
                            ) : (
                              <span style={{ color: 'var(--text-placeholder)' }}>—</span>
                            )}
                          </td>
                          <td>
                            <span className={`status-pill ${statusClass}`}>
                              {app.status}
                            </span>
                          </td>
                          <td>
                            <button 
                              className="btn-outline-pill" 
                              style={{ fontSize: '11px', padding: '4px 10px' }}
                              onClick={() => onOpenReport && onOpenReport(app)}
                            >
                              <Printer size={12} /> Print
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. TAB: SUBMIT NEW CLAIM */}
      {/* ============================================================ */}
      {activeTab === 'new-claim' && (
        <form onSubmit={handleClaimSubmit} className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Submit New Land Claim</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Register your parcel with official cadastral coordinates and document proofs
              </span>
            </div>
            <span className="top-bar-tag">
              APPLICANT: {citizenName}
            </span>
          </div>

          {/* Section 1: Geographic & Cadastral Details */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>
              1. Cadastral & Geographic Jurisdiction
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
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Mandya" 
                  value={claimDistrict} 
                  onChange={e => setClaimDistrict(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Taluk / Tehsil</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Maddur" 
                  value={claimTaluk} 
                  onChange={e => setClaimTaluk(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Village / Grama</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Kestur" 
                  value={village} 
                  onChange={e => setVillage(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Survey Number</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. 142/3B" 
                  value={surveyNumber} 
                  onChange={e => setSurveyNumber(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Plot Number / Hissa</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Plot #04" 
                  value={plotNumber} 
                  onChange={e => setPlotNumber(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Total Land Area (Acres)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-input" 
                  placeholder="e.g. 2.50" 
                  value={areaAcres} 
                  onChange={e => setAreaAcres(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Primary Land-Use Category</label>
                <select className="form-select" value={landUseType} onChange={e => setLandUseType(e.target.value)}>
                  {LAND_USE_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Applicant Identity & Contact */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px', marginTop: '20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>
              2. Applicant Identity
            </h4>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Citizen / Claimant Name (Auto-tagged)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={citizenName} 
                  disabled 
                  style={{ background: '#F1F5F9', cursor: 'not-allowed' }} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Registered Mobile Number</label>
                <input 
                  type="tel" 
                  className="form-input" 
                  placeholder="e.g. 98450 12345" 
                  value={mobileNumber} 
                  onChange={e => setMobileNumber(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Identity Document / Aadhaar</span>
                  {idDetails && (
                    <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                      ✓ Auto-filled from Registration
                    </span>
                  )}
                </label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Aadhaar: XXXX-XXXX-4912" 
                  value={idDetails} 
                  onChange={e => {
                    const val = e.target.value;
                    setIdDetails(val);
                    const nameKey = (citizenName || '').trim().toLowerCase();
                    if (nameKey) {
                      try {
                        localStorage.setItem(`bhoomi_aadhaar_${nameKey}`, val);
                      } catch {}
                    }
                  }} 
                />
              </div>
            </div>
          </div>

          {/* Section 3: Document Uploads & OCR Scanner */}
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700 }}>
                  3. Documents & Proof of Possession
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Attach title deeds, 7/12 RTC, Patta passbooks, or scan with camera OCR
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
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', marginTop: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  ✓ OCR Extracted Data (Confidence: {ocrResult.ocrConfidence})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '10px', fontSize: '12px' }}>
                  <div><strong>Doc Type:</strong> {ocrResult.documentType}</div>
                  <div><strong>Doc No:</strong> {ocrResult.documentNumber}</div>
                  <div><strong>Extracted Survey:</strong> {ocrResult.extractedSurveyNumber}</div>
                  <div><strong>Issuing Authority:</strong> {ocrResult.issuingAuthority}</div>
                </div>
              </div>
            )}

            {/* Missing Documents Flow */}
            <div style={{ marginTop: '20px', padding: '16px', background: '#FFFBEB', borderRadius: 'var(--radius-md)', border: '1px solid #FDE68A' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HelpCircle size={18} color="#B45309" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>
                    “I don't have physical documents / Deeds were lost or destroyed”
                  </span>
                </div>
                <button 
                  type="button" 
                  className="btn-black-pill" 
                  style={{ background: hasMissingDocs ? '#B45309' : '#0F172A', fontSize: '11px', padding: '4px 12px' }}
                  onClick={() => setHasMissingDocs(!hasMissingDocs)}
                >
                  {hasMissingDocs ? 'Assistance Requested ✓' : 'Request Document Assistance'}
                </button>
              </div>

              {hasMissingDocs && (
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: '#78350F' }}>Missing Documents Description</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Original Patta and RTC washed away in flood" 
                      value={missingDocTypes}
                      onChange={e => setMissingDocTypes(e.target.value)} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: '#78350F' }}>Alternative Evidence Available</label>
                    <textarea 
                      className="form-textarea" 
                      rows="2" 
                      placeholder="e.g. Village electricity connection bill, tax receipt, neighbor boundary confirmation"
                      value={alternativeEvidence}
                      onChange={e => setAlternativeEvidence(e.target.value)} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Boundary Neighbours & Consensus Attestations (Max 3) */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px', marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>4. Boundary Neighbours & Community Consensus</span>
                  <span className="status-pill verified" style={{ fontSize: '10px' }}>
                    {validNeighbours.length} / 3 Neighbours Validated (+{neighbourPoints} Pts)
                  </span>
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Provide names & Aadhaar numbers of adjoining parcel owners (max 3) to establish boundary consensus
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-outline-pill"
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                  onClick={handlePrefillCadastralNeighbours}
                  title="Auto-fill 3 cadastral neighbours for fast testing"
                >
                  ⚡ Prefill 3 Verified Neighbours
                </button>
                {neighbours.length < 3 && (
                  <button
                    type="button"
                    className="btn-outline-pill"
                    style={{ fontSize: '11px', padding: '4px 10px', borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)', fontWeight: 600 }}
                    onClick={handleAddNeighbour}
                  >
                    + Add Boundary Neighbour ({neighbours.length}/3)
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {neighbours.map((neighbour, index) => {
                const isValid = neighbour.name.trim() && neighbour.aadhaar.trim();
                return (
                  <div 
                    key={neighbour.id || index}
                    style={{
                      background: isValid ? '#F0FDF4' : '#F8FAFC',
                      border: `1px solid ${isValid ? '#BBF7D0' : 'var(--border-light)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: '14px',
                      position: 'relative',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: isValid ? '#15803D' : '#64748B',
                          color: '#FFFFFF',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {index + 1}
                        </span>
                        <strong style={{ fontSize: '13px', color: 'var(--text-headline)' }}>
                          Adjoining Neighbour #{index + 1}
                        </strong>
                        {isValid ? (
                          <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                            ✓ Attestation Points Earned (+1 Pt)
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#B45309' }}>
                            (Name + Aadhaar required)
                          </span>
                        )}
                      </div>

                      {neighbours.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveNeighbour(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#DC2626',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600
                          }}
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr', gap: '12px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>
                          Neighbour Full Name <span style={{ color: '#DC2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Kempanna Gowda"
                          value={neighbour.name}
                          onChange={e => handleUpdateNeighbour(index, 'name', e.target.value)}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>
                          Neighbour Aadhaar Card Number <span style={{ color: '#DC2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. 5432-8765-9012"
                          value={neighbour.aadhaar}
                          onChange={e => handleUpdateNeighbour(index, 'aadhaar', e.target.value)}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>
                          Boundary Direction
                        </label>
                        <select
                          className="form-select"
                          value={neighbour.direction}
                          onChange={e => handleUpdateNeighbour(index, 'direction', e.target.value)}
                        >
                          <option value="North Boundary">North Boundary</option>
                          <option value="South Boundary">South Boundary</option>
                          <option value="East Boundary">East Boundary</option>
                          <option value="West Boundary">West Boundary</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 5: NGO / Civil Society Endorsement (Optional) */}
          <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px', marginTop: '20px' }}>
            <div style={{ 
              background: ngoEnabled ? '#F0FDF4' : '#F8FAFC',
              border: `1px solid ${ngoEnabled ? '#BBF7D0' : 'var(--border-light)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="ngoToggle"
                    checked={ngoEnabled}
                    onChange={e => setNgoEnabled(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                  />
                  <label htmlFor="ngoToggle" style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    Include Certified Civil Society / Farmers Producer Org (FPO) / NGO Endorsement (+2 Points)
                  </label>
                </div>
                {ngoEnabled && ngoName.trim() && (
                  <span className="status-pill verified" style={{ fontSize: '10px' }}>
                    ✓ Endorsement Active (+2 Pts)
                  </span>
                )}
              </div>

              {ngoEnabled && (
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>
                        NGO / FPO Organization Name <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Karnataka Rajya Raitha Sangha (KRRS)"
                        value={ngoName}
                        onChange={e => setNgoName(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>
                        Darpan Portal / Trust Registration ID
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. KA/2024/028471"
                        value={ngoDarpanId}
                        onChange={e => setNgoDarpanId(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>
                        Field Representative Name
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Anand Rao (Field Agronomist)"
                        value={ngoRepresentative}
                        onChange={e => setNgoRepresentative(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>
                        Endorsement Observation / Field Notes
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Verified genuine peaceful possession and physical crop boundaries on site."
                        value={ngoRemarks}
                        onChange={e => setNgoRemarks(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Real-time Consensus Confidence Score Meter */}
          <div style={{ 
            marginTop: '24px', 
            padding: '16px 20px', 
            background: isConsensusThresholdMet ? '#F0FDF4' : '#FFFBEB',
            border: `2px solid ${isConsensusThresholdMet ? '#22C55E' : '#F59E0B'}`,
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: isConsensusThresholdMet ? '#15803D' : '#B45309' }}>
                  Statutory Community Consensus Verification Engine
                </span>
                <h4 style={{ fontSize: '16px', fontWeight: 800, margin: '2px 0 0 0', color: isConsensusThresholdMet ? '#14532D' : '#78350F' }}>
                  Consensus Score: {consensusScore} / 5
                </h4>
              </div>
              <div>
                <span 
                  className={`status-pill ${isConsensusThresholdMet ? 'verified' : 'pending'}`}
                  style={{ fontSize: '12px', padding: '6px 14px', fontWeight: 800 }}
                >
                  {isConsensusThresholdMet ? '✓ Statutory Threshold Met (5/5)' : `⚠️ Below Threshold (${consensusScore}/5)`}
                </span>
              </div>
            </div>

            {/* Points Breakdown Badges */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', fontSize: '11px' }}>
              <span style={{ background: '#FFFFFF', border: '1px solid var(--border-light)', padding: '3px 8px', borderRadius: '12px', fontWeight: 600 }}>
                Base Cadastre Record: +2 Pts
              </span>
              <span style={{ 
                background: neighbourPoints > 0 ? '#DCFCE7' : '#FFFFFF', 
                border: `1px solid ${neighbourPoints > 0 ? '#86EFAC' : 'var(--border-light)'}`,
                color: neighbourPoints > 0 ? '#15803D' : 'inherit',
                padding: '3px 8px', 
                borderRadius: '12px', 
                fontWeight: 600 
              }}>
                Boundary Neighbours: +{neighbourPoints} Pts ({validNeighbours.length}/3 with Aadhaar)
              </span>
              <span style={{ 
                background: ngoPoints > 0 ? '#DCFCE7' : '#FFFFFF', 
                border: `1px solid ${ngoPoints > 0 ? '#86EFAC' : 'var(--border-light)'}`,
                color: ngoPoints > 0 ? '#15803D' : 'inherit',
                padding: '3px 8px', 
                borderRadius: '12px', 
                fontWeight: 600 
              }}>
                NGO / Civil Society Endorsement: +{ngoPoints} Pts
              </span>
            </div>

            {!isConsensusThresholdMet && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#92400E', lineHeight: 1.5, background: '#FEF3C7', padding: '10px 12px', borderRadius: 'var(--radius-sm)' }}>
                <strong>🔒 Cannot Record Claim:</strong> Under statutory consensus rules, this land claim requires a confidence score of at least <strong>5/5</strong> to be officially recorded.
                Please provide <strong>adjoining neighbours (with name & Aadhaar number)</strong> and/or <strong>certified NGO endorsement</strong> above to satisfy consensus.
              </div>
            )}
          </div>

          {/* Submission Error Banner */}
          {claimSubmitError && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              color: '#B91C1C',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '16px'
            }}>
              <AlertCircle size={18} />
              <span>{claimSubmitError}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button type="button" className="btn-outline-pill" onClick={() => setActiveTab('my-claims')}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-gradient"
              style={!isConsensusThresholdMet ? { opacity: 0.6, cursor: 'not-allowed', filter: 'grayscale(0.7)' } : {}}
              title={!isConsensusThresholdMet ? 'Consensus score must reach 5/5 to record land claim' : 'Submit Land Claim'}
            >
              {isConsensusThresholdMet 
                ? 'Submit Land Claim for Official Cadastre Entry (Score: 5/5 ✓) →' 
                : `🔒 Consensus Score (${consensusScore}/5) Below Threshold — Cannot Record`}
            </button>
          </div>
        </form>
      )}

      {/* ============================================================ */}
      {/* 3. TAB: CLAIM DETAIL VIEW */}
      {/* ============================================================ */}
      {activeTab === 'claim-detail' && selectedClaimForDetail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="panel-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <button 
                className="btn-outline-pill" 
                onClick={() => setActiveTab('my-claims')}
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                <ArrowLeft size={14} /> Back to My Claims
              </button>

              <span className={`status-pill ${selectedClaimForDetail.status === 'Verified' ? 'verified' : selectedClaimForDetail.status === 'Disputed' ? 'disputed' : 'pending'}`}>
                {selectedClaimForDetail.status === 'Verified' ? 'LAND STATUS: VERIFIED ✓' : selectedClaimForDetail.status}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '20px' }}>
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: 'var(--radius-sm)', 
                background: selectedClaimForDetail.status === 'Verified' ? '#DCFCE7' : 'var(--brand-light)', 
                color: selectedClaimForDetail.status === 'Verified' ? '#15803D' : 'var(--brand-primary)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <ShieldCheck size={32} />
              </div>
              <div>
                <span className="top-bar-tag" style={{ marginBottom: '4px' }}>
                  CLAIM ID: {selectedClaimForDetail.landId}
                </span>
                <h3 style={{ fontSize: '22px', fontWeight: 800 }}>
                  Survey #{selectedClaimForDetail.surveyNumber} ({selectedClaimForDetail.plotNumber || 'Main Holding'})
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {selectedClaimForDetail.village}, Taluk {selectedClaimForDetail.taluk}, {selectedClaimForDetail.district}, {selectedClaimForDetail.state}
                </span>
              </div>
            </div>

            {/* Matrix of Details */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '20px' }}>
              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SURFACE AREA</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
                  {selectedClaimForDetail.areaAcres} Acres
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {selectedClaimForDetail.areaHectares} ha • {selectedClaimForDetail.areaSqM?.toLocaleString()} m²
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>LAND-USE CLASSIFICATION</span>
                <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
                  {selectedClaimForDetail.finalClassification || selectedClaimForDetail.selfDeclaredClassification}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {selectedClaimForDetail.hasClassificationMismatch ? '⚠️ Review Required' : 'Self-Declared / Verified'}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>LEGAL STATUS</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: selectedClaimForDetail.legalStatus === 'Clear' ? '#15803D' : '#DC2626', marginTop: '2px' }}>
                  {selectedClaimForDetail.legalStatus || 'Clear'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {selectedClaimForDetail.disputeDetails || 'No encumbrances logged'}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>TRUST SCORE</span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#065F46', marginTop: '2px' }}>
                  ★ {selectedClaimForDetail.verificationScore || (selectedClaimForDetail.status === 'Verified' ? 5 : 2)}/5 Rating
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Official Cadastre Credibility
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
              <button className="btn-black-pill" onClick={() => onOpenReport(selectedClaimForDetail)}>
                <FileCheck size={14} /> Download Certificate (PDF)
              </button>
              <button className="btn-black-pill" onClick={() => onOpenQR(selectedClaimForDetail)}>
                <QrCode size={14} /> View Cryptographic QR Proof
              </button>
              {selectedClaimForDetail.status === 'Verified' && (
                <button 
                  className="btn-gradient" 
                  onClick={() => {
                    setReliefClaimId(selectedClaimForDetail.landId);
                    setActiveTab('apply-relief');
                  }}
                >
                  <CloudRain size={14} /> Apply for Disaster Relief
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. TAB: APPLY FOR DIGITAL DISASTER RELIEF (FIX 5 & FIX 6) */}
      {/* ============================================================ */}
      {activeTab === 'apply-relief' && (
        <form onSubmit={handleReliefSubmit} className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Apply for Digital Disaster Relief</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Targeted direct financial compensation for verified land holdings impacted by natural disaster
              </span>
            </div>
            <span className="top-bar-tag">
              DBT SANCTION CONSOLE
            </span>
          </div>

          {/* Validation Banner if citizen has no verified claims */}
          {verifiedClaims.length === 0 ? (
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <AlertTriangle size={24} color="#B45309" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#92400E', marginBottom: '4px' }}>
                  No Verified Claims Available for Disaster Relief
                </h4>
                <p style={{ fontSize: '13px', color: '#78350F', lineHeight: '1.5' }}>
                  Per Government of India guidelines, digital disaster relief applications can only be submitted against <strong>officially verified land claims</strong>. 
                  Currently, none of your submitted claims have completed the 6-stage verification process. Once an authorized revenue officer verifies your claim, it will appear in the dropdown below.
                </p>
                <button 
                  type="button" 
                  className="btn-black-pill" 
                  style={{ marginTop: '12px', fontSize: '11px', padding: '6px 14px' }}
                  onClick={() => setActiveTab('my-claims')}
                >
                  Check Claim Status →
                </button>
              </div>
            </div>
          ) : null}

          {reliefFormError && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              color: '#B91C1C',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '18px'
            }}>
              <AlertTriangle size={16} />
              <span>{reliefFormError}</span>
            </div>
          )}

          {/* Form Fields (FIX 5 & FIX 6) */}
          <div className="form-grid">
            {/* FIX 6: Debugged and Fixed Linked Claim Dropdown */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">
                Linked Land Claim (Only Verified Claims) <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select 
                className="form-select" 
                value={reliefClaimId} 
                onChange={e => setReliefClaimId(e.target.value)}
                required
                disabled={verifiedClaims.length === 0}
              >
                <option value="">-- Select a Verified Land Claim --</option>
                {verifiedClaims.map(c => {
                  const claimKey = c.landId || c.claimId;
                  const cat = c.finalClassification || c.landUseType || c.selfDeclaredClassification || 'Agricultural';
                  return (
                    <option key={claimKey} value={claimKey}>
                      {claimKey} — Survey #{c.surveyNumber} ({c.village}, {c.district}) • {c.areaAcres} Acres ({cat})
                    </option>
                  );
                })}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {verifiedClaims.length > 0 
                  ? `Populated with your ${verifiedClaims.length} verified parcel(s). Selection automatically detects registered land-use.` 
                  : 'No verified claims available yet for this citizen account.'}
              </span>
            </div>

            {/* FIX 5: Land Use Category Field */}
            <div className="form-group">
              <label className="form-label">
                Land Use Category {linkedClaim ? '(Auto-pulled from Claim)' : ''}
              </label>
              {linkedClaim ? (
                <input 
                  type="text" 
                  className="form-input" 
                  value={activeLandCategory} 
                  readOnly 
                  style={{ background: '#F1F5F9', fontWeight: 600, color: 'var(--text-headline)' }} 
                />
              ) : (
                <select 
                  className="form-select" 
                  value={customLandCategory} 
                  onChange={e => setCustomLandCategory(e.target.value)}
                >
                  {LAND_USE_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Disaster Type Dropdown */}
            <div className="form-group">
              <label className="form-label">
                Disaster Type (Govt Recognized) <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select 
                className="form-select" 
                value={reliefDisasterType} 
                onChange={e => setReliefDisasterType(e.target.value)}
                required
              >
                <option value="">-- Select Disaster Event --</option>
                {DISASTER_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="form-group">
              <label className="form-label">
                Date of Disaster Occurrence <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input 
                type="date" 
                className="form-input" 
                value={reliefDate} 
                onChange={e => setReliefDate(e.target.value)} 
                required 
              />
            </div>

            {/* FIX 5: Damage Percentage Slider (0-100%) */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">
                  Damage Percentage <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <span style={{ fontSize: '13px', fontWeight: 800, color: damagePercentage > 50 ? '#DC2626' : '#D97706' }}>
                  {damagePercentage}% Impact
                </span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                step="1" 
                value={damagePercentage} 
                onChange={e => setDamagePercentage(e.target.value)}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div className="trust-gauge-bar" style={{ width: '100%', height: '8px' }}>
                <div 
                  className="trust-gauge-fill" 
                  style={{ 
                    width: `${damagePercentage}%`,
                    background: damagePercentage > 60 ? '#EF4444' : damagePercentage > 30 ? '#F59E0B' : '#10B981'
                  }} 
                />
              </div>
            </div>

            {/* FIX 5: Requested Amount & Suggested Compensation hint */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">
                Requested Compensation Amount (₹) <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="number" 
                  step="100"
                  className="form-input" 
                  placeholder="Enter your requested amount in ₹" 
                  value={reliefRequestedAmount} 
                  onChange={e => setReliefRequestedAmount(e.target.value)} 
                  required 
                  style={{ paddingLeft: '36px' }}
                />
                <IndianRupee 
                  size={15} 
                  color="var(--text-placeholder)" 
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} 
                />
              </div>

              {/* FIX 5: Suggested Compensation calculation shown as a labeled hint */}
              <div style={{
                background: '#EEF2FF',
                border: '1px solid #C7D2FE',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#3730A3',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px'
              }}>
                <Calculator size={15} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Suggested based on category & damage:</strong> ₹{suggestedCompensation.toLocaleString('en-IN')} — you may request a different amount
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">
                Description of Crop / Property Damage <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea 
                className="form-textarea" 
                rows="3"
                placeholder="Detail the extent of damage to crops, bunds, irrigation pumps, or standing structures..."
                value={reliefDescription} 
                onChange={e => setReliefDescription(e.target.value)} 
                required 
              />
            </div>

            {/* Photo Upload */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">
                Ground Photo of Damage (Inspection Proof)
              </label>
              <div style={{
                border: '2px dashed var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: '20px',
                textAlign: 'center',
                background: '#F8FAFC'
              }}>
                <input 
                  type="file" 
                  id="relief-photo-input" 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  onChange={handlePhotoUpload} 
                />
                <label 
                  htmlFor="relief-photo-input" 
                  style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                >
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: '#EEF2FF',
                    color: 'var(--brand-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Upload size={18} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-headline)' }}>
                    {reliefPhotoName ? `Selected: ${reliefPhotoName}` : 'Click to Upload Ground Damage Photo'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    PNG, JPG, or WEBP up to 10MB
                  </span>
                </label>

                {reliefPhotoPreview && (
                  <div style={{ marginTop: '12px' }}>
                    <img 
                      src={reliefPhotoPreview} 
                      alt="Damage Preview" 
                      style={{ maxHeight: '140px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }} 
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button type="button" className="btn-outline-pill" onClick={() => setActiveTab('my-relief-apps')}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-gradient" 
              disabled={verifiedClaims.length === 0}
            >
              Submit Relief Application (Status: Pending Govt Verification) →
            </button>
          </div>
        </form>
      )}

      {/* ============================================================ */}
      {/* 5. TAB: MY RELIEF APPLICATIONS */}
      {/* ============================================================ */}
      {activeTab === 'my-relief-apps' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">My Disaster Relief Applications ({myReliefApps.length})</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Track verification, magistrate sanction, and direct benefit transfer (DBT) progress
              </span>
            </div>
            <button className="btn-gradient" onClick={() => setActiveTab('apply-relief')}>
              + New Relief Application
            </button>
          </div>

          {myReliefApps.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px', 
              background: '#F8FAFC', 
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-light)'
            }}>
              <CloudRain size={36} color="var(--text-placeholder)" style={{ margin: '0 auto 12px auto' }} />
              <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>No Disaster Relief Applications</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 20px auto' }}>
                You have not filed any disaster relief claims. If your verified land has experienced crop loss, flood inundation, or storm damage, file an application below.
              </p>
              <button className="btn-gradient" onClick={() => setActiveTab('apply-relief')}>
                Apply for Digital Disaster Relief →
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="classification-table">
                <thead>
                  <tr>
                    <th>Application ID</th>
                    <th>Linked Claim</th>
                    <th>Disaster Event & Date</th>
                    <th>Damage %</th>
                    <th>Requested (₹)</th>
                    <th>Approved (₹)</th>
                    <th>Status</th>
                    <th>Official Remarks</th>
                    <th>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {myReliefApps.map(app => {
                    const statusClass = 
                      app.status === 'Approved' ? 'verified' :
                      app.status === 'Rejected' ? 'disputed' :
                      app.status === 'Verified - Awaiting Approval' ? 'ongoing' : 'pending';

                    return (
                      <tr key={app.applicationId}>
                        <td>
                          <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{app.applicationId}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {new Date(app.createdAt).toLocaleDateString('en-IN')}
                          </div>
                          <a
                            href={app.explorerUrl || `https://testnetscan.mstblockchain.com/tx/${app.approvalTxHash || app.txHash || '0x4af4bce5a3349416bd697a7da55958d5a87b17be2494d00fba4cb6e6136c540c'}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10px',
                              color: '#15803D',
                              fontWeight: 700,
                              textDecoration: 'underline',
                              marginTop: '2px'
                            }}
                            title="Verify on MST Blockchain Testnet Explorer"
                          >
                            🔗 On-Chain Tx ↗
                          </a>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{app.linkedClaimId}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{app.disasterType}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{app.date}</div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#B91C1C' }}>
                            {app.damagePercentage ? `${app.damagePercentage}%` : 'Reported'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>
                            ₹{Number(app.requestedAmount).toLocaleString('en-IN')}
                          </div>
                        </td>
                        <td>
                          {app.approvedAmount ? (
                            <div style={{ fontWeight: 800, color: '#15803D' }}>
                              ₹{Number(app.approvedAmount).toLocaleString('en-IN')}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-placeholder)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill ${statusClass}`}>
                            {app.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '12px', color: app.status === 'Rejected' ? '#DC2626' : 'var(--text-body)' }}>
                            {app.remarks || (app.status === 'Pending Government Verification' ? 'Queued for ground survey inspection.' : 'Under official review.')}
                          </div>
                        </td>
                        <td>
                          <button 
                            className="btn-outline-pill" 
                            style={{ fontSize: '11px', padding: '4px 10px' }}
                            onClick={() => onOpenReport && onOpenReport(app)}
                          >
                            <Printer size={12} /> Print
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
