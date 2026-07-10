export interface WalletTransaction {
  id: number;
  title: string;
  type: 'DEPOSIT' | 'HOLD' | 'RELEASE' | 'PAYMENT';
  amount: number;
  date: string;
  status: 'COMPLETED' | 'PENDING';
}
