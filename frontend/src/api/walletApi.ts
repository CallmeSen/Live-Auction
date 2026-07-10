import axiosClient from './axiosClient';

export const walletApi = {
  getMine: () => axiosClient.get('/wallets/me'),
  getTransactions: (page = 0, size = 10) => axiosClient.get('/wallets/me/transactions', { params: { page, size, sort: 'createdAt,DESC' } }),
  deposit: (amount: number) => axiosClient.post('/wallets/deposit', { amount }),
  withdraw: (amount: number, bankAccount: string, bankName: string) => axiosClient.post('/wallets/withdraw', { amount, bankAccount, bankName }),
};
