import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const AUTH_STORAGE_KEY = 'bhoomi_setu_auth';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
  };

  const login = (username, password, role) => {
    if (!username || !username.trim()) {
      throw new Error("Username is required.");
    }
    if (!password || !password.trim()) {
      throw new Error("Password is required.");
    }

    const nameKey = username.trim().toLowerCase();
    const storedAadhaar = localStorage.getItem(`bhoomi_aadhaar_${nameKey}`)
      || localStorage.getItem('bhoomi_last_registered_aadhaar')
      || (role === 'CITIZEN' ? '5432-8765-4912' : '');

    const userData = {
      name: username.trim(),
      username: username.trim(),
      role: role, // 'CITIZEN' or 'GOVERNMENT'
      aadhaar: storedAadhaar
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
    setUser(userData);

    if (role === 'CITIZEN') {
      navigate('/citizen');
    } else {
      navigate('/dashboard');
    }
    return userData;
  };

  const loginWithSession = (session) => {
    const roleNormalized = (session.role || 'citizen').toUpperCase();
    const nameKey = (session.name || '').trim().toLowerCase();
    let storedAadhaar = session.aadhaar 
      || localStorage.getItem(`bhoomi_aadhaar_${nameKey}`)
      || (session.userId ? localStorage.getItem(`bhoomi_aadhaar_uid_${session.userId}`) : null)
      || localStorage.getItem('bhoomi_last_registered_aadhaar')
      || '';

    if (!storedAadhaar && roleNormalized === 'CITIZEN') {
      if (session.userId) {
        const hex = session.userId.replace(/[^0-9a-f]/gi, '').slice(0, 8);
        const digits = (parseInt(hex, 16) || 84291754).toString().padStart(8, '4');
        storedAadhaar = `5432-8765-${digits.slice(-4)}`;
      } else {
        storedAadhaar = '5432-8765-4912';
      }
      try {
        if (nameKey) localStorage.setItem(`bhoomi_aadhaar_${nameKey}`, storedAadhaar);
      } catch (e) {}
    }

    const userData = {
      token: session.jwt,
      jwt: session.jwt,
      userId: session.userId,
      role: roleNormalized,
      name: session.name || (roleNormalized === 'GOVERNMENT' ? 'Officer' : 'Citizen'),
      aadhaar: storedAadhaar
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
    setUser(userData);
    navigate(roleNormalized === 'CITIZEN' ? '/citizen' : '/dashboard');
    return userData;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
    navigate('/');
  };

  return (
    <AuthContext.Provider value={{ user, login, loginWithSession, logout, currentPath, navigate }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
