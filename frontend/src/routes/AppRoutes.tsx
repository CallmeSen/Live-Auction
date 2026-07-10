import { Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import MainLayout from '../layouts/MainLayout';
import ProtectedRoute from './ProtectedRoute';
import LoginPage from '../features/auth/pages/LoginPage';
import RegisterPage from '../features/auth/pages/RegisterPage';
import AuctionListPage from '../features/auction/pages/AuctionListPage';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Mặc định vào thẳng trang đăng nhập */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Nhóm route xác thực - dùng AuthLayout (2 cột) */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Nhóm route chính - yêu cầu đăng nhập, dùng MainLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/home" element={<AuctionListPage />} />
        </Route>
      </Route>

      {/* Route không tồn tại -> quay về đăng nhập */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}