import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LandingView from './components/LandingView';
import FarmerPortalView from './components/FarmerPortalView';
import GroundVerificationView from './components/GroundVerificationView';
import GovernmentPortalView from './components/GovernmentPortalView';
import DisasterReliefView from './components/DisasterReliefView';
import LandReportModal from './components/LandReportModal';
import QRCertificateModal from './components/QRCertificateModal';
import QRScannerModal from './components/QRScannerModal';
import AuthModal from './components/AuthModal';
import PublicVerify from './pages/PublicVerify';
import { api } from './services/api';
import { authService } from './services/authService';
import { INITIAL_NOTIFICATIONS } from './data/mockData';
import NotificationStack from './components/NotificationStack';
import './styles/dashboard.css';
import './styles/authModal.css';

export default function App() {
  const [activePortal, setActivePortal] = useState('landing'); // 'landing', 'farmer', 'ground', 'government', 'disaster'
  const [parcels, setParcels] = useState([]);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [targetModalParcel, setTargetModalParcel] = useState(null);

  // Direct URL routing for /verify/:id
  const pathParts = window.location.pathname.split('/');
  const isVerifyRoute = pathParts[1] === 'verify' && pathParts[2];
  const verifyClaimId = isVerifyRoute ? pathParts[2] : null;

  // Initialize data and user session
  useEffect(() => {
    async function init() {
      // 1. Check existing authenticated session
      const storedUser = authService.getStoredUser();
      if (storedUser) {
        setCurrentUser(storedUser);
        // Verify with backend
        try {
          const freshUser = await authService.getCurrentUser();
          if (freshUser) {
            setCurrentUser(freshUser);
          }
        } catch {
          // offline or server restarting
        }
      }

      // 2. Load parcel data
      const data = await api.getParcels();
      setParcels(data);
      if (data.length > 0 && !selectedParcel) {
        setSelectedParcel(data[0]);
      }
    }
    init();
  }, []);

  const handleDismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);

    // Route automatically based on user's authorized role
    if (user.role === 'CITIZEN') {
      setActivePortal('farmer');
    } else if (user.role === 'VERIFICATION_OFFICER') {
      setActivePortal('ground');
    } else if (user.role === 'GOVERNMENT_OFFICER' || user.role === 'ADMIN') {
      setActivePortal('government');
    }

    setNotifications(prev => [
      {
        id: Date.now(),
        type: 'success',
        title: `✓ Authenticated as ${user.role}`,
        body: `Welcome, ${user.full_name || user.name || user.username}. Connected to BhoomiSetu backend.`,
        time: 'Just now'
      },
      ...prev
    ]);
  };

  const handleLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setActivePortal('landing');
    setNotifications(prev => [
      {
        id: Date.now(),
        type: 'success',
        title: 'Logged Out',
        body: 'You have been successfully signed out of BhoomiSetu.',
        time: 'Just now'
      },
      ...prev
    ]);
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery) return;
    const found = await api.getParcelByLandId(searchQuery);
    if (found) {
      setTargetModalParcel(found);
      setIsReportModalOpen(true);
    } else {
      alert(`No record found matching "${searchQuery}". Please check the Land ID or Survey Number.`);
    }
  };

  // Farmer registers a new claim
  const handleRegisterClaim = async (claimData) => {
    const created = await api.createFarmerClaim(claimData);
    const updated = await api.getParcels();
    setParcels(updated);
    setSelectedParcel(created);

    setNotifications(prev => [
      {
        id: Date.now(),
        type: created.hasClassificationMismatch ? 'warning' : 'success',
        title: created.hasClassificationMismatch ? '⚠️ Classification Review Required' : '✓ Claim Lodged on National Cadastre',
        body: `Application ${created.applicationId} registered for Survey #${created.surveyNumber}. Land ID assigned: ${created.landId}.`,
        time: 'Just now'
      },
      ...prev
    ]);
  };

  // Ground verification submitted
  const handleGroundVerification = async (landId, findings) => {
    const updated = await api.submitGroundVerification(landId, findings);
    const all = await api.getParcels();
    setParcels(all);
    setSelectedParcel(updated);

    setNotifications(prev => [
      {
        id: Date.now(),
        type: updated.hasClassificationMismatch ? 'warning' : 'success',
        title: updated.hasClassificationMismatch ? '⚠️ Land-Use Mismatch Escalated' : 'Ground Inspection Completed',
        body: `Team ${findings.teamId} submitted findings for ${landId}. Result: ${findings.result}.`,
        time: 'Just now'
      },
      ...prev
    ]);
  };

  // Government officer approves claim
  const handleApproveClaim = async (landId, approvalData) => {
    const updated = await api.approveLandClaim(landId, approvalData);
    const all = await api.getParcels();
    setParcels(all);
    setSelectedParcel(updated);

    setNotifications(prev => [
      {
        id: Date.now(),
        type: 'success',
        title: '✓ LAND STATUS: VERIFIED',
        body: `Title granted to Land ID ${landId}. Digital land certificate and QR proof issued.`,
        time: 'Just now'
      },
      ...prev
    ]);
  };

  // Submit disaster relief claim
  const handleSubmitDisasterClaim = async (landId, disasterData) => {
    const updated = await api.submitDisasterClaim(landId, disasterData);
    const all = await api.getParcels();
    setParcels(all);
    setSelectedParcel(updated);

    setNotifications(prev => [
      {
        id: Date.now(),
        type: 'success',
        title: 'Disaster Relief Sanctioned',
        body: `Relief Claim ${updated.disasterClaim.claimId}: Sanctioned ₹${updated.disasterClaim.sanctionedAmount.toLocaleString('en-IN')}. Initial DBT released.`,
        time: 'Just now'
      },
      ...prev
    ]);
  };

  // Gate navigation from Landing Page
  const handleSelectGate = (gate) => {
    switch (gate) {
      case 'claim-land':
      case 'farmer-portal':
        setActivePortal('farmer');
        break;
      case 'ground-verification':
        setActivePortal('ground');
        break;
      case 'government-portal':
        setActivePortal('government');
        break;
      case 'disaster-relief':
        setActivePortal('disaster');
        break;
      default:
        setActivePortal('landing');
    }
  };

  if (isVerifyRoute) {
    return <PublicVerify claimId={verifyClaimId} onBack={() => { window.location.href = '/'; }} />;
  }

  return (
    <div className="app-layout">
      {/* Official Government Navbar connecting the portals & Auth */}
      <Navbar 
        activePortal={activePortal}
        setActivePortal={setActivePortal}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        openScanner={() => setIsScannerModalOpen(true)}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Active View Based on Selected Portal */}
      <main style={{ flex: 1 }}>
        {activePortal === 'landing' && (
          <LandingView 
            parcels={parcels}
            onSelectGate={handleSelectGate}
            onLocationSearch={(loc) => {
              const matched = parcels.find(p => p.state === loc.state && (p.district === loc.district || p.surveyNumber === loc.surveyNo));
              if (matched) {
                setTargetModalParcel(matched);
                setIsReportModalOpen(true);
              } else {
                alert(`No cadastral records found for survey #${loc.surveyNo} in ${loc.village}, ${loc.district}.`);
              }
            }}
            openScanner={() => setIsScannerModalOpen(true)}
          />
        )}

        {activePortal === 'farmer' && (
          <FarmerPortalView 
            parcels={parcels}
            onRegisterClaim={handleRegisterClaim}
            onOpenReport={(p) => {
              setTargetModalParcel(p);
              setIsReportModalOpen(true);
            }}
            onOpenQR={(p) => {
              setTargetModalParcel(p);
              setIsQRModalOpen(true);
            }}
            onApplyDisasterRelief={(p) => {
              setSelectedParcel(p);
              setActivePortal('disaster');
            }}
          />
        )}

        {activePortal === 'ground' && (
          <GroundVerificationView 
            parcels={parcels}
            onSubmitVerification={handleGroundVerification}
          />
        )}

        {activePortal === 'government' && (
          <GovernmentPortalView 
            parcels={parcels}
            onApproveClaim={handleApproveClaim}
            onOpenReport={(p) => {
              setTargetModalParcel(p);
              setIsReportModalOpen(true);
            }}
            onOpenQR={(p) => {
              setTargetModalParcel(p);
              setIsQRModalOpen(true);
            }}
          />
        )}

        {activePortal === 'disaster' && (
          <DisasterReliefView 
            parcels={parcels}
            preSelectedParcel={selectedParcel}
            onSubmitDisasterClaim={handleSubmitDisasterClaim}
          />
        )}
      </main>

      {/* Floating Notifications */}
      <NotificationStack 
        notifications={notifications}
        onDismiss={handleDismissNotification}
      />

      {/* Modals */}
      <AuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      <LandReportModal 
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        parcel={targetModalParcel || parcels[0]}
        onOpenQR={(p) => {
          setIsReportModalOpen(false);
          setTargetModalParcel(p);
          setIsQRModalOpen(true);
        }}
      />

      <QRCertificateModal 
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        parcel={targetModalParcel || parcels[0]}
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
