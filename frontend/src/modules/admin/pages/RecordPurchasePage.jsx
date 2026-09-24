import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Check,
  PlusCircle,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { customerService } from '../../../services/customerService';
import { adminPurchaseService } from '../../../services/adminPurchaseService';
import { adminSettingsService } from '../../../services/adminSettingsService';
import { useToast } from '../context/ToastContext';
import { formatINR } from '../../../utils/formatters';

export const RecordPurchasePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showSuccess, showError } = useToast();

  const preselectedCustomerId = searchParams.get('customerId');

  // Customer search & selection
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Product Info
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('phones');
  const [imei, setImei] = useState('');

  // Purchase & Payment Info
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState('UPI');

  // Pricing
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [discount, setDiscount] = useState('');

  // Loyalty Settings
  const [loyaltyRate, setLoyaltyRate] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [successRecord, setSuccessRecord] = useState(null);

  useEffect(() => {
    if (preselectedCustomerId) {
      customerService.getCustomerById(preselectedCustomerId).then((c) => {
        if (c) setSelectedCustomer(c);
      }).catch(() => {});
    }
  }, [preselectedCustomerId]);

  useEffect(() => {
    adminSettingsService.getSettings().then((s) => {
      if (s.loyalty?.pointsPerHundred) {
        setLoyaltyRate(s.loyalty.pointsPerHundred);
      }
    }).catch(() => {});
  }, []);

  // Live customer search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await customerService.searchCustomers(searchQuery);
        setSearchResults(results);
      } catch (e) {}
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const numericAmount = Number(purchaseAmount) || 0;
  const numericDiscount = Number(discount) || 0;
  const finalAmount = Math.max(0, numericAmount - numericDiscount);
  // Preview only — the server calculates the points actually credited.
  const estimatedPoints = adminSettingsService.calculatePoints(finalAmount, {
    loyalty: { pointsPerHundred: loyaltyRate },
  });

  const presets = [
    { name: 'Samsung Galaxy S24 Ultra', category: 'phones', price: 124999 },
    { name: 'Apple iPhone 15 Pro', category: 'phones', price: 119999 },
    { name: 'OnePlus 12 5G', category: 'phones', price: 64999 },
    { name: 'Galaxy Buds3 Pro', category: 'accessories', price: 19999 },
  ];

  const handleApplyPreset = (p) => {
    setProductName(p.name);
    setCategory(p.category);
    setPurchaseAmount(p.price.toString());
    setDiscount('');
    setFormErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!selectedCustomer) {
      errors.customer = 'Please select a customer.';
    }
    if (!productName.trim()) {
      errors.productName = 'Product name is required.';
    }
    if (!numericAmount || numericAmount <= 0) {
      errors.purchaseAmount = 'Enter a valid amount.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      // Invoice number and loyalty points are assigned by the server.
      const recorded = await adminPurchaseService.createPurchase({
        customerId: selectedCustomer.id,
        product: {
          name: productName.trim(),
          category,
          imei: imei.trim(),
        },
        purchaseDate,
        paymentMethod,
        paymentStatus: 'Paid',
        pricing: {
          purchaseAmount: numericAmount,
          discount: numericDiscount,
        },
      });

      setSuccessRecord(recorded);
      showSuccess('Purchase Recorded', `Invoice ${recorded.invoiceNumber} created.`);
    } catch (err) {
      showError('Error', err.message || 'Unable to record purchase.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSuccessRecord(null);
    setSelectedCustomer(null);
    setSearchQuery('');
    setProductName('');
    setImei('');
    setPurchaseAmount('');
    setDiscount('');
  };

  // SUCCESS STATE
  if (successRecord) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-900">Purchase Recorded</h2>
          <p className="text-xs text-slate-500 mt-1">
            Invoice <span className="font-mono font-medium text-slate-800">{successRecord.invoiceNumber}</span> created for {successRecord.customerName}.
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200/80 text-left text-xs space-y-2.5 shadow-2xs">
          <div className="flex justify-between text-slate-500">
            <span>Product</span>
            <span className="font-medium text-slate-900">{successRecord.product?.name}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Amount Paid</span>
            <span className="font-medium text-slate-900 tabular-nums">{formatINR(successRecord.amount)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-medium pt-2 border-t border-slate-100">
            <span>Points Credited</span>
            <span className="tabular-nums">+{successRecord.loyalty?.pointsEarned || 0} pts</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => navigate(`/admin/purchases/${successRecord.id}`)}
            className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer transition-colors"
          >
            View Invoice
          </button>
          <button
            onClick={handleReset}
            className="py-2 px-4 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 cursor-pointer transition-colors"
          >
            Record Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">Record Purchase</h1>
          <p className="text-xs text-slate-500 mt-0.5">Bill a retail counter sale, register device identifiers, and credit loyalty points.</p>
        </div>

        <button
          onClick={() => navigate('/admin/purchases')}
          className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Purchases</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left (8 Cols): Unified Billing Sheet */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
          {/* Section 1: Customer Selection */}
          <div className="p-5 sm:p-6 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">1. Customer Details</h3>
                <p className="text-xs text-slate-400 font-normal">Select customer to associate with sale</p>
              </div>
              {!selectedCustomer && (
                <button
                  type="button"
                  onClick={() => navigate('/admin/customers/new')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                >
                  + Add New Customer
                </button>
              )}
            </div>

            {!selectedCustomer ? (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search customer by name or 10-digit mobile number..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-normal text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:border-blue-600 transition-all shadow-2xs"
                  autoFocus
                />

                {formErrors.customer && (
                  <p className="text-[11px] text-rose-600 mt-1">{formErrors.customer}</p>
                )}

                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {searchResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setSearchResults([]);
                          setSearchQuery('');
                          setFormErrors((prev) => ({ ...prev, customer: '' }));
                        }}
                        className="p-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <span className="font-medium text-slate-900">{c.name}</span>
                          <span className="text-slate-400 ml-2 font-normal">{c.phone || c.mobile}</span>
                        </div>
                        <span className="text-xs font-medium text-amber-700 tabular-nums">{c.loyaltyPoints || 0} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 text-xs">
                <div>
                  <span className="font-medium text-slate-900 text-sm block">{selectedCustomer.name}</span>
                  <span className="text-slate-500 font-normal">{selectedCustomer.phone || selectedCustomer.mobile}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md tabular-nums">
                    {selectedCustomer.loyaltyPoints || 0} pts available
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                    title="Change customer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Product & Hardware Details */}
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">2. Product & Hardware</h3>
                <p className="text-xs text-slate-400 font-normal">Specify item name, category, and serial details</p>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                <span className="text-slate-400 hidden sm:inline text-[11px]">Popular:</span>
                {presets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] cursor-pointer whitespace-nowrap transition-colors"
                  >
                    {p.name.split(' ')[0]} {p.name.split(' ')[1] || ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Product Name *</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => {
                    setProductName(e.target.value);
                    if (formErrors.productName) setFormErrors((prev) => ({ ...prev, productName: '' }));
                  }}
                  placeholder="e.g. Samsung Galaxy S24 Ultra 256GB"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-blue-600 transition-all shadow-2xs"
                />
                {formErrors.productName && (
                  <p className="text-[11px] text-rose-600">{formErrors.productName}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-normal focus:outline-hidden focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
                >
                  <option value="phones">Smartphones</option>
                  <option value="accessories">Accessories</option>
                  <option value="service">Service & Repairs</option>
                </select>
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-medium text-slate-700 block">IMEI / Serial Number (Optional)</label>
                <input
                  type="text"
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  placeholder="15-digit IMEI or serial number for warranty registration"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-900 focus:outline-hidden focus:border-blue-600 transition-all shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Pricing & Payment Terms */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">3. Pricing & Payment</h3>
              <p className="text-xs text-slate-400 font-normal">Enter retail price, discount, and settlement mode</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Price (₹) *</label>
                <input
                  type="number"
                  value={purchaseAmount}
                  onChange={(e) => {
                    setPurchaseAmount(e.target.value);
                    if (formErrors.purchaseAmount) setFormErrors((prev) => ({ ...prev, purchaseAmount: '' }));
                  }}
                  placeholder="e.g. 124999"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 tabular-nums focus:outline-hidden focus:border-blue-600 transition-all shadow-2xs"
                />
                {formErrors.purchaseAmount && (
                  <p className="text-[11px] text-rose-600">{formErrors.purchaseAmount}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Discount (₹)</label>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 tabular-nums focus:outline-hidden focus:border-blue-600 transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Payment Mode</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-800 focus:outline-hidden focus:border-blue-600 transition-all shadow-2xs cursor-pointer"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="EMI">EMI</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right (4 Cols): Sleek Order Summary Panel */}
        <div className="lg:col-span-4 bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs space-y-4 sticky top-20">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
            <span className="font-medium text-slate-500">Invoice Reference</span>
            <span className="font-mono text-xs font-medium text-blue-700">Auto-assigned</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Customer</span>
              <span className="font-medium text-slate-900 truncate max-w-[150px]">
                {selectedCustomer?.name || '—'}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Product</span>
              <span className="font-medium text-slate-900 truncate max-w-[150px]">
                {productName || '—'}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Payment Mode</span>
              <span className="font-medium text-slate-800">{paymentMethod}</span>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
              <span className="font-medium text-slate-600">Total Billed</span>
              <span className="text-xl font-semibold text-slate-900 tabular-nums">
                {formatINR(finalAmount)}
              </span>
            </div>

            {/* Loyalty Credit Notification */}
            <div className="pt-2 flex items-center justify-between text-xs text-amber-800 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/60 font-medium">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Points to Credit (est.)</span>
              </span>
              <span className="tabular-nums">+{estimatedPoints} pts</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-all shadow-2xs active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Generating Invoice...' : 'Record Purchase'}
          </button>
        </div>
      </form>
    </div>
  );
};

