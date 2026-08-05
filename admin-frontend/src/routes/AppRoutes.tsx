import { Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';
import LoginPage from '../features/auth/pages/LoginPage';
import AccessDeniedPage from '../features/auth/pages/AccessDeniedPage';
import AdminDashboardPage from '../features/admin/pages/AdminDashboardPage';
import AdminUsersPage from '../features/admin/pages/AdminUsersPage';
import AdminAccountsPage from '../features/admin/pages/AdminAccountsPage';
import AdminAuctionsPage from '../features/admin/pages/AdminAuctionsPage';
import AdminCategoriesPage from '../features/admin/pages/AdminCategoriesPage';
import AdminProfilePage from '../features/user/pages/ProfilePage';
import AuctionSessionDetailPage from '../features/auction/pages/AuctionSessionDetailPage';
import AuctionDetailPage from '../features/auction/pages/AuctionDetailPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/profile" element={<AdminProfilePage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/admin-accounts" element={<AdminAccountsPage />} />
            <Route path="/admin/auctions" element={<AdminAuctionsPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/auction-sessions/:id" element={<AuctionSessionDetailPage />} />
            <Route path="/auction-items/:id" element={<AuctionDetailPage />} />
            <Route path="/forbidden" element={<AccessDeniedPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
