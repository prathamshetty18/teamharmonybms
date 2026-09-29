import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LandingView from './components/LandingView';
import CitizenPortalView from './components/CitizenPortalView';
import GovernmentPortalView from './components/GovernmentPortalView';
import LandReportModal from './components/LandReportModal';
import QRCertificateModal from './components/QRCertificateModal';
import QRScannerModal from './components/QRScannerModal';
import NotificationStack from './components/NotificationStack';
import ProtectedRoute from './components/ProtectedRoute';
import PublicVerify from './pages/PublicVerify';
import Signup from './pages/Signup';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './services/api';
import './styles/dashboard.css';

function MainApp() {
  const { user, currentPath, navigate } = useAuth();

  const [parcels, setParcels] = useState([]);
  const [reliefApplications, setReliefApplications] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState([]);

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [targetModalParcel, setTargetModalParcel] = useState(null);

  // Direct URL routing for /verify/:id
  const pathParts = currentPath.split('/');
  const isVerifyRoute = pathParts[1] === 'verify' && pathParts[2];
  const verifyClaimId = isVerifyRoute ? pathParts[2] : null;

  // Refresh all application state
  const refreshData = async () => {
    try {
      const [allParcels, allRelief, allLogs] = await Promise.all([
        api.getParcels(),
        api.getReliefApplications(),
        api.getAuditLogs()
      ]);
      setParcels(allParcels || []);
      setReliefApplications(allRelief || []);
      setAuditLogs(allLogs || []);
    } catch (err) {
      console.error("Failed to load application data:", err);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleDismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const addNotification = (notif) => {
    setNotifications(prev => [
      {
        id: Date.now() + Math.random(),
        time: 'Just now',
        ...notif
      },
      ...prev
    ]);
  };

  // Search handler
  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const found = await api.getParcelByLandId(searchQuery.trim());
    if (found) {
      setTargetModalParcel(found);
      setIsReportModalOpen(true);
    } else {
      alert(`No record found matching "${searchQuery}". Please check the Claim / Land ID or Survey Number.`);
    }
  };

  // 1. Citizen registers new claim (Change 2)
  const handleRegisterClaim = async (claimData) => {
    const created = await api.createCitizenClaim(claimData);
    await refreshData();
    addNotification({
      type: 'success',
      title: '✓ Land Claim Recorded on MST Blockchain',
      body: `Claim ${created.landId} registered for Survey #${created.surveyNumber} (${created.areaAcres} Acres).`,
      txHash: created.txHash,
      explorerUrl: created.explorerUrl
    });
    return created;
  };

  // 2. Government approves claim
  const handleApproveClaim = async (landId, approvalData) => {
    const updated = await api.approveLandClaim(landId, approvalData);
    await refreshData();
    addNotification({
      type: 'success',
      title: '✓ LAND STATUS: VERIFIED ON-CHAIN',
      body: `Title seal granted to Land ID ${landId}. Digital certificate issued on MST Testnet.`,
      txHash: updated.approvalTxHash || updated.txHash,
      explorerUrl: updated.explorerUrl
    });
    return updated;
  };

  const handleElevateScore = async (landId, officerName) => {
    const updated = await api.elevateConfidenceScore(landId, officerName);
    await refreshData();
    addNotification({
      type: 'info',
      title: '✓ Ground Inspection Attested On-Chain',
      body: `Confidence score for ${landId} elevated to statutory consensus threshold (5/5).`,
      txHash: updated.txHash,
      explorerUrl: updated.explorerUrl
    });
    return updated;
  };

  // 3. Dispute management
  const handleDisputeClaim = async (landId, reason, officerName) => {
    const updated = await api.disputeClaim(landId, reason, officerName);
    await refreshData();
    addNotification({
      type: 'warning',
      title: '⚠️ Claim Dispute Flagged On-Chain',
      body: `Claim ${landId} marked as Disputed on LandRegistry.sol. Associated relief sanctions are frozen.`,
      txHash: updated.disputeTxHash || updated.txHash,
      explorerUrl: updated.explorerUrl
    });
    return updated;
  };

  const handleResolveDispute = async (landId, officerName) => {
    const updated = await api.resolveDispute(landId, officerName);
    await refreshData();
    addNotification({
      type: 'success',
      title: '✓ Dispute Resolved On-Chain',
      body: `Dispute on Claim ${landId} cleared on LandRegistry.sol. Title restored to Verified.`,
      txHash: updated.resolveTxHash || updated.txHash,
      explorerUrl: updated.explorerUrl
    });
    return updated;
  };

  // 4. Citizen applies for disaster relief (Change 4)
  const handleApplyRelief = async (reliefData) => {
    const created = await api.createReliefApplication(reliefData);
    await refreshData();
    addNotification({
      type: 'success',
      title: '✓ Disaster Relief Application Lodged On-Chain',
      body: `Application ${created.applicationId} registered for ₹${Number(created.requestedAmount).toLocaleString('en-IN')}. Status: Pending Government Verification.`,
      txHash: created.txHash,
      explorerUrl: created.explorerUrl
    });
    return created;
  };

  // 5. Government Step 1: Verify relief (Change 4)
  const handleVerifyRelief = async (reliefId, data) => {
    const updated = await api.verifyReliefApplication(reliefId, data);
    await refreshData();
    addNotification({
      type: 'info',
      title: '✓ Relief Application Verified (Step 1)',
      body: `Relief application ${reliefId} verified by officer. Status: Verified - Awaiting Approval.`,
      txHash: updated.verificationTxHash || updated.txHash,
      explorerUrl: updated.explorerUrl
    });
    return updated;
  };

  // 6. Government Step 2: Approve relief (Change 4)
  const handleApproveRelief = async (reliefId, data) => {
    const updated = await api.approveReliefApplication(reliefId, data);
    await refreshData();
    addNotification({
      type: 'success',
      title: '✓ Disaster Relief Sanctioned On-Chain (ReliefFund.sol)',
      body: `Relief ${reliefId} approved for ₹${Number(updated.approvedAmount).toLocaleString('en-IN')}. Queued for DBT distribution on MST Blockchain.`,
      txHash: updated.approvalTxHash || updated.txHash,
      explorerUrl: updated.explorerUrl
    });
    return updated;
  };

  // 7. Government Step 2: Reject relief (Change 4)
  const handleRejectRelief = async (reliefId, data) => {
    const updated = await api.rejectReliefApplication(reliefId, data);
    await refreshData();
    addNotification({
      type: 'warning',
      title: 'Relief Application Rejected',
      body: `Relief ${reliefId} rejected. Reason: ${updated.rejectionReason}`
    });
    return updated;
  };

  // Public Verification Route
  if (isVerifyRoute) {
    return <PublicVerify claimId={verifyClaimId} onBack={() => { navigate('/'); }} />;
  }

  return (
    <div className="app-layout">
      {/* Official Government Navbar */}
      <Navbar 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        openScanner={() => setIsScannerModalOpen(true)}
      />

      {/* Main Active View Based on URL Route */}
      <main style={{ flex: 1 }}>
        {currentPath === '/signup' ? (
          <Signup />
        ) : currentPath === '/login' ? (
          <Login />
        ) : (currentPath === '/citizen' || (currentPath === '/dashboard' && user?.role === 'CITIZEN')) ? (
          <ProtectedRoute allowedRole="CITIZEN">
            <CitizenPortalView 
              parcels={parcels}
              reliefApplications={reliefApplications}
              onRegisterClaim={handleRegisterClaim}
              onApplyRelief={handleApplyRelief}
              onOpenReport={(p) => {
                setTargetModalParcel(p);
                setIsReportModalOpen(true);
              }}
              onOpenQR={(p) => {
                setTargetModalParcel(p);
                setIsQRModalOpen(true);
              }}
            />
          </ProtectedRoute>
        ) : currentPath === '/dashboard' ? (
          <ProtectedRoute allowedRole="GOVERNMENT">
            <GovernmentPortalView 
              parcels={parcels}
              reliefApplications={reliefApplications}
              auditLogs={auditLogs}
              onApproveClaim={handleApproveClaim}
              onElevateScore={handleElevateScore}
              onDisputeClaim={handleDisputeClaim}
              onResolveDispute={handleResolveDispute}
              onVerifyRelief={handleVerifyRelief}
              onApproveRelief={handleApproveRelief}
              onRejectRelief={handleRejectRelief}
              onOpenReport={(p) => {
                setTargetModalParcel(p);
                setIsReportModalOpen(true);
              }}
              onOpenQR={(p) => {
                setTargetModalParcel(p);
                setIsQRModalOpen(true);
              }}
            />
          </ProtectedRoute>
        ) : (
          /* Route "/" or any other unauthenticated route */
          <LandingView />
        )}
      </main>

      {/* Floating Notifications */}
      <NotificationStack 
        notifications={notifications}
        onDismiss={handleDismissNotification}
      />

      {/* Modals */}
      <LandReportModal 
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        parcel={targetModalParcel}
        onOpenQR={(p) => {
          setIsReportModalOpen(false);
          setTargetModalParcel(p);
          setIsQRModalOpen(true);
        }}
      />

      <QRCertificateModal 
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        parcel={targetModalParcel}
      />

      <QRScannerModal 
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        parcels={parcels}
        onInspectParcel={(p) => {
          setTargetModalParcel(p);
          setIsReportModalOpen(true);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
