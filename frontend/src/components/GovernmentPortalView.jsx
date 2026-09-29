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
  X,
  MapPin,
  Clock,
  LogOut,
  IndianRupee,
  AlertCircle,
  Lock,
  ChevronRight,
  ShieldAlert,
  Sliders,
  Printer
} from 'lucide-react';
import { INDIAN_LOCATIONS, LAND_USE_TYPES } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import MapView from './MapView';
import AuditLogView from './AuditLogView';

export default function GovernmentPortalView({ 
  parcels = [], 
  reliefApplications = [],
  auditLogs = [],
  onApproveClaim, 
  onElevateScore,
  onDisputeClaim,
  onResolveDispute,
  onVerifyRelief,
  onApproveRelief,
  onRejectRelief,
  onOpenReport,
  onOpenQR 
}) {
  const { user, logout } = useAuth();
  const officerName = user?.name || user?.username || 'Officer';

  // Navigation: 'overview', 'needs-review', 'disputes', 'disaster-relief', 'audit-log'
  const [activeTab, setActiveTab] = useState('overview');

  // Filters
  const [filterState, setFilterState] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterLandType, setFilterLandType] = useState('All');

  // Claim Adjudication Modal State
  const [selectedParcelForApproval, setSelectedParcelForApproval] = useState(null);
  const [finalClassificationDecision, setFinalClassificationDecision] = useState('Agricultural / Farmland');
  const [approvalError, setApprovalError] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Relief Modal State (Change 4: Two-step workflow)
  const [selectedReliefApp, setSelectedReliefApp] = useState(null);
  const [reliefVerificationNotes, setReliefVerificationNotes] = useState('');
  const [reliefVerifiedCheckbox, setReliefVerifiedCheckbox] = useState(false);
  const [reliefApprovedAmount, setReliefApprovedAmount] = useState(''); // Blank by default per prompt
  const [reliefRejectionReason, setReliefRejectionReason] = useState('');
  const [reliefActionError, setReliefActionError] = useState('');
  const [reliefActiveStep, setReliefActiveStep] = useState(1);
  const [reliefRecommendedAmount, setReliefRecommendedAmount] = useState('');
  const [reliefAssessedDamage, setReliefAssessedDamage] = useState('');
  const [reliefDamageSeverity, setReliefDamageSeverity] = useState('Severe Crop Inundation (50-75%)');

  // Dispute reason prompt state
  const [disputeModalParcel, setDisputeModalParcel] = useState(null);
  const [disputeReasonInput, setDisputeReasonInput] = useState('');

  // Calculations
  const totalClaims = parcels.length;
  const verifiedCount = parcels.filter(p => p.status === 'Verified').length;
  const pendingCount = parcels.filter(p => p.status === 'Pending Verification' || p.status === 'Special Verification Required' || p.status === 'Partially Verified').length;
  const disputedCount = parcels.filter(p => p.status === 'Disputed' || p.legalStatus === '⚠️ Legal Issue Detected').length;

  // FIX 10: Pending relief applications count computed from full real dataset
  const pendingReliefApps = reliefApplications.filter(a => 
    a.status === 'Pending Government Verification' || a.status === 'Verified - Awaiting Approval'
  );
  const pendingReliefCount = pendingReliefApps.length;

  const totalSanctionedRelief = reliefApplications
    .filter(a => a.status === 'Approved' && a.approvedAmount)
    .reduce((sum, a) => sum + Number(a.approvedAmount), 0);

  // Filtered parcels
  const filteredParcels = parcels.filter(p => {
    if (filterState !== 'All' && p.state !== filterState) return false;
    if (filterStatus !== 'All' && p.status !== filterStatus) return false;
    if (filterLandType !== 'All' && p.finalClassification !== filterLandType && p.selfDeclaredClassification !== filterLandType) return false;
    return true;
  });

  // Needs Review parcels
  const needsReviewParcels = parcels.filter(p => 
    p.status === 'Pending Verification' || 
    p.status === 'Special Verification Required' || 
    p.status === 'Partially Verified' ||
    p.hasClassificationMismatch
  );

  // Disputed parcels
  const disputedParcels = parcels.filter(p => 
    p.status === 'Disputed' || 
    p.legalStatus === '⚠️ Legal Issue Detected'
  );

  const handleApproveClaimSubmit = async () => {
    if (!selectedParcelForApproval) return;
    setApprovalError('');
    const score = Number(selectedParcelForApproval.verificationScore || selectedParcelForApproval.score || 2);
    if (score < 5) {
      setApprovalError(`Cannot register land: Consensus confidence score (${score}/5) is below the statutory threshold of 5.`);
      return;
    }

    setIsSubmittingApproval(true);
    try {
      await onApproveClaim(selectedParcelForApproval.landId, {
        finalClassification: finalClassificationDecision,
        officerName: `${officerName} (Revenue Magistrate)`,
        verificationScore: score
      });
      setSelectedParcelForApproval(null);
    } catch (err) {
      setApprovalError(err.message || 'Approval failed.');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleElevateScoreWithGroundSurvey = async () => {
    if (!selectedParcelForApproval) return;
    setApprovalError('');
    try {
      if (onElevateScore) {
        const updated = await onElevateScore(selectedParcelForApproval.landId, officerName);
        if (updated) {
          setSelectedParcelForApproval({ ...selectedParcelForApproval, ...updated, verificationScore: 5 });
        } else {
          setSelectedParcelForApproval({ ...selectedParcelForApproval, verificationScore: 5 });
        }
      } else {
        setSelectedParcelForApproval({ ...selectedParcelForApproval, verificationScore: 5 });
      }
    } catch (err) {
      setApprovalError(err.message || 'Failed to record ground inspection.');
    }
  };

  const handleOpenDisputeModal = (parcel) => {
    setDisputeModalParcel(parcel);
    setDisputeReasonInput('Boundary overlap & title encumbrance flagged by revenue authority.');
  };

  const handleConfirmDispute = async () => {
    if (!disputeModalParcel) return;
    await onDisputeClaim(disputeModalParcel.landId, disputeReasonInput, officerName);
    setDisputeModalParcel(null);
    setDisputeReasonInput('');
  };

  const handleResolveDisputeClick = async (parcel) => {
    await onResolveDispute(parcel.landId, officerName);
  };

  // Open Relief Detail Modal
  const handleOpenReliefDetail = (app) => {
    setSelectedReliefApp(app);
    setReliefVerificationNotes(app.verificationNotes || '');
    setReliefVerifiedCheckbox(app.status !== 'Pending Government Verification');
    setReliefRecommendedAmount(app.recommendedAmount ? String(app.recommendedAmount) : (app.suggestedCompensation ? String(app.suggestedCompensation) : ''));
    setReliefAssessedDamage(app.assessedDamagePercentage ? String(app.assessedDamagePercentage) : (app.damagePercentage ? String(app.damagePercentage) : ''));
    setReliefDamageSeverity(app.damageSeverity || 'Severe Crop Inundation (50-75%)');
    setReliefApprovedAmount(app.approvedAmount ? String(app.approvedAmount) : (app.recommendedAmount ? String(app.recommendedAmount) : ''));
    setReliefRejectionReason(app.rejectionReason || '');
    setReliefActionError('');
    setReliefActiveStep(app.status !== 'Pending Government Verification' ? 2 : 1);
  };

  // Step 1: Verification
  const handleStep1Verify = async () => {
    setReliefActionError('');
    const targetId = selectedReliefApp.applicationId || selectedReliefApp.reliefId || selectedReliefApp.id;
    const notes = reliefVerificationNotes.trim() || 'Ground damage & cadastral boundaries verified by officer.';
    
    // Auto-check the confirmation box
    setReliefVerifiedCheckbox(true);

    try {
      let updated = null;
      if (onVerifyRelief) {
        updated = await onVerifyRelief(targetId, {
          notes,
          officerName,
          recommendedAmount: reliefRecommendedAmount,
          assessedDamagePercentage: reliefAssessedDamage,
          damageSeverity: reliefDamageSeverity
        });
      }
      setSelectedReliefApp(prev => ({
        ...prev,
        ...(updated || {}),
        status: 'Verified - Awaiting Approval',
        verificationNotes: notes,
        verifiedBy: officerName,
        recommendedAmount: reliefRecommendedAmount ? parseFloat(reliefRecommendedAmount) : prev.recommendedAmount,
        assessedDamagePercentage: reliefAssessedDamage ? parseFloat(reliefAssessedDamage) : prev.assessedDamagePercentage,
        damageSeverity: reliefDamageSeverity,
        verificationDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      }));
      // Pre-fill Step 2 approved amount with recommended amount if empty
      if (!reliefApprovedAmount && reliefRecommendedAmount) {
        setReliefApprovedAmount(String(reliefRecommendedAmount));
      }
      // Automatically advance to Step 2
      setReliefActiveStep(2);
    } catch (err) {
      setReliefActionError(err.message || 'Verification failed.');
    }
  };

  // Step 2: Approval
  const handleStep2Approve = async () => {
    setReliefActionError('');
    if (!reliefApprovedAmount || parseFloat(reliefApprovedAmount) <= 0) {
      setReliefActionError('Please enter a valid sanctioned amount in ₹.');
      return;
    }

    // Check if linked claim is disputed
    const linkedClaim = parcels.find(p => p.landId === selectedReliefApp.linkedClaimId || p.claimId === selectedReliefApp.linkedClaimId);
    if (linkedClaim && (linkedClaim.status === 'Disputed' || linkedClaim.legalStatus?.includes('Issue'))) {
      setReliefActionError('Approval is blocked: The linked claim is currently Disputed.');
      return;
    }

    const targetId = selectedReliefApp.applicationId || selectedReliefApp.reliefId || selectedReliefApp.id;

    try {
      // Auto-verify Step 1 if it was still pending
      if (selectedReliefApp.status === 'Pending Government Verification' && onVerifyRelief) {
        await onVerifyRelief(targetId, {
          notes: reliefVerificationNotes.trim() || 'Ground damage & cadastral boundaries verified by officer.',
          officerName,
          recommendedAmount: reliefRecommendedAmount || reliefApprovedAmount,
          assessedDamagePercentage: reliefAssessedDamage,
          damageSeverity: reliefDamageSeverity
        });
      }

      const updated = await onApproveRelief(targetId, {
        approvedAmount: reliefApprovedAmount,
        officerName
      });
      setSelectedReliefApp(prev => ({
        ...prev,
        ...(updated || {}),
        status: 'Approved',
        approvedAmount: reliefApprovedAmount,
        approvedBy: officerName,
        approvalDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      }));
    } catch (err) {
      setReliefActionError(err.message || 'Approval failed.');
    }
  };

  // Step 2: Rejection
  const handleStep2Reject = async () => {
    setReliefActionError('');
    if (!reliefRejectionReason.trim()) {
      setReliefActionError('Please provide a mandatory reason for rejection.');
      return;
    }
    const targetId = selectedReliefApp.applicationId || selectedReliefApp.reliefId || selectedReliefApp.id;
    try {
      const updated = await onRejectRelief(targetId, {
        rejectionReason: reliefRejectionReason.trim(),
        officerName
      });
      setSelectedReliefApp(prev => ({
        ...prev,
        ...(updated || {}),
        status: 'Rejected',
        rejectionReason: reliefRejectionReason.trim(),
        rejectedBy: officerName
      }));
    } catch (err) {
      setReliefActionError(err.message || 'Rejection failed.');
    }
  };

  // Check if current relief app's linked claim is disputed
  const selectedReliefLinkedClaim = selectedReliefApp 
    ? parcels.find(p => p.landId === selectedReliefApp.linkedClaimId || p.claimId === selectedReliefApp.linkedClaimId)
    : null;
  const isLinkedClaimDisputed = selectedReliefLinkedClaim?.status === 'Disputed' || 
                                selectedReliefLinkedClaim?.legalStatus?.includes('Issue');

  return (
    <div className="portal-content">
      {/* FIX 8: Consistent Top Bar Greeting "Welcome, {name} (Government)" & Aligned Tag */}
      <div className="panel-card" style={{ padding: '20px 24px', background: '#FFFFFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: 'var(--radius-sm)', 
              background: '#0F172A', 
              color: '#FFFFFF', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <Building2 size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
                  Welcome, {officerName} (Government)
                </h2>
                {/* FIX 8: Properly aligned government portal tag */}
                <span className="top-bar-tag">
                  GOVERNMENT PORTAL
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                National Cadastral Adjudication & Disaster Relief Sanctioning Console
              </span>
            </div>
          </div>

          <button 
            className="btn-outline-pill" 
            onClick={logout}
            title="Sign Out of Government Portal"
            style={{ color: '#B91C1C', borderColor: '#FECACA' }}
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>

        {/* FIX 9: Clean tab row spacing and separated count pills */}
        <div className="seg-tab-row">
          <button
            className={`seg-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <MapPin size={15} />
            <span>All Claims & Map</span>
            <span className="tab-count-pill">{parcels.length}</span>
          </button>

          <button
            className={`seg-tab ${activeTab === 'needs-review' ? 'active' : ''}`}
            onClick={() => setActiveTab('needs-review')}
          >
            <AlertTriangle size={15} />
            <span>Needs Review</span>
            <span className="tab-count-pill">{needsReviewParcels.length}</span>
          </button>

          <button
            className={`seg-tab ${activeTab === 'disputes' ? 'active' : ''}`}
            onClick={() => setActiveTab('disputes')}
          >
            <ShieldAlert size={15} />
            <span>Disputes</span>
            <span className="tab-count-pill">{disputedParcels.length}</span>
          </button>

          {/* FIX 9 & FIX 10: Disaster Relief Tab with Separated Live Count Pill */}
          <button
            className={`seg-tab ${activeTab === 'disaster-relief' ? 'active' : ''}`}
            onClick={() => setActiveTab('disaster-relief')}
          >
            <CloudRain size={15} />
            <span>Disaster Relief</span>
            <span className={`tab-count-pill ${pendingReliefCount > 0 ? 'alert' : ''}`}>
              {pendingReliefCount}
            </span>
          </button>

          <button
            className={`seg-tab ${activeTab === 'audit-log' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit-log')}
          >
            <ShieldCheck size={15} />
            <span>Activity & Audit Log</span>
            <span className="tab-count-pill">{auditLogs.length}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Total Land Claims</span>
            <FileText size={18} color="var(--brand-primary)" />
          </div>
          <span className="stat-val">{totalClaims}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Registered claims</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Verified Lands</span>
            <CheckCircle2 size={18} color="#15803D" />
          </div>
          <span className="stat-val" style={{ color: '#15803D' }}>{verifiedCount}</span>
          <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 600 }}>Title Seal Issued</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Pending Review</span>
            <span className="status-pill pending" style={{ padding: '2px 8px', fontSize: '10px' }}>In Review</span>
          </div>
          <span className="stat-val">{pendingCount}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Awaiting verification</span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Legal / Disputed Cases</span>
            <AlertTriangle size={18} color="#B91C1C" />
          </div>
          <span className="stat-val" style={{ color: '#B91C1C' }}>{disputedCount}</span>
          <span style={{ fontSize: '11px', color: '#B91C1C', fontWeight: 600 }}>Tribunal Review</span>
        </div>

        {/* FIX 10: "Pending Relief Applications" Stat Card computed dynamically from real data */}
        <div className="stat-card" style={{ border: pendingReliefCount > 0 ? '2px solid #FCD34D' : '1px solid var(--border-light)' }}>
          <div className="stat-top">
            <span className="stat-label">Pending Relief Applications</span>
            <CloudRain size={18} color="#D97706" />
          </div>
          <span className="stat-val" style={{ color: pendingReliefCount > 0 ? '#B45309' : 'var(--text-headline)' }}>
            {pendingReliefCount}
          </span>
          <span style={{ fontSize: '11px', color: pendingReliefCount > 0 ? '#B45309' : 'var(--text-muted)', fontWeight: 600 }}>
            {pendingReliefCount > 0 ? `${pendingReliefCount} Awaiting Adjudication` : 'All Clear (0 Pending)'}
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Total Relief Sanctioned</span>
            <IndianRupee size={18} color="#15803D" />
          </div>
          <span className="stat-val" style={{ color: '#15803D' }}>₹{totalSanctionedRelief.toLocaleString('en-IN')}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Approved DBT</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 1. TAB: OVERVIEW & ALL CLAIMS WITH MAP */}
      {/* ============================================================ */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Geospatial Map */}
          {parcels.length > 0 && (
            <div className="panel-card">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">National Cadastral Map View</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Spatial boundary benchmarks and verified ownership overlays
                  </span>
                </div>
              </div>
              <div style={{ height: '360px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <MapView parcels={parcels} onSelectParcel={() => {}} />
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="panel-card" style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                <Filter size={15} /> Filters:
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>State:</span>
                <select className="form-select" style={{ padding: '6px 12px', fontSize: '12px' }} value={filterState} onChange={e => setFilterState(e.target.value)}>
                  <option value="All">All States</option>
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
                  <option value="Pending Verification">Pending Verification</option>
                  <option value="Special Verification Required">Special Verification Required</option>
                  <option value="Disputed">Disputed</option>
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

          {/* Table */}
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">Official Land Claims Register ({filteredParcels.length})</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  All citizen registrations awaiting adjudication, boundary inspection, and title verification
                </span>
              </div>
            </div>

            {filteredParcels.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                No land claims match the current criteria or have been lodged yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="classification-table">
                  <thead>
                    <tr>
                      <th>Land ID / App ID</th>
                      <th>Citizen / Claimant</th>
                      <th>Survey & Location</th>
                      <th>Classification</th>
                      <th>Legal Status</th>
                      <th>Status</th>
                      <th>Official Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParcels.map(p => (
                      <tr key={p.landId}>
                        <td>
                          <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{p.landId}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.applicationId}</div>
                          <a
                            href={p.explorerUrl || `https://testnet.mstscan.com/tx/${p.approvalTxHash || p.txHash || '0x3dd8689e5b428bde63bf806edbdfcbdfaf759dd7082b8ff15d4afe0cc5201892'}`}
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
                              marginTop: '3px'
                            }}
                            title="Verify on MST Blockchain Testnet Explorer"
                          >
                            🔗 On-Chain Proof ↗
                          </a>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.farmerName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.areaAcres} Acres</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>Survey #{p.surveyNumber}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.village}, {p.district}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.finalClassification || p.selfDeclaredClassification}</div>
                          {p.hasClassificationMismatch && (
                            <span className="status-pill mismatch" style={{ fontSize: '9px', padding: '1px 6px' }}>
                              Mismatch
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
                          <div style={{ 
                            fontSize: '10px', 
                            marginTop: '4px', 
                            fontWeight: 700, 
                            color: Number(p.verificationScore || p.score || 2) >= 5 ? '#15803D' : '#B45309' 
                          }}>
                            Score: {Number(p.verificationScore || p.score || 2)}/5 {Number(p.verificationScore || p.score || 2) >= 5 ? '✓' : '(Sub-threshold)'}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button 
                              className="btn-black-pill" 
                              style={{ fontSize: '11px', padding: '5px 10px' }}
                              onClick={() => onOpenReport(p)}
                            >
                              <FileText size={12} /> Report
                            </button>

                            {p.status !== 'Verified' && (
                              <button 
                                className="btn-gradient" 
                                style={{ fontSize: '11px', padding: '5px 10px' }}
                                onClick={() => {
                                  setSelectedParcelForApproval(p);
                                  setFinalClassificationDecision(p.selfDeclaredClassification || 'Agricultural / Farmland');
                                }}
                              >
                                <Check size={12} /> Adjudicate & Verify
                              </button>
                            )}

                            {p.status !== 'Disputed' ? (
                              <button 
                                className="btn-outline-pill" 
                                style={{ fontSize: '11px', padding: '5px 10px', color: '#B91C1C', borderColor: '#FECACA' }}
                                onClick={() => handleOpenDisputeModal(p)}
                                title="Flag boundary or ownership dispute"
                              >
                                Flag Dispute
                              </button>
                            ) : (
                              <button 
                                className="btn-outline-pill" 
                                style={{ fontSize: '11px', padding: '5px 10px', color: '#15803D', borderColor: '#BBF7D0' }}
                                onClick={() => handleResolveDisputeClick(p)}
                                title="Resolve dispute and restore title"
                              >
                                Resolve Dispute
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. TAB: NEEDS REVIEW */}
      {/* ============================================================ */}
      {activeTab === 'needs-review' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Needs Review Queue ({needsReviewParcels.length})</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Claims flagged for land-use mismatch, missing documentation, or pending initial inspection
              </span>
            </div>
          </div>

          {needsReviewParcels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              No claims currently in the review queue.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="classification-table">
                <thead>
                  <tr>
                    <th>Land ID</th>
                    <th>Citizen</th>
                    <th>Survey</th>
                    <th>Classification State</th>
                    <th>Confidence Score</th>
                    <th>Review Trigger</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {needsReviewParcels.map(p => (
                    <tr key={p.landId}>
                      <td><code style={{ fontWeight: 800 }}>{p.landId}</code></td>
                      <td>{p.farmerName}</td>
                      <td>Survey #{p.surveyNumber} ({p.village})</td>
                      <td>{p.finalClassification}</td>
                      <td>
                        {(() => {
                          const sc = Number(p.verificationScore || p.score || 2);
                          return (
                            <span 
                              className={`status-pill ${sc >= 5 ? 'verified' : 'pending'}`}
                              style={sc < 5 ? { background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D' } : {}}
                            >
                              {sc >= 5 ? `✓ ${sc}/5 (Met)` : `⚠️ ${sc}/5 (Sub-Threshold)`}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        {p.hasClassificationMismatch ? (
                          <span className="status-pill mismatch">Classification Mismatch</span>
                        ) : p.missingDocuments?.length > 0 ? (
                          <span className="status-pill pending">Document Assistance</span>
                        ) : (
                          <span className="status-pill ongoing">Pending Ground Inspection</span>
                        )}
                      </td>
                      <td>
                        <button 
                          className="btn-gradient" 
                          style={{ fontSize: '11px', padding: '5px 10px' }}
                          onClick={() => {
                            setSelectedParcelForApproval(p);
                            setFinalClassificationDecision(p.selfDeclaredClassification || 'Agricultural / Farmland');
                          }}
                        >
                          Review & Verify
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. TAB: DISPUTES */}
      {/* ============================================================ */}
      {activeTab === 'disputes' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Disputed Land Holdings Docket ({disputedParcels.length})</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Claims blocked from final title issuance and digital disaster relief pending tribunal resolution
              </span>
            </div>
          </div>

          {disputedParcels.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              No disputed claims logged. You can flag a dispute from the "All Claims & Map" tab to test dispute blocking.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="classification-table">
                <thead>
                  <tr>
                    <th>Land ID</th>
                    <th>Citizen</th>
                    <th>Survey</th>
                    <th>Dispute Narrative</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {disputedParcels.map(p => (
                    <tr key={p.landId}>
                      <td><code style={{ fontWeight: 800 }}>{p.landId}</code></td>
                      <td>{p.farmerName}</td>
                      <td>Survey #{p.surveyNumber} ({p.village})</td>
                      <td style={{ color: '#B91C1C', fontWeight: 600, fontSize: '12px' }}>
                        {p.disputeDetails || 'Boundary or encumbrance conflict under investigation.'}
                      </td>
                      <td>
                        <button 
                          className="btn-gradient" 
                          style={{ fontSize: '11px', padding: '5px 12px' }}
                          onClick={() => handleResolveDisputeClick(p)}
                        >
                          Resolve & Clear Title
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. TAB: DISASTER RELIEF (FIX 10: ALL Citizens, 2-Step Workflow) */}
      {/* ============================================================ */}
      {activeTab === 'disaster-relief' && (
        <div className="panel-card">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">National Disaster Relief Register ({reliefApplications.length})</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Comprehensive roll of relief claims across all citizens: Step 1 Ground Verification → Step 2 Sanction / Rejection
              </span>
            </div>
            <span className="top-bar-tag">
              {pendingReliefCount} PENDING SANCTION
            </span>
          </div>

          {reliefApplications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <CloudRain size={36} color="var(--text-placeholder)" style={{ margin: '0 auto 12px auto' }} />
              <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>No Disaster Relief Applications</h4>
              <p style={{ fontSize: '13px' }}>
                When citizens file disaster relief claims against their verified parcels, they will appear here across all jurisdictions.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="classification-table">
                <thead>
                  <tr>
                    <th>Relief ID</th>
                    <th>Citizen Claimant</th>
                    <th>Linked Claim</th>
                    <th>Disaster Event & Date</th>
                    <th>Damage %</th>
                    <th>Suggested (₹)</th>
                    <th>Requested (₹)</th>
                    <th>Approved (₹)</th>
                    <th>Status</th>
                    <th>Workflow Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reliefApplications.map(app => {
                    const linkedClaim = parcels.find(p => p.landId === app.linkedClaimId || p.claimId === app.linkedClaimId);
                    const isDisputed = linkedClaim?.status === 'Disputed';

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
                            href={app.explorerUrl || `https://testnet.mstscan.com/tx/${app.approvalTxHash || app.txHash || '0x4af4bce5a3349416bd697a7da55958d5a87b17be2494d00fba4cb6e6136c540c'}`}
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
                          <div style={{ fontWeight: 600 }}>{app.citizenName}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{app.linkedClaimId}</div>
                          {isDisputed && (
                            <span className="status-pill disputed" style={{ fontSize: '9px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                              <AlertTriangle size={10} /> Disputed
                            </span>
                          )}
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
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {app.suggestedCompensation ? `₹${Number(app.suggestedCompensation).toLocaleString('en-IN')}` : '—'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>₹{Number(app.requestedAmount).toLocaleString('en-IN')}</div>
                          {app.recommendedAmount && (
                            <div style={{ fontSize: '11px', color: '#15803D', fontWeight: 600 }}>
                              Rec: ₹{Number(app.recommendedAmount).toLocaleString('en-IN')}
                            </div>
                          )}
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
                          <button 
                            className="btn-gradient" 
                            style={{ fontSize: '11px', padding: '5px 12px' }}
                            onClick={() => handleOpenReliefDetail(app)}
                          >
                            Inspect & Adjudicate →
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

      {/* ============================================================ */}
      {/* 5. TAB: ACTIVITY & AUDIT LOG */}
      {/* ============================================================ */}
      {activeTab === 'audit-log' && (
        <AuditLogView logs={auditLogs} />
      )}

      {/* ============================================================ */}
      {/* MODAL 1: Claim Adjudication & Approval */}
      {/* ============================================================ */}
      {selectedParcelForApproval && (
        <div className="modal-overlay" onClick={() => setSelectedParcelForApproval(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Official Land Title Adjudication</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Land ID: {selectedParcelForApproval.landId} • Citizen: {selectedParcelForApproval.farmerName}
                </span>
              </div>
              <button className="action-icon-btn" onClick={() => setSelectedParcelForApproval(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Classification Summary</h4>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Self-Declared:</strong> {selectedParcelForApproval.selfDeclaredClassification}</div>
                <div><strong>Cadastral Record:</strong> {selectedParcelForApproval.governmentRecordClassification}</div>
                <div><strong>Survey & Location:</strong> Survey #{selectedParcelForApproval.surveyNumber}, {selectedParcelForApproval.village}, {selectedParcelForApproval.district}</div>
                <div><strong>Surface Area:</strong> {selectedParcelForApproval.areaAcres} Acres</div>
              </div>
            </div>

            {/* Statutory Consensus Confidence Score & Threshold Meter */}
            {(() => {
              const currentScore = Number(selectedParcelForApproval.verificationScore || selectedParcelForApproval.score || 2);
              const isBelowThreshold = currentScore < 5;
              const percent = Math.min(100, Math.round((currentScore / 5) * 100));

              return (
                <div style={{ 
                  marginTop: '16px', 
                  background: isBelowThreshold ? '#FEF2F2' : '#F0FDF4', 
                  border: `1px solid ${isBelowThreshold ? '#FCA5A5' : '#86EFAC'}`, 
                  borderRadius: 'var(--radius-md)', 
                  padding: '16px' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: isBelowThreshold ? '#991B1B' : '#14532D' }}>
                        Consensus Confidence Score: Score {currentScore} (≥5 required) ({percent}%)
                      </span>
                      <span className={`status-pill ${isBelowThreshold ? 'mismatch' : 'verified'}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
                        {isBelowThreshold ? '⚠️ Sub-Threshold (Score < 5)' : '✓ Statutory Threshold Met'}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: isBelowThreshold ? '#B91C1C' : '#15803D' }}>
                      Required Threshold: Score ≥5 (≥5 required)
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ width: '100%', height: '8px', background: isBelowThreshold ? '#FEE2E2' : '#DCFCE7', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: isBelowThreshold ? '#EF4444' : '#16A34A', transition: 'width 0.3s ease' }} />
                  </div>

                  {isBelowThreshold ? (
                    <div>
                      <p style={{ fontSize: '12px', color: '#991B1B', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                        <strong>Registration Blocked:</strong> Under statutory cadastral rules, land cannot be registered when the confidence score is below Score ≥5 (≥5 required). Ground inspection and neighbor consensus attestation must be satisfied before this title seal can be issued.
                      </p>
                      <button
                        type="button"
                        className="btn-outline-pill"
                        style={{ fontSize: '12px', borderColor: '#DC2626', color: '#B91C1C', background: '#FFFFFF', fontWeight: 700 }}
                        onClick={handleElevateScoreWithGroundSurvey}
                      >
                        + Conduct Ground Survey & Attest Community Consensus (+3 Pts)
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: '12px', color: '#166534', margin: 0, lineHeight: 1.4 }}>
                      ✓ Statutory threshold achieved! Ground inspection and consensus endorsements verified. Official title seal is ready to be issued.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label">Final Legally-Binding Land-Use Classification</label>
              <select className="form-select" value={finalClassificationDecision} onChange={e => setFinalClassificationDecision(e.target.value)}>
                {LAND_USE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {approvalError && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FEE2E2', border: '1px solid #F87171', borderRadius: 'var(--radius-sm)', color: '#B91C1C', fontSize: '12px', fontWeight: 600 }}>
                {approvalError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn-outline-pill" onClick={() => setSelectedParcelForApproval(null)}>
                Cancel
              </button>
              {(() => {
                const currentScore = Number(selectedParcelForApproval.verificationScore || selectedParcelForApproval.score || 2);
                const isBelowThreshold = currentScore < 5;
                return (
                  <button 
                    className="btn-gradient" 
                    onClick={handleApproveClaimSubmit}
                    disabled={isBelowThreshold || isSubmittingApproval}
                    style={isBelowThreshold ? { opacity: 0.55, cursor: 'not-allowed', filter: 'grayscale(0.8)' } : {}}
                    title={isBelowThreshold ? 'Confidence score must be at least Score ≥5 (≥5 required) to register land' : 'Issue Official Verification Seal'}
                  >
                    {isBelowThreshold 
                      ? `🔒 Cannot Register Land: Score ${currentScore} (≥5 required)`
                      : 'Issue Official Verification Seal (LAND STATUS: VERIFIED ✓)'}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: Flag Dispute Modal */}
      {/* ============================================================ */}
      {disputeModalParcel && (
        <div className="modal-overlay" onClick={() => setDisputeModalParcel(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#B91C1C' }}>Flag Land Title Dispute</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Claim: {disputeModalParcel.landId} • Citizen: {disputeModalParcel.farmerName}
                </span>
              </div>
              <button className="action-icon-btn" onClick={() => setDisputeModalParcel(null)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-body)', lineHeight: '1.5' }}>
              Flagging this parcel will change its status to <strong>Disputed</strong>. Any linked disaster relief applications will display a warning and have approval blocked until this dispute is resolved.
            </p>

            <div className="form-group" style={{ marginTop: '14px' }}>
              <label className="form-label">Reason for Dispute / Objection</label>
              <textarea 
                className="form-textarea" 
                rows="3" 
                value={disputeReasonInput} 
                onChange={e => setDisputeReasonInput(e.target.value)} 
                required 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn-outline-pill" onClick={() => setDisputeModalParcel(null)}>
                Cancel
              </button>
              <button 
                className="btn-gradient" 
                style={{ background: '#DC2626' }}
                onClick={handleConfirmDispute}
              >
                Confirm Dispute Flag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: Disaster Relief Detail & Two-Step Workflow */}
      {/* ============================================================ */}
      {selectedReliefApp && (
        <div className="modal-overlay" onClick={() => setSelectedReliefApp(null)}>
          <div className="modal-content" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="top-bar-tag" style={{ marginBottom: '4px' }}>
                  RELIEF APPLICATION: {selectedReliefApp.applicationId}
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 800 }}>Disaster Relief Adjudication</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Citizen: <strong>{selectedReliefApp.citizenName}</strong> • Linked Claim: <strong>{selectedReliefApp.linkedClaimId}</strong>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  type="button"
                  className="btn-outline-pill" 
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                  onClick={() => onOpenReport && onOpenReport(selectedReliefApp)}
                >
                  <Printer size={13} /> Print Assessment Report
                </button>
                <button className="action-icon-btn" onClick={() => setSelectedReliefApp(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Error banner if any */}
            {reliefActionError && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#B91C1C',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px'
              }}>
                <AlertCircle size={16} />
                <span>{reliefActionError}</span>
              </div>
            )}

            {/* WARNING BANNER & APPROVAL BLOCK */}
            {isLinkedClaimDisputed && (
              <div style={{
                background: '#FEF2F2',
                border: '2px solid #EF4444',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                marginBottom: '18px'
              }}>
                <AlertTriangle size={24} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#991B1B', marginBottom: '4px' }}>
                    ⚠️ WARNING: LINKED CLAIM IS DISPUTED — APPROVAL BLOCKED
                  </h4>
                  <p style={{ fontSize: '12px', color: '#B91C1C', lineHeight: '1.5' }}>
                    Linked Claim <strong>{selectedReliefApp.linkedClaimId}</strong> is currently under dispute ({selectedReliefLinkedClaim?.disputeDetails || 'Title conflict'}). 
                    Per National Cadastral statutes, <strong>disaster relief approval is strictly blocked</strong> until the underlying title dispute is officially resolved.
                  </p>
                </div>
              </div>
            )}

            {/* Application Overview Grid */}
            <div style={{ 
              background: '#F8FAFC', 
              padding: '16px', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid var(--border-light)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              fontSize: '12px'
            }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Disaster Event:</span>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{selectedReliefApp.disasterType}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Date of Disaster:</span>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{selectedReliefApp.date}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Assessed Damage:</span>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#DC2626' }}>
                  {selectedReliefApp.damagePercentage ? `${selectedReliefApp.damagePercentage}% Impact` : 'Reported'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Suggested Amount:</span>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>
                  {selectedReliefApp.suggestedCompensation ? `₹${Number(selectedReliefApp.suggestedCompensation).toLocaleString('en-IN')}` : '—'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Requested Amount:</span>
                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--brand-primary)' }}>
                  ₹{Number(selectedReliefApp.requestedAmount).toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current Status:</span>
                <div>
                  <span className={`status-pill ${
                    selectedReliefApp.status === 'Approved' ? 'verified' :
                    selectedReliefApp.status === 'Rejected' ? 'disputed' :
                    selectedReliefApp.status === 'Verified - Awaiting Approval' ? 'ongoing' : 'pending'
                  }`}>
                    {selectedReliefApp.status}
                  </span>
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: 'var(--text-muted)' }}>Damage Description:</span>
                <div style={{ marginTop: '2px', color: 'var(--text-body)' }}>{selectedReliefApp.description}</div>
              </div>
              {selectedReliefApp.photoUrl && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Damage Inspection Photo:</span>
                  <div style={{ marginTop: '6px' }}>
                    <img 
                      src={selectedReliefApp.photoUrl} 
                      alt="Damage" 
                      style={{ maxHeight: '140px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }} 
                    />
                  </div>
                </div>
              )}
            </div>

            {/* TWO-STEP WORKFLOW CONTAINER */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
              {/* Step Navigation Tabs */}
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                background: '#F1F5F9', 
                padding: '4px', 
                borderRadius: 'var(--radius-sm)' 
              }}>
                <button
                  type="button"
                  onClick={() => setReliefActiveStep(1)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: reliefActiveStep === 1 ? 700 : 500,
                    color: reliefActiveStep === 1 ? 'var(--text-headline)' : 'var(--text-muted)',
                    background: reliefActiveStep === 1 ? '#FFFFFF' : 'transparent',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: reliefActiveStep === 1 ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>1. Ground Damage Verification</span>
                  {selectedReliefApp.status !== 'Pending Government Verification' && (
                    <span style={{ fontSize: '10px', background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>✓ Verified</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setReliefActiveStep(2)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: reliefActiveStep === 2 ? 700 : 500,
                    color: reliefActiveStep === 2 ? 'var(--text-headline)' : 'var(--text-muted)',
                    background: reliefActiveStep === 2 ? '#FFFFFF' : 'transparent',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: reliefActiveStep === 2 ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>2. Adjudication Decision</span>
                  {selectedReliefApp.status === 'Approved' && (
                    <span style={{ fontSize: '10px', background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>✓ Sanctioned</span>
                  )}
                  {selectedReliefApp.status === 'Rejected' && (
                    <span style={{ fontSize: '10px', background: '#FEE2E2', color: '#DC2626', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>✕ Rejected</span>
                  )}
                </button>
              </div>

              {/* ================= STEP 1: VERIFICATION ================= */}
              {(reliefActiveStep === 1 || selectedReliefApp.status === 'Pending Government Verification') && (
                <div style={{
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '18px',
                  background: selectedReliefApp.status !== 'Pending Government Verification' ? '#F0FDF4' : '#FFFFFF'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: selectedReliefApp.status !== 'Pending Government Verification' ? '#15803D' : 'var(--brand-primary)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        {selectedReliefApp.status !== 'Pending Government Verification' ? '✓' : '1'}
                      </span>
                      <h4 style={{ fontSize: '14px', fontWeight: 800 }}>
                        Step 1: Ground Damage & Eligibility Verification
                      </h4>
                    </div>
                    {selectedReliefApp.status !== 'Pending Government Verification' && (
                      <span className="status-pill verified">Completed ✓</span>
                    )}
                  </div>

                  {selectedReliefApp.status === 'Pending Government Verification' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        fontSize: '13px', 
                        fontWeight: 600, 
                        cursor: 'pointer',
                        background: '#F8FAFC',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)'
                      }}>
                        <input 
                          type="checkbox" 
                          checked={reliefVerifiedCheckbox} 
                          onChange={e => setReliefVerifiedCheckbox(e.target.checked)} 
                          style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)' }}
                        />
                        <span>Confirm ground damage extent, cadastral boundaries & applicant eligibility verified on site</span>
                      </label>

                      {/* 2-Column Grid for Officer Recommendation and Damage Assessment */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        {/* Column 1: Officer Recommended Amount */}
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Officer Recommended Amount (₹) <span style={{ color: '#DC2626' }}>*</span></span>
                          </label>
                          <input 
                            type="number" 
                            className="form-input" 
                            placeholder="e.g. 40000"
                            value={reliefRecommendedAmount}
                            onChange={e => setReliefRecommendedAmount(e.target.value)}
                            style={{ fontWeight: 700, fontSize: '14px' }}
                          />
                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn-outline-pill"
                              style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px' }}
                              onClick={() => setReliefRecommendedAmount(String(selectedReliefApp.requestedAmount || ''))}
                            >
                              Citizen Requested: ₹{Number(selectedReliefApp.requestedAmount || 0).toLocaleString('en-IN')}
                            </button>
                            {selectedReliefApp.suggestedCompensation && (
                              <button
                                type="button"
                                className="btn-outline-pill"
                                style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px' }}
                                onClick={() => setReliefRecommendedAmount(String(selectedReliefApp.suggestedCompensation))}
                              >
                                Benchmark: ₹{Number(selectedReliefApp.suggestedCompensation).toLocaleString('en-IN')}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Column 2: Assessed Damage Percentage */}
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            Assessed Crop / Loss Extent (%)
                          </label>
                          <input 
                            type="number" 
                            min="0"
                            max="100"
                            className="form-input" 
                            placeholder="e.g. 70"
                            value={reliefAssessedDamage}
                            onChange={e => setReliefAssessedDamage(e.target.value)}
                            style={{ fontWeight: 700, fontSize: '14px' }}
                          />
                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            {[33, 50, 75, 100].map(pct => (
                              <button
                                key={pct}
                                type="button"
                                className="btn-outline-pill"
                                style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px' }}
                                onClick={() => setReliefAssessedDamage(String(pct))}
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Ground Loss Severity Classification Grade */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 700 }}>
                          Ground Loss Severity Classification Grade
                        </label>
                        <select 
                          className="form-select"
                          value={reliefDamageSeverity}
                          onChange={e => setReliefDamageSeverity(e.target.value)}
                        >
                          <option value="Severe Crop Inundation (50-75%)">Severe Crop Inundation / Substantial Loss (50-75%)</option>
                          <option value="Total Crop Destruction (>75%)">Total Crop / Asset Destruction (&gt;75%)</option>
                          <option value="Moderate Loss (33-50%)">Moderate Flood Damage / Recoverable Yield (33-50%)</option>
                          <option value="Minor Damage (<33%)">Minor Siltation / Below SDRF Trigger Threshold (&lt;33%)</option>
                        </select>
                      </div>

                      {/* Verification Notes */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 700 }}>
                          Inspecting Officer Ground Notes & Remarks
                        </label>
                        <textarea 
                          className="form-textarea" 
                          rows="2" 
                          placeholder="e.g. Field inspection conducted by taluk circle team. Soil siltation and standing crop loss confirmed with drone cadastral verification."
                          value={reliefVerificationNotes}
                          onChange={e => setReliefVerificationNotes(e.target.value)}
                        />
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '6px' }}>
                        <button 
                          type="button"
                          className="btn-gradient" 
                          style={{ padding: '10px 18px', fontWeight: 700 }}
                          onClick={handleStep1Verify}
                        >
                          Record Recommendation & Proceed to Step 2 →
                        </button>
                        <button
                          type="button"
                          className="btn-outline-pill"
                          onClick={() => setReliefActiveStep(2)}
                          style={{ fontSize: '12px', padding: '9px 14px' }}
                        >
                          Skip to Step 2 Decision →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Completed Step 1 Summary Card */}
                      <div style={{ 
                        background: '#F0FDF4', 
                        border: '1px solid #BBF7D0', 
                        borderRadius: 'var(--radius-sm)', 
                        padding: '14px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        marginBottom: '12px'
                      }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>OFFICER RECOMMENDED RELIEF</div>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: '#14532D' }}>
                            ₹{Number(selectedReliefApp.recommendedAmount || reliefRecommendedAmount || selectedReliefApp.suggestedCompensation || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>ASSESSED LOSS EXTENT</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#15803D' }}>
                            {selectedReliefApp.assessedDamagePercentage || reliefAssessedDamage || selectedReliefApp.damagePercentage || '—'}% Loss
                          </div>
                          <div style={{ fontSize: '11px', color: '#166534' }}>
                            {selectedReliefApp.damageSeverity || reliefDamageSeverity || 'Verified Extent'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>VERIFYING OFFICER</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#14532D' }}>
                            {selectedReliefApp.verifiedBy || officerName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#166534' }}>
                            {selectedReliefApp.verificationDate || 'Verified'}
                          </div>
                        </div>
                        <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #DCFCE7', paddingTop: '8px' }}>
                          <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>FIELD VERIFICATION NOTES</div>
                          <div style={{ fontSize: '12px', color: '#14532D', marginTop: '2px' }}>
                            {selectedReliefApp.verificationNotes || reliefVerificationNotes || 'Ground inspection verified on site.'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn-gradient"
                          style={{ fontSize: '12px', padding: '7px 16px' }}
                          onClick={() => setReliefActiveStep(2)}
                        >
                          Proceed to Step 2 Adjudication Decision →
                        </button>
                        <button
                          type="button"
                          className="btn-outline-pill"
                          style={{ fontSize: '11px', padding: '6px 12px' }}
                          onClick={() => setReliefActiveStep(1)}
                        >
                          Modify Step 1 Recommendation
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ================= STEP 2: APPROVAL OR REJECTION ================= */}
              {(reliefActiveStep === 2 || selectedReliefApp.status !== 'Pending Government Verification') && (
                <div style={{
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '18px',
                  background: '#FFFFFF'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: selectedReliefApp.status === 'Approved' ? '#15803D' : selectedReliefApp.status === 'Rejected' ? '#DC2626' : '#64748B',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        2
                      </span>
                      <h4 style={{ fontSize: '14px', fontWeight: 800 }}>
                        Step 2: Adjudication Decision (Approval or Rejection)
                      </h4>
                    </div>
                  </div>

                  {selectedReliefApp.status === 'Pending Government Verification' && (
                    <div style={{ 
                      background: '#FFFBEB', 
                      border: '1px solid #FDE68A', 
                      padding: '12px 14px', 
                      borderRadius: 'var(--radius-sm)', 
                      marginBottom: '16px' 
                    }}>
                      <div style={{ fontWeight: 700, color: '#B45309', fontSize: '12px', marginBottom: '2px' }}>
                        ℹ️ Ground Damage Verification (Step 1) is currently pending
                      </div>
                      <div style={{ fontSize: '11px', color: '#92400E', marginBottom: '8px' }}>
                        You can sanction relief or reject directly below (ground inspection will be attested automatically with your sanction), or click to record Step 1 first.
                      </div>
                      <button 
                        type="button" 
                        className="btn-outline-pill" 
                        style={{ background: '#FFFFFF', borderColor: '#D97706', color: '#B45309', fontWeight: 700, fontSize: '11px', padding: '4px 10px' }}
                        onClick={handleStep1Verify}
                      >
                        ✓ Attest Ground Damage Verification Now
                      </button>
                    </div>
                  )}

                  {selectedReliefApp.status === 'Approved' ? (
                    <div style={{ background: '#F0FDF4', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid #BBF7D0', fontSize: '13px', color: '#14532D' }}>
                      <strong>✓ Application Sanctioned for DBT Distribution</strong>
                      <div>Approved Amount: <strong>₹{Number(selectedReliefApp.approvedAmount).toLocaleString('en-IN')}</strong></div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Sanctioned by {selectedReliefApp.approvedBy || officerName} on {selectedReliefApp.approvalDate}</div>
                    </div>
                  ) : selectedReliefApp.status === 'Rejected' ? (
                    <div style={{ background: '#FEF2F2', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid #FECACA', fontSize: '13px', color: '#991B1B' }}>
                      <strong>✕ Application Rejected</strong>
                      <div>Reason: {selectedReliefApp.rejectionReason}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Rejected by {selectedReliefApp.rejectedBy || officerName}</div>
                    </div>
                  ) : (
                    /* Form for Step 2 Decision */
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '10px' }}>
                      {/* Option A: Approval */}
                      <div style={{ 
                        padding: '16px', 
                        background: '#F0FDF4', 
                        borderRadius: 'var(--radius-md)', 
                        border: '1px solid #BBF7D0',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}>
                        <div>
                          <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#15803D', marginBottom: '8px' }}>
                            Option A: Approve Relief
                          </h5>

                          {(selectedReliefApp.recommendedAmount || reliefRecommendedAmount) && (
                            <div style={{ 
                              background: '#DCFCE7', 
                              border: '1px solid #86EFAC', 
                              padding: '8px 10px', 
                              borderRadius: 'var(--radius-sm)', 
                              marginBottom: '10px',
                              fontSize: '11px',
                              color: '#14532D',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px'
                            }}>
                              <span>
                                Officer Recommended: <strong>₹{Number(selectedReliefApp.recommendedAmount || reliefRecommendedAmount).toLocaleString('en-IN')}</strong>
                              </span>
                              <button
                                type="button"
                                className="btn-outline-pill"
                                style={{ 
                                  fontSize: '10px', 
                                  padding: '2px 8px', 
                                  background: '#FFFFFF', 
                                  borderColor: '#16A34A', 
                                  color: '#15803D',
                                  fontWeight: 700
                                }}
                                onClick={() => setReliefApprovedAmount(String(selectedReliefApp.recommendedAmount || reliefRecommendedAmount))}
                              >
                                Use Recommended
                              </button>
                            </div>
                          )}

                          <div className="form-group">
                            <label className="form-label" style={{ color: '#166534' }}>
                              Officer Approved Amount (₹) <span style={{ color: '#DC2626' }}>*</span>
                            </label>
                            <input 
                              type="number" 
                              className="form-input" 
                              placeholder="Enter approved amount in ₹ (e.g. 40000)"
                              value={reliefApprovedAmount}
                              onChange={e => setReliefApprovedAmount(e.target.value)}
                              disabled={isLinkedClaimDisputed}
                            />
                          </div>
                        </div>

                        <button 
                          className="btn-gradient"
                          style={{ marginTop: '12px', width: '100%', justifyContent: 'center' }}
                          onClick={handleStep2Approve}
                          disabled={isLinkedClaimDisputed || !reliefApprovedAmount}
                          title={isLinkedClaimDisputed ? "Approval blocked due to active dispute on linked claim" : "Approve Relief"}
                        >
                          {isLinkedClaimDisputed ? 'Blocked: Disputed Claim' : 'Approve Relief Sanction →'}
                        </button>
                      </div>

                      {/* Option B: Rejection */}
                      <div style={{ 
                        padding: '16px', 
                        background: '#FEF2F2', 
                        borderRadius: 'var(--radius-md)', 
                        border: '1px solid #FECACA',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}>
                        <div>
                          <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#B91C1C', marginBottom: '8px' }}>
                            Option B: Reject Application
                          </h5>
                          <div className="form-group">
                            <label className="form-label" style={{ color: '#991B1B' }}>
                              Rejection Reason (Required) <span style={{ color: '#DC2626' }}>*</span>
                            </label>
                            <textarea 
                              className="form-textarea" 
                              rows="2"
                              placeholder="State mandatory official justification for rejection..."
                              value={reliefRejectionReason}
                              onChange={e => setReliefRejectionReason(e.target.value)}
                            />
                          </div>
                        </div>

                        <button 
                          className="btn-outline-pill"
                          style={{ 
                            marginTop: '12px', 
                            width: '100%', 
                            justifyContent: 'center', 
                            color: '#B91C1C', 
                            borderColor: '#FECACA' 
                          }}
                          onClick={handleStep2Reject}
                          disabled={!reliefRejectionReason.trim()}
                        >
                          Reject Application ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-black-pill" onClick={() => setSelectedReliefApp(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
