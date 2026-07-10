import { Link, useLocation } from 'react-router-dom';
import Modal from './Modal';

interface AuthRequiredModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthRequiredModal({
  open,
  onClose,
}: AuthRequiredModalProps) {
  const location = useLocation();
  const from = `${location.pathname}${location.search}`;

  return (
    <Modal
      open={open}
      title="Bạn cần đăng nhập"
      onClose={onClose}
    >
      <p className="text-sm leading-6 text-[#8ca093]">
        Vui lòng đăng nhập hoặc đăng ký tài khoản để tham gia đấu giá
        và sử dụng các tính năng dành cho thành viên.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          to="/login"
          state={{ from }}
          onClick={onClose}
          className="rounded-md bg-[#C9A227] px-5 py-3 text-center text-sm font-semibold text-[#0F1B14] hover:bg-[#e0c15a]"
        >
          Đăng nhập
        </Link>

        <Link
          to="/register"
          state={{ from }}
          onClick={onClose}
          className="rounded-md border border-[#3a4d40] px-5 py-3 text-center text-sm font-semibold text-[#F3EFE6] hover:border-[#C9A227] hover:text-[#C9A227]"
        >
          Đăng ký
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-[#607468]">
        Bạn vẫn có thể đóng thông báo để tiếp tục xem vật phẩm.
      </p>
    </Modal>
  );
}