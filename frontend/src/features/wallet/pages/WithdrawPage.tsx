import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { formatCurrency } from '../../../utils/formatCurrency';

export default function WithdrawPage() {
  const [amount, setAmount] = useState(''); const [message, setMessage] = useState('');
  const submit = (event: React.FormEvent) => { event.preventDefault(); const value = Number(amount); if (value <= 0) return setMessage('Vui lòng nhập số tiền hợp lệ.'); if (value > 37_000_000) return setMessage('Số tiền vượt quá số dư khả dụng.'); setMessage(`Đã tạo yêu cầu rút ${formatCurrency(value)} trong bản demo.`); };
  return <div className="mx-auto max-w-2xl px-6 py-10 sm:py-14"><Link to="/wallet" className="text-sm text-[#7d9186]">← Quay lại ví</Link><span className="mt-7 block font-mono-tag text-xs uppercase tracking-[0.2em] text-[#C9A227]">Rút tiền</span><h1 className="mt-2 font-display text-4xl">Rút về tài khoản ngân hàng</h1><p className="mt-2 text-sm text-[#7d9186]">Số dư khả dụng: {formatCurrency(37_000_000)}.</p><form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-[#2a3f31] bg-[#14231a] p-6 sm:p-8"><Input label="Số tiền" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1000000" required /><Input label="Số tài khoản" placeholder="0123456789" required /><label className="flex flex-col gap-1.5 text-xs font-mono-tag uppercase tracking-wider text-[#7d9186]">Ngân hàng<select className="rounded-md border border-[#2a3f31] bg-[#16241c] px-4 py-3 font-sans text-sm normal-case text-[#F3EFE6]"><option>Vietcombank</option><option>MB Bank</option><option>Techcombank</option></select></label><Button type="submit" className="w-full">Tạo yêu cầu rút</Button>{message && <p className={`text-center text-sm ${message.startsWith('Đã') ? 'text-[#8fc99c]' : 'text-[#ff9a86]'}`}>{message}</p>}</form></div>;
}
