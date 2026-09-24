import React from 'react';
import { Navigate } from 'react-router-dom';
import { AdminLayout } from '../layouts/AdminLayout';
import { AdminLoginPage } from '../pages/AdminLoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { CustomersListPage } from '../pages/CustomersListPage';
import { CustomerDetailPage } from '../pages/CustomerDetailPage';
import { AddCustomerPage } from '../pages/AddCustomerPage';
import { PurchasesListPage } from '../pages/PurchasesListPage';
import { RecordPurchasePage } from '../pages/RecordPurchasePage';
import { PurchaseDetailPage } from '../pages/PurchaseDetailPage';
import { LoyaltyAdminPage } from '../pages/LoyaltyAdminPage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';

export const adminRoutes = [
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'customers',
        element: <CustomersListPage />,
      },
      {
        path: 'customers/new',
        element: <AddCustomerPage />,
      },
      {
        path: 'customers/:id',
        element: <CustomerDetailPage />,
      },
      {
        path: 'purchases',
        element: <PurchasesListPage />,
      },
      {
        path: 'purchases/new',
        element: <RecordPurchasePage />,
      },
      {
        path: 'purchases/:id',
        element: <PurchaseDetailPage />,
      },
      {
        path: 'loyalty',
        element: <LoyaltyAdminPage />,
      },
      {
        path: 'reports',
        element: <ReportsPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: '*',
        element: <Navigate to="/admin" replace />,
      },
    ],
  },
];
