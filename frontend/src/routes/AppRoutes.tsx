import { Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';
import LoginPage from '../features/auth/pages/LoginPage';
import RegisterPage from '../features/auth/pages/RegisterPage';
import ForgotPasswordPage from '../features/auth/pages/ForgotPasswordPage';
import ResetPasswordPage from '../features/auth/pages/ResetPasswordPage';
import AccessDeniedPage from '../features/auth/pages/AccessDeniedPage';
import AuctionListPage from '../features/auction/pages/AuctionListPage';
import AuctionDetailPage from '../features/auction/pages/AuctionDetailPage';
import CreateAuctionPage from '../features/auction/pages/CreateAuctionPage';
import MyAuctionsPage from '../features/auction/pages/MyAuctionsPage';
import MyBidsPage from '../features/bid/pages/MyBidsPage';
import ProfilePage from '../features/user/pages/ProfilePage';
import AdminDashboardPage from '../features/admin/pages/AdminDashboardPage';
import AdminUsersPage from '../features/admin/pages/AdminUsersPage';
import AdminAuctionsPage from '../features/admin/pages/AdminAuctionsPage';
import AdminCategoriesPage from '../features/admin/pages/AdminCategoriesPage';
import NotificationsPage from '../features/notifications/pages/NotificationsPage';
import AuctionSessionDetailPage from '../features/auction/pages/AuctionSessionDetailPage';
import AuctionItemEditorPage from '../features/auction/pages/AuctionItemEditorPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auctions" replace />} />
      <Route path="/home" element={<Navigate to="/auctions" replace />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<MainLayout />}>
        <Route path="/auctions" element={<AuctionListPage />} />
        <Route path="/auction-sessions/:id" element={<AuctionSessionDetailPage />} />
        <Route path="/auction-items/:id" element={<AuctionDetailPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/forbidden" element={<AccessDeniedPage />} />

          <Route element={<RoleRoute allowedRoles={['USER']} />}>
            <Route path="/my-bids" element={<MyBidsPage />} />
            <Route path="/auctions/create" element={<CreateAuctionPage />} />
            <Route path="/my-auctions" element={<MyAuctionsPage />} />
            <Route
              path="/auction-sessions/:sessionId/items/create"
              element={<AuctionItemEditorPage />}
            />
            <Route
              path="/auction-items/:itemId/edit"
              element={<AuctionItemEditorPage />}
            />
          </Route>

          <Route element={<RoleRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/auctions" element={<AdminAuctionsPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/auctions" replace />} />
    </Routes>
  );
}
