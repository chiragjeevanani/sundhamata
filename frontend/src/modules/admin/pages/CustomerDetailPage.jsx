import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  PlusCircle,
} from 'lucide-react';
import { customerService } from '../../../services/customerService';
import { adminPurchaseService } from '../../../services/adminPurchaseService';
import { adminLoyaltyService } from '../../../services/adminLoyaltyService';
import { StatusBadge } from '../components/StatusBadge';
import { DetailsSkeleton } from '../components/SkeletonLoaders';
import { formatINR } from '../../../utils/formatters';
import { useToast } from '../context/ToastContext';
import { AreaLineChart } from '../components/charts/AreaLineChart';

export const CustomerDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [customer, setCustomer] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  // Manual Adjust Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustPoints, setAdjustPoints] = useState('200');
  const [adjustType, setAdjustType] = useState('add');
  const [adjustReason, setAdjustReason] = useState('Store promotion bonus');
  const [adjusting, setAdjusting] = useState(false);

  const fetchCustomerData = async () => {
    setLoading(true);
    try {
      const [c, pList] = await Promise.all([
        customerService.getCustomerById(id),
        adminPurchaseService.getPurchases({ customerId: id }),
      ]);
      setCustomer(c);
      setPurchases(pList);
    } catch (err) {
      showError('Error', err.message || 'Could not load customer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerData();
  }, [id]);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustPoints || Number(adjustPoints) <= 0) {
      showError('Validation', 'Enter a valid points amount.');
      return;
    }

    setAdjusting(true);
    try {
      const res = await adminLoyaltyService.adjustPoints(customer.id, {
        points: Number(adjustPoints),
        type: adjustType,
        reason: adjustReason.trim() || 'Manual adjustment',
      });
      showSuccess(
        'Points Adjusted',
        `${adjustType === 'add' ? 'Added' : 'Deducted'} ${adjustPoints} pts.`
      );
      setAdjustModalOpen(false);
      setCustomer((prev) => ({ ...prev, loyaltyPoints: res.newBalance }));
      fetchCustomerData();
    } catch (err) {
      showError('Failed', err.message || 'Unable to adjust points.');
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) {
    return <DetailsSkeleton />;
  }

  if (!customer) {
    return (
      <div className="py-12 text-center text-xs text-slate-400">
        Customer not found.
      </div>
    );
  }

  // Server-computed stats exclude cancelled purchases
  const totalSpent = customer.totalSpent ?? 0;
  const currentPoints = customer.loyaltyPoints ?? 0;

  const customerSpendTimeline = purchases
    .filter((p) => p.status !== 'Cancelled')
    .slice()
    .reverse()
    .map((p) => ({ label: p.formattedDate, value: p.amount }));

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div>
          <button
            onClick={() => navigate('/admin/customers')}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-1.5 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Customers</span>
          </button>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{customer.name}</h1>
            <span className="text-xs font-normal text-slate-500">({customer.phone || customer.mobile})</span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setAdjustModalOpen(true)}
            className="py-2 px-3 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 cursor-pointer transition-colors shadow-2xs"
          >
            Adjust Points
          </button>
          <button
            onClick={() => navigate(`/admin/purchases/new?customerId=${customer.id}`)}
            className="py-2 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Record Purchase</span>
          </button>
        </div>
      </div>

      {/* Unified Open Metrics Strip */}
      <div className="bg-white rounded-xl border border-slate-200/80 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 grid grid-cols-1 sm:grid-cols-3 shadow-2xs">
        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500">Lifetime Spend</span>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {formatINR(totalSpent)}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500">Invoices Billed</span>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {customer.totalPurchases ?? 0}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500">Loyalty Balance</span>
          <div className="text-2xl font-semibold text-amber-700 tabular-nums mt-1">
            {currentPoints.toLocaleString('en-IN')} pts
          </div>
        </div>
      </div>

      {/* Spend Trajectory Chart */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs">
        <AreaLineChart
          data={customerSpendTimeline}
          title="Customer Purchase Progression"
          subtitle="Spend trajectory over recent retail visits"
          height={200}
          accentColor="#D77F3F"
          timeframes={[]}
        />
      </div>

      {/* Linked Invoices (Clean Enterprise Data Sheet) */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Purchases & Invoices</h3>
            <p className="text-xs text-slate-500 mt-0.5">Historical store transactions for this customer</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-5">Invoice #</th>
                <th className="py-2.5 px-4">Product</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-5 font-mono text-xs font-medium text-brand-700">{p.invoiceNumber}</td>
                  <td className="py-3 px-4 font-normal text-slate-800">{p.product?.name}</td>
                  <td className="py-3 px-4 font-medium text-slate-900 tabular-nums">{formatINR(p.amount)}</td>
                  <td className="py-3 px-4 text-slate-500 font-normal">{p.formattedDate}</td>
                  <td className="py-3 px-5 text-right">
                    <button
                      onClick={() => navigate(`/admin/purchases/${p.id}`)}
                      className="py-1 px-2.5 rounded-md text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Modal */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Adjust Points for {customer.name}</h3>

            <form onSubmit={handleAdjustSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType('add')}
                  className={`py-1.5 px-3 rounded-lg font-medium border ${
                    adjustType === 'add' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  + Add
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('deduct')}
                  className={`py-1.5 px-3 rounded-lg font-medium border ${
                    adjustType === 'deduct' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  - Deduct
                </button>
              </div>

              <input
                type="number"
                value={adjustPoints}
                onChange={(e) => setAdjustPoints(e.target.value)}
                placeholder="Points"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 tabular-nums shadow-2xs"
              />

              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Reason"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal shadow-2xs"
              />

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="py-1.5 px-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjusting}
                  className="py-1.5 px-4 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 cursor-pointer"
                >
                  {adjusting ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

