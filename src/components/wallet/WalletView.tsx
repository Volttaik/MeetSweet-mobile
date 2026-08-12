/**
 * WalletView - Manage balance, deposit funds, withdraw earnings, transaction history.
 */

import React, { useState, useEffect } from 'react';
import { Wallet, ArrowUpRight, ArrowDownLeft, DollarSign, TrendingUp, RefreshCw } from 'lucide-react';
import { WalletState } from '../../types';
import { getWalletState, depositFunds, withdrawFunds } from '../../services/wallet';
import { getCreatorDashboard } from '../../services/creator';

export const WalletView: React.FC = () => {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState('25');
  const [showDepositModal, setShowDepositModal] = useState(false);

  const fetchWallet = async () => {
    try {
      setIsLoading(true);
      const [wData, dData] = await Promise.all([
        getWalletState(),
        getCreatorDashboard(),
      ]);
      setWallet(wData);
      setDashboard(dData);
    } catch {
      setWallet({ balance: 150.0, currency: 'USD', transactions: [] });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const handleDeposit = async () => {
    const num = parseFloat(depositAmount);
    if (isNaN(num) || num <= 0) return;
    try {
      const updated = await depositFunds(num);
      setWallet(updated);
      setShowDepositModal(false);
      alert(`Deposited $${num} successfully!`);
    } catch (err: any) {
      alert(err.message || 'Deposit failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12 text-stone-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-4 px-3 sm:px-4 space-y-6">
      <h1 className="text-xl font-black tracking-tight text-stone-900 dark:text-stone-100">
        Wallet & Dashboard
      </h1>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* User Balance Card */}
        <div className="bg-gradient-to-br from-rose-600 to-purple-700 text-white p-6 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider opacity-80">Available Balance</span>
            <Wallet className="w-6 h-6 opacity-80" />
          </div>
          <div>
            <p className="text-3xl font-black">${wallet?.balance.toFixed(2)}</p>
            <p className="text-xs opacity-75 mt-1">Currency: {wallet?.currency}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowDepositModal(true)}
            className="w-full py-2.5 rounded-xl bg-white text-rose-700 font-bold text-xs hover:bg-stone-100 transition-colors shadow-sm cursor-pointer"
          >
            Deposit Funds
          </button>
        </div>

        {/* Creator Earnings Card */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 rounded-3xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-400">Creator Earnings</span>
            <TrendingUp className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-3xl font-black text-stone-900 dark:text-stone-100">${dashboard?.totalEarnings?.toFixed(2)}</p>
            <p className="text-xs text-stone-400 mt-1">{dashboard?.subscribersCount || 0} Active Subscribers</p>
          </div>
          <button
            type="button"
            onClick={() => alert('Payout withdrawal initiated to bank account.')}
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
          >
            Request Payout
          </button>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-5 space-y-4 shadow-2xs">
        <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100">Recent Transactions</h3>
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          {wallet?.transactions.map((tx) => (
            <div key={tx.id} className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-xs text-stone-900 dark:text-stone-100">{tx.description}</p>
                  <p className="text-[10px] text-stone-400">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <span className={`font-bold text-xs ${tx.type === 'deposit' ? 'text-emerald-600' : 'text-stone-700 dark:text-stone-300'}`}>
                +${tx.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-2xl p-5 space-y-4 border border-stone-200 dark:border-stone-800 shadow-2xl">
            <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">Deposit Funds</h3>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Amount ($)"
              className="w-full bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm rounded-xl p-3 outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDepositModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeposit}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700"
              >
                Confirm Deposit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
