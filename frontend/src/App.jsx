import React from 'react';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import { AuthProvider } from './modules/user/context/AuthContext';
import { userRoutes } from './modules/user/routes/userRoutes';
import { AdminAuthProvider } from './modules/admin/context/AdminAuthContext';
import { ToastProvider } from './modules/admin/context/ToastContext';
import { adminRoutes } from './modules/admin/routes/adminRoutes';
import { ScrollToTop } from './modules/user/components/ScrollToTop';

function AppRoutes() {
  const routes = useRoutes([...adminRoutes, ...userRoutes]);
  return routes;
}

export default function App() {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <ScrollToTop />
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </AdminAuthProvider>
    </AuthProvider>
  );
}

