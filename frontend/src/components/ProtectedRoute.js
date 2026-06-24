import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 auth-bg">
        <Logo size="lg" />
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 rounded-full bg-[#00a5df] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
};

export default ProtectedRoute;
