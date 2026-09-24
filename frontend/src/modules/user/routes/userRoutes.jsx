import React from 'react';
import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserLayout } from '../layouts/UserLayout';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { PurchaseHistoryPage } from '../pages/PurchaseHistoryPage';
import { PurchaseDetailPage } from '../pages/PurchaseDetailPage';
import { ProfilePage } from '../pages/ProfilePage';
import { LoyaltyPage } from '../pages/LoyaltyPage';

/**
 * Guard for protected customer screens
 */
const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  // Forward the layout's outlet context (e.g. onOpenStoreInfo) to the protected pages
  const layoutContext = useOutletContext();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet context={layoutContext} />;
};

/**
 * Root index redirector
 */
const RootRedirect = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Navigate to={isAuthenticated ? "/home" : "/login"} replace />;
};

export const userRoutes = [
  {
    path: '/',
    element: <UserLayout />,
    children: [
      {
        index: true,
        element: <RootRedirect />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      // Protected Customer Routes
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: 'home',
            element: <HomePage />,
          },
          {
            path: 'purchases',
            element: <PurchaseHistoryPage />,
          },
          {
            path: 'purchases/:id',
            element: <PurchaseDetailPage />,
          },
          {
            path: 'loyalty',
            element: <LoyaltyPage />,
          },
          {
            path: 'profile',
            element: <ProfilePage />,
          },
        ],
      },
      {
        path: '*',
        element: <Navigate to="/home" replace />,
      },
    ],
  },
];

