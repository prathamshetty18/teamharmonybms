import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, navigate } = useAuth();

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    if (allowedRole && user.role !== allowedRole) {
      if (user.role === 'CITIZEN') {
        navigate('/citizen');
      } else if (user.role === 'GOVERNMENT') {
        navigate('/dashboard');
      } else {
        navigate('/');
      }
    }
  }, [user, allowedRole, navigate]);

  if (!user) {
    return null;
  }

  if (allowedRole && user.role !== allowedRole) {
    return null;
  }

  return children;
}
