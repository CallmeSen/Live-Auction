import { Navigate, Route, Routes } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';
import LoginPage from '../features/auth/pages/LoginPage';
import RegisterPage from '../features/auth/pages/RegisterPage';
import AccessDeniedPage from '../features/auth/pages/AccessDeniedPage';
import AuctionListPage from '../features/auction/pages/AuctionListPage';
import AuctionDetailPage from '../features/auction/pages/AuctionDetailPage';
import CreateAuctionPage from '../features/auction/pages/CreateAuctionPage';
import MyAuctionsPage from '../features/auction/pages/MyAuctionsPage';
import EditAuctionPage from '../features/auction/pages/EditAuctionPage';
import MyBidsPage from '../features/bid/pages/MyBidsPage';
import ProfilePage from '../features/user/pages/ProfilePage';
import AdminDashboardPage from '../features/admin/pages/AdminDashboardPage';
import AdminUsersPage from '../features/admin/pages/AdminUsersPage';
import AdminAuctionsPage from '../features/admin/pages/AdminAuctionsPage';
import AdminCategoriesPage from '../features/admin/pages/AdminCategoriesPage';
import NotificationsPage from '../features/notifications/pages/NotificationsPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auctions" replace />} />
      <Route path="/home" element={<Navigate to="/auctions" replace />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<MainLayout />}>
<<<<<<< HEAD
        <Route path="/auctions" element={<AuctionListPage />} />
        <Route path="/auctions/:id" element={<AuctionDetailPage />} />
=======
        <Route path="/auction-items" element={<AuctionListPage />} />
        <Route path="/auction-items/:id" element={<AuctionDetailPage />} />
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)

        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/forbidden" element={<AccessDeniedPage />} />

          <Route element={<RoleRoute allowedRoles={['USER']} />}>
            <Route path="/my-bids" element={<MyBidsPage />} />
<<<<<<< HEAD
            <Route path="/auctions/create" element={<CreateAuctionPage />} />
=======
            <Route path="/auction-items/create" element={<CreateAuctionPage />} />
>>>>>>> 3d6cdde (temp: preserve auction frontend and backend changes)
            <Route path="/my-auctions" element={<MyAuctionsPage />} />
            <Route path="/my-auctions/:id/edit" element={<EditAuctionPage />} />
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
