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
  Paperclip,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { customerService } from '../../../services/customerService';
import { adminPurchaseService } from '../../../services/adminPurchaseService';
import { adminSettingsService } from '../../../services/adminSettingsService';
import { useToast } from '../context/ToastContext';
import { formatINR, formatDate } from '../../../utils/formatters';
import {
  addMonthsToDate,
  MAX_WARRANTY_MONTHS,
  toDateInputValue,
  warrantyToMonths,
} from '../../../utils/purchaseDates';
import {
  BILL_ACCEPT,
  BILL_HINT,
  formatFileSize,
  IMAGE_ACCEPT,
  validateBillFile,
  validateImageFile,
} from '../../../utils/billFile';

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
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [color, setColor] = useState('');
  // Optional product photo, uploaded right after the purchase is saved
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState('');

  const chooseImage = (file) => {
    if (!file) return;
    const problem = validateImageFile(file);
    setImageError(problem || '');
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(problem ? null : file);
    setImagePreview(problem ? null : URL.createObjectURL(file));
  };
  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setImageError('');
  };

  // Purchase & Payment Info
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => toDateInputValue());
  const [warrantyDuration, setWarrantyDuration] = useState('1');
  const [warrantyUnit, setWarrantyUnit] = useState('years');
  const [paymentMethod, setPaymentMethod] = useState('UPI');

  // Pricing
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [discount, setDiscount] = useState('');

  // Loyalty Settings
  const [loyaltyRate, setLoyaltyRate] = useState(1);
  const [rupeeValuePerPoint, setRupeeValuePerPoint] = useState(1);
  const [minRedeemPoints, setMinRedeemPoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [successRecord, setSuccessRecord] = useState(null);

  // Optional bill (PDF / image / Word / Excel) uploaded right after the purchase is saved
  const [billFile, setBillFile] = useState(null);
  const [billError, setBillError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const chooseBillFile = (file) => {
    if (!file) return;
    const problem = validateBillFile(file);
    setBillError(problem || '');
    setBillFile(problem ? null : file);
  };

  useEffect(() => {
    if (preselectedCustomerId) {
      customerService.getCustomerById(preselectedCustomerId).then((c) => {
        if (c) {
          setSelectedCustomer(c);
          setRedeemPoints('');
        }
      }).catch(() => {});
    }
  }, [preselectedCustomerId]);

  useEffect(() => {
    adminSettingsService.getSettings().then((s) => {
      if (s.loyalty?.pointsPerHundred) {
        setLoyaltyRate(s.loyalty.pointsPerHundred);
      }
      setRupeeValuePerPoint(s.loyalty?.rupeeValuePerPoint ?? 1);
      setMinRedeemPoints(s.loyalty?.minRedeemPoints ?? 0);
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

  const today = toDateInputValue();
  const warrantyMonths = warrantyToMonths(warrantyDuration, warrantyUnit);
  const warrantyValid = warrantyMonths !== null && warrantyMonths <= MAX_WARRANTY_MONTHS;
  const warrantyUntil =
    warrantyValid && warrantyMonths > 0 && purchaseDate
      ? formatDate(addMonthsToDate(new Date(`${purchaseDate}T12:00:00`), warrantyMonths))
      : null;

  const numericAmount = Number(purchaseAmount) || 0;
  const numericDiscount = Number(discount) || 0;
  const amountAfterDiscount = Math.max(0, numericAmount - numericDiscount);

  // Loyalty redemption preview (the server re-checks balance, minimum and bill limit)
  const availablePoints = selectedCustomer?.loyaltyPoints ?? 0;
  const pointsToRedeem = Number(redeemPoints) || 0;
  const redemptionValue = Math.round(pointsToRedeem * rupeeValuePerPoint * 100) / 100;
  const maxRedeemablePoints =
    rupeeValuePerPoint > 0 ? Math.min(availablePoints, Math.floor(amountAfterDiscount / rupeeValuePerPoint)) : 0;
  const canRedeem = rupeeValuePerPoint > 0 && availablePoints >= Math.max(minRedeemPoints, 1);
  const redemptionError = (() => {
    if (!redeemPoints) return '';
    if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < 0) return 'Enter whole points.';
    if (pointsToRedeem === 0) return '';
    if (pointsToRedeem > availablePoints) return `Customer has only ${availablePoints.toLocaleString('en-IN')} points.`;
    if (minRedeemPoints > 0 && pointsToRedeem < minRedeemPoints) return `Redeem at least ${minRedeemPoints.toLocaleString('en-IN')} points.`;
    if (redemptionValue > amountAfterDiscount) return `Worth ${formatINR(redemptionValue)}, more than the ${formatINR(amountAfterDiscount)} bill.`;
    return '';
  })();
  const finalAmount = Math.max(0, amountAfterDiscount - (redemptionError ? 0 : redemptionValue));
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
    if (!invoiceNumber.trim()) {
      errors.invoiceNumber = 'Enter the invoice / bill number.';
    }
    if (!purchaseDate) {
      errors.purchaseDate = 'Select the purchase date.';
    } else if (purchaseDate > today) {
      errors.purchaseDate = 'Purchase date cannot be in the future.';
    }
    if (redemptionError) {
      errors.redeemPoints = redemptionError;
    }
    if (!warrantyValid) {
      errors.warranty = `Enter whole ${warrantyUnit} from 0 to ${warrantyUnit === 'years' ? MAX_WARRANTY_MONTHS / 12 : MAX_WARRANTY_MONTHS}.`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      // Loyalty points and the warranty expiry date are calculated by the server.
      const recorded = await adminPurchaseService.createPurchase({
        customerId: selectedCustomer.id,
        invoiceNumber,
        product: {
          name: productName.trim(),
          category,
          brand,
          model,
          variant,
          color,
          imei: imei.trim(),
        },
        purchaseDate,
        warranty: { duration: warrantyDuration, unit: warrantyUnit },
        paymentMethod,
        paymentStatus: 'Paid',
        pricing: {
          purchaseAmount: numericAmount,
          discount: numericDiscount,
        },
        pointsToRedeem,
      });

      // The purchase is saved. Upload the bill separately: if that fails, the purchase must
      // still count as recorded and the bill can be attached later from the invoice page.
      // Same for the product photo: the purchase stays recorded even if the upload fails.
      let imageStatus = null;
      if (imageFile) {
        try {
          const withImage = await adminPurchaseService.uploadProductImage(recorded.id, imageFile);
          recorded.product = withImage.product;
          imageStatus = { ok: true };
        } catch (uploadErr) {
          imageStatus = { ok: false };
          showError('Photo not uploaded', `The purchase was recorded, but the product photo could not be uploaded: ${uploadErr.message} You can add it from the invoice page.`);
        }
      }

      let billStatus = null;
      if (billFile) {
        try {
          const withBill = await adminPurchaseService.uploadBill(recorded.id, billFile);
          recorded.bill = withBill.bill;
          billStatus = { ok: true };
        } catch (uploadErr) {
          billStatus = { ok: false, message: uploadErr.message };
          showError(
            'Bill not uploaded',
            `The purchase was recorded, but the bill could not be uploaded: ${uploadErr.message} You can attach it from the invoice page.`
          );
        }
      }

      setSuccessRecord({ ...recorded, billStatus, imageStatus });
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
    setBrand('');
    setModel('');
    setVariant('');
    setColor('');
    clearImage();
    setPurchaseAmount('');
    setDiscount('');
    setBillFile(null);
    setBillError('');
    setInvoiceNumber('');
    setPurchaseDate(toDateInputValue());
    setWarrantyDuration('1');
    setWarrantyUnit('years');
    setRedeemPoints('');
    setFormErrors({});
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
          <div className="flex justify-between text-slate-500">
            <span>Warranty</span>
            <span className="font-medium text-slate-900 text-right">
              {successRecord.warranty
                ? `${successRecord.warranty.type} · until ${successRecord.warranty.validUntil}`
                : 'No warranty'}
            </span>
          </div>
          {successRecord.loyalty?.pointsRedeemed > 0 && (
            <div className="flex justify-between text-amber-800 font-medium pt-2 border-t border-slate-100">
              <span>Points Redeemed</span>
              <span className="tabular-nums">
                −{successRecord.loyalty.pointsRedeemed.toLocaleString('en-IN')} pts ({formatINR(successRecord.pricing.loyaltyDiscount)} off)
              </span>
            </div>
          )}
          <div className="flex justify-between text-emerald-700 font-medium pt-2 border-t border-slate-100">
            <span>Points Credited</span>
            <span className="tabular-nums">+{successRecord.loyalty?.pointsEarned || 0} pts</span>
          </div>
          {successRecord.customerLoyaltyBalance !== undefined && (
            <div className="flex justify-between text-slate-500">
              <span>New Points Balance</span>
              <span className="font-medium text-slate-900 tabular-nums">
                {successRecord.customerLoyaltyBalance.toLocaleString('en-IN')} pts
              </span>
            </div>
          )}
          {successRecord.imageStatus && !successRecord.imageStatus.ok && (
            <div className="flex justify-between gap-3 pt-2 border-t border-slate-100 text-rose-700">
              <span>Product photo</span>
              <span className="font-medium text-right">Not uploaded — add it from the invoice page</span>
            </div>
          )}
          {successRecord.billStatus && (
            <div
              className={`flex justify-between gap-3 pt-2 border-t border-slate-100 ${
                successRecord.billStatus.ok ? 'text-slate-500' : 'text-rose-700'
              }`}
            >
              <span>Bill</span>
              <span className="font-medium text-right">
                {successRecord.billStatus.ok
                  ? successRecord.bill?.filename
                  : 'Not uploaded — attach it from the invoice page'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => navigate(`/admin/purchases/${successRecord.id}`)}
            className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium cursor-pointer transition-colors"
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
                  className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline cursor-pointer"
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
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-normal text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:border-brand-600 transition-all shadow-2xs"
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
                          setRedeemPoints('');
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs cursor-pointer"
                >
                  <option value="phones">Smartphones</option>
                  <option value="accessories">Accessories</option>
                  <option value="service">Service & Repairs</option>
                </select>
              </div>


              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Brand</label>
                <input
                  type="text"
                  value={brand}
                  maxLength={80}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Samsung (auto-detected if empty)"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Model</label>
                <input
                  type="text"
                  value={model}
                  maxLength={80}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. SM-S938B / Galaxy S25 Ultra"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Variant</label>
                <input
                  type="text"
                  value={variant}
                  maxLength={80}
                  onChange={(e) => setVariant(e.target.value)}
                  placeholder="e.g. 12GB + 256GB"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Colour</label>
                <input
                  type="text"
                  value={color}
                  maxLength={80}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="e.g. Titanium Black"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-medium text-slate-700 block">IMEI / Serial Number</label>
                <input
                  type="text"
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  placeholder="15-digit IMEI or serial number for warranty registration"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs text-slate-900 focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
                />
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Product Photo</label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Product preview" className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="py-1.5 px-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer">
                        {imageFile ? 'Change photo' : 'Choose photo'}
                        <input
                          type="file"
                          accept={IMAGE_ACCEPT}
                          aria-label="Product photo"
                          className="sr-only"
                          onChange={(e) => {
                            chooseImage(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {imageFile && (
                        <button type="button" onClick={clearImage} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      {imageFile ? `${imageFile.name} • ${formatFileSize(imageFile.size)}` : 'Optional. Shown to the customer in their app. JPG, PNG, WebP or GIF, up to 5 MB.'}
                    </p>
                    {imageError && <p className="text-[11px] text-rose-600">{imageError}</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Invoice, Purchase Date & Warranty */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">3. Invoice, Date & Warranty</h3>
              <p className="text-xs text-slate-400 font-normal">Use the same number as on the printed bill, in any format</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Invoice / Bill Number *</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  maxLength={50}
                  onChange={(e) => {
                    setInvoiceNumber(e.target.value);
                    if (formErrors.invoiceNumber) setFormErrors((prev) => ({ ...prev, invoiceNumber: '' }));
                  }}
                  placeholder="e.g. SM/2026-27/0042"
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs font-mono text-xs ${formErrors.invoiceNumber ? 'border-rose-400' : 'border-slate-300'}`}
                />
                {formErrors.invoiceNumber && <p className="text-[11px] text-rose-600">{formErrors.invoiceNumber}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Purchase Date *</label>
                <input
                  type="date"
                  value={purchaseDate}
                  max={today}
                  onChange={(e) => {
                    setPurchaseDate(e.target.value);
                    if (formErrors.purchaseDate) setFormErrors((prev) => ({ ...prev, purchaseDate: '' }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs ${formErrors.purchaseDate ? 'border-rose-400' : 'border-slate-300'}`}
                />
                {formErrors.purchaseDate && <p className="text-[11px] text-rose-600">{formErrors.purchaseDate}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Warranty</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={warrantyDuration}
                    aria-label="Warranty duration"
                    onChange={(e) => {
                      setWarrantyDuration(e.target.value);
                      if (formErrors.warranty) setFormErrors((prev) => ({ ...prev, warranty: '' }));
                    }}
                    className={`px-3 py-2 bg-white border rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs tabular-nums w-20 shrink-0 ${formErrors.warranty ? 'border-rose-400' : 'border-slate-300'}`}
                  />
                  <select
                    value={warrantyUnit}
                    aria-label="Warranty unit"
                    onChange={(e) => {
                      setWarrantyUnit(e.target.value);
                      if (formErrors.warranty) setFormErrors((prev) => ({ ...prev, warranty: '' }));
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs cursor-pointer"
                  >
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </div>
                {formErrors.warranty ? (
                  <p className="text-[11px] text-rose-600">{formErrors.warranty}</p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {warrantyUntil ? (
                      <>
                        Valid until <span className="font-medium text-slate-800">{warrantyUntil}</span>
                      </>
                    ) : warrantyValid && warrantyMonths === 0 ? (
                      'No warranty'
                    ) : null}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Pricing & Payment Terms */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">4. Pricing & Payment</h3>
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 tabular-nums focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 tabular-nums focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 block">Payment Mode</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-800 focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs cursor-pointer"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="EMI">EMI</option>
                </select>
              </div>
            </div>

            {/* Loyalty points redemption */}
            <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-3.5 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="redeem-points" className="font-medium text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Redeem Loyalty Points</span>
                </label>
                <span className="text-slate-500">
                  {selectedCustomer ? (
                    <>
                      Available: <span className="font-medium text-amber-800 tabular-nums">{availablePoints.toLocaleString('en-IN')} pts</span>
                      {' '}· 1 pt = {formatINR(rupeeValuePerPoint)}
                      {minRedeemPoints > 0 && <> · min {minRedeemPoints.toLocaleString('en-IN')} pts</>}
                    </>
                  ) : (
                    'Select a customer first'
                  )}
                </span>
              </div>

              {selectedCustomer && !canRedeem ? (
                <p className="text-slate-500">
                  {rupeeValuePerPoint > 0
                    ? `Not enough points to redeem yet (minimum ${Math.max(minRedeemPoints, 1).toLocaleString('en-IN')}).`
                    : 'Point redemption is switched off in Settings.'}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="redeem-points"
                    type="number"
                    min="0"
                    step="1"
                    value={redeemPoints}
                    disabled={!selectedCustomer}
                    onChange={(e) => {
                      setRedeemPoints(e.target.value);
                      if (formErrors.redeemPoints) setFormErrors((prev) => ({ ...prev, redeemPoints: '' }));
                    }}
                    placeholder="0"
                    className={`w-36 px-3 py-2 bg-white border rounded-lg font-medium text-slate-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs disabled:bg-slate-100 ${
                      redemptionError ? 'border-rose-400' : 'border-slate-300'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={!selectedCustomer || maxRedeemablePoints < Math.max(minRedeemPoints, 1)}
                    onClick={() => setRedeemPoints(String(maxRedeemablePoints))}
                    className="py-2 px-3 rounded-lg border border-amber-300 bg-white text-amber-800 font-medium hover:bg-amber-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Use max ({maxRedeemablePoints.toLocaleString('en-IN')})
                  </button>
                  {redeemPoints && (
                    <button
                      type="button"
                      onClick={() => setRedeemPoints('')}
                      className="py-2 px-2 text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                  {pointsToRedeem > 0 && !redemptionError && (
                    <span className="text-emerald-700 font-medium">− {formatINR(redemptionValue)} off the bill</span>
                  )}
                </div>
              )}
              {(redemptionError || formErrors.redeemPoints) && (
                <p className="text-[11px] text-rose-600">{redemptionError || formErrors.redeemPoints}</p>
              )}
            </div>
          </div>

          {/* Section 5: Bill / Invoice File (optional) */}
          <div className="p-5 sm:p-6 space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">5. Bill / Invoice File</h3>
              <p className="text-xs text-slate-400 font-normal">
                Optional. The customer can download it from their purchase. {BILL_HINT}.
              </p>
            </div>

            {billFile ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50/80 border border-slate-200/80 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900 block truncate">{billFile.name}</span>
                    <span className="text-slate-400">{formatFileSize(billFile.size)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBillFile(null)}
                  className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  chooseBillFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex flex-col items-center justify-center gap-1.5 py-6 px-4 rounded-lg border border-dashed text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <Paperclip className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-700">Click to choose a file, or drag it here</span>
                <span className="text-[11px] text-slate-400">{BILL_HINT}</span>
                <input
                  type="file"
                  accept={BILL_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    chooseBillFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {billError && <p className="text-[11px] text-rose-600">{billError}</p>}
          </div>
        </div>

        {/* Right (4 Cols): Sleek Order Summary Panel */}
        <div className="lg:col-span-4 bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs space-y-4 sticky top-20">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
            <span className="font-medium text-slate-500">Invoice Number</span>
            <span className="font-mono text-xs font-medium text-brand-700 truncate max-w-[170px]">{invoiceNumber.trim() || '—'}</span>
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
            <div className="flex justify-between text-slate-500">
              <span>Purchase Date</span>
              <span className="font-medium text-slate-800">{purchaseDate ? formatDate(`${purchaseDate}T12:00:00`) : '—'}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Warranty Until</span>
              <span className="font-medium text-slate-800">{warrantyUntil || (warrantyValid ? 'No warranty' : '—')}</span>
            </div>

            {(numericDiscount > 0 || (pointsToRedeem > 0 && !redemptionError)) && (
              <div className="pt-3 border-t border-slate-100 space-y-1.5">
                <div className="flex justify-between text-slate-500">
                  <span>Price</span>
                  <span className="tabular-nums text-slate-800">{formatINR(numericAmount)}</span>
                </div>
                {numericDiscount > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Discount</span>
                    <span className="tabular-nums text-slate-800">− {formatINR(numericDiscount)}</span>
                  </div>
                )}
                {pointsToRedeem > 0 && !redemptionError && (
                  <div className="flex justify-between text-amber-800">
                    <span>Points redeemed ({pointsToRedeem.toLocaleString('en-IN')})</span>
                    <span className="tabular-nums">− {formatINR(redemptionValue)}</span>
                  </div>
                )}
              </div>
            )}

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
            className="w-full py-2.5 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs transition-all shadow-2xs active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            {submitting ? (billFile ? 'Saving & uploading bill...' : 'Generating Invoice...') : 'Record Purchase'}
          </button>
        </div>
      </form>
    </div>
  );
};

