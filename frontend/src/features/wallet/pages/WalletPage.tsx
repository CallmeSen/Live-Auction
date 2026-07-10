import { Link } from 'react-router-dom';
import { mockTransactions } from '../../../mocks/auctions';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';

const typeLabel = { DEPOSIT: 'Nạp tiền', HOLD: 'Tạm giữ', RELEASE: 'Hoàn tiền', PAYMENT: 'Thanh toán' };

export default function WalletPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <span className="font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">Tài chính</span>
          <h1 className="mt-2 font-display text-4xl">Ví của tôi</h1>
          <p className="mt-2 text-sm text-[#7d9186]">Quản lý số dư và các khoản tạm giữ khi tham gia đấu giá.</p>
        </div>
        <div className="flex gap-3"><Link to="/wallet/withdraw" className="rounded-md border border-[#3a4d40] px-5 py-3 text-center text-sm font-semibold text-[#F3EFE6] hover:border-[#C9A227]">Rút tiền</Link><Link to="/wallet/deposit" className="rounded-md bg-[#C9A227] px-5 py-3 text-center text-sm font-semibold text-[#0F1B14] hover:bg-[#e0c15a]">＋ Nạp tiền</Link></div>
      </div>

      <div className="mt-9 grid gap-5 md:grid-cols-[1.3fr_0.7fr]">
        <div className="relative overflow-hidden rounded-2xl border border-[#566b5c] bg-[#1b3022] p-7 sm:p-8">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full border-[40px] border-[#C9A227]/5" />
          <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-[0.16em] text-[#8ca093]">Tổng số dư</p><span className="rounded-full bg-[#2f6541]/20 px-3 py-1 text-[10px] text-[#8fc99c]">ACTIVE</span></div>
          <p className="mt-3 font-display text-4xl text-[#F3EFE6] sm:text-5xl">{formatCurrency(50_000_000)}</p>
          <div className="mt-6 flex items-center justify-between text-xs text-[#7d9186]"><span>Mã ví ···· 6208</span><span>VND</span></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
          <div className="rounded-xl border border-[#2a3f31] bg-[#14231a] p-5">
            <p className="text-xs text-[#7d9186]">Đang tạm giữ</p>
            <p className="mt-2 font-display text-2xl text-[#e0c15a]">{formatCurrency(13_000_000)}</p>
            <p className="mt-1 text-[11px] text-[#607468]">Cho 2 phiên đang tham gia</p>
          </div>
          <div className="rounded-xl border border-[#2a3f31] bg-[#14231a] p-5">
            <p className="text-xs text-[#7d9186]">Số dư khả dụng</p>
            <p className="mt-2 font-display text-2xl text-[#F3EFE6]">{formatCurrency(37_000_000)}</p>
            <p className="mt-1 text-[11px] text-[#607468]">Có thể dùng để đặt giá</p>
          </div>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Giao dịch gần đây</h2>
          <button className="text-xs text-[#C9A227]">Tải sao kê</button>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-[#2a3f31] bg-[#14231a]">
          {mockTransactions.map((transaction) => (
            <div key={transaction.id} className="flex flex-col gap-3 border-b border-[#2a3f31] p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg ${transaction.amount > 0 ? 'border-[#4e8b5e]/40 bg-[#2f6541]/15 text-[#8fc99c]' : 'border-[#C9A227]/30 bg-[#C9A227]/10 text-[#C9A227]'}`}>{transaction.amount > 0 ? '↓' : '↑'}</span>
                <div><p className="text-sm text-[#F3EFE6]">{transaction.title}</p><p className="mt-1 text-xs text-[#607468]">{typeLabel[transaction.type]} · {formatDateTime(transaction.date)}</p></div>
              </div>
              <p className={`font-mono-tag text-sm ${transaction.amount > 0 ? 'text-[#8fc99c]' : 'text-[#F3EFE6]'}`}>{transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
