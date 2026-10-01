import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  UserPlus,
  Users,
  TicketPercent,
  ScanLine,
  Loader2,
} from 'lucide-react';
import { customerService } from '../../../services/customerService';
import { adminCouponService } from '../../../services/adminCouponService';
import { couponDiscountFor, describeDiscount, describeMinimum, eligibleAmountFor } from '../../../utils/coupons';
import { QrScannerModal } from '../components/QrScannerModal';
import { PurchaseItemEditor } from '../components/PurchaseItemEditor';
import { CustomerAvatar, VerifiedTick } from '../../../components/CustomerAvatar';
import { fillFromCatalog, itemImeiError, itemWarrantyMonths, itemWarrantyValid, newPurchaseItem } from '../../../utils/purchaseItems';
import { FINANCE_COMPANIES, PURCHASE_BY, addMonthsToDate as addMonths, describeEmi } from '../../../utils/finance';
import { adminProductService } from '../../../services/adminProductService';
import { adminPurchaseService } from '../../../services/adminPurchaseService';
import { adminSettingsService } from '../../../services/adminSettingsService';
import { useToast } from '../context/ToastContext';
import { formatINR, formatDate } from '../../../utils/formatters';
import { MAX_WARRANTY_MONTHS, toDateInputValue } from '../../../utils/purchaseDates';
import { BILL_ACCEPT, BILL_HINT, formatFileSize, validateBillFile } from '../../../utils/billFile';

// Indian mobile: last 10 digits of whatever was typed ("+91 98290-55443" → "9829055443")
const toTenDigits = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};
const isValidMobile = (digits) => /^[6-9]\d{9}$/.test(digits);

export const RecordPurchasePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showSuccess, showError } = useToast();

  const preselectedCustomerId = searchParams.get('customerId');

  // Customer search & selection
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  // "New customer": just the mobile number (name optional). The purchase is saved under that
  // number and shows up in the app when they sign up with it, so no registration step is needed.
  const [customerMode, setCustomerMode] = useState('existing'); // 'existing' | 'new'
  const [newMobile, setNewMobile] = useState('');
  const [newName, setNewName] = useState('');
  const newMobileDigits = toTenDigits(newMobile);

  // Customer coupon (welcome offer): typed, scanned with a USB scanner, or with the camera
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { coupon, customer }
  const [couponError, setCouponError] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Products on this bill (one or more), each with its own details, price, warranty and photo
  const [items, setItems] = useState(() => [newPurchaseItem()]);
  const updateItem = (key, patch) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setFormErrors((prev) => {
      const next = { ...prev };
      Object.keys(patch).forEach((field) => delete next[`items.${key}.${field === 'warrantyDuration' || field === 'warrantyUnit' ? 'warranty' : field}`]);
      return next;
    });
  };
  const addItem = (patch = {}) => setItems((prev) => [...prev, { ...newPurchaseItem(), ...patch }]);
  const removeItem = (key) =>
    setItems((prev) => {
      const gone = prev.find((item) => item.key === key);
      if (gone?.imagePreview) URL.revokeObjectURL(gone.imagePreview);
      return prev.filter((item) => item.key !== key);
    });

  // Most-sold products from the catalog, one tap to add
  const [popularProducts, setPopularProducts] = useState([]);
  useEffect(() => {
    adminProductService
      .list({ limit: 6 })
      .then((data) => setPopularProducts(data.items))
      .catch(() => {});
  }, []);
  const addPopular = (product) => {
    const last = items[items.length - 1];
    if (last && !last.name.trim() && !last.price) updateItem(last.key, fillFromCatalog(last, product));
    else addItem(fillFromCatalog(newPurchaseItem(), product));
  };

  // Purchase & Payment Info
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => toDateInputValue());
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  // Bought on finance (EMI): lender, down payment, EMI amount, months, EMI date
  const emptyFinance = { company: '', downPayment: '', emiAmount: '', tenureMonths: '12', firstEmiDate: '', loanNumber: '' };
  const [finance, setFinance] = useState(emptyFinance);
  const setFinanceField = (field) => (e) => {
    setFinance((prev) => ({ ...prev, [field]: e.target.value }));
    if (formErrors[`finance.${field}`]) setFormErrors((prev) => ({ ...prev, [`finance.${field}`]: '' }));
  };

  // Pricing
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
  // Bill subtotal = all products; discount, coupon and points apply to the whole bill
  const numericAmount = Math.round(items.reduce((sum, item) => sum + (Number(item.price) || 0), 0) * 100) / 100;
  const numericDiscount = Number(discount) || 0;
  const amountAfterDiscount = Math.max(0, numericAmount - numericDiscount);

  // Coupon preview (the server re-checks owner, expiry, minimum bill and single use)
  const couponOwnerMismatch =
    appliedCoupon && (customerMode === 'new' || (selectedCustomer && selectedCustomer.id !== appliedCoupon.customer.id));
  // Some vouchers only count certain products (e.g. accessories); the store discount is shared out first
  const couponBase = appliedCoupon
    ? eligibleAmountFor(appliedCoupon.coupon, items) * (numericAmount > 0 ? amountAfterDiscount / numericAmount : 0)
    : 0;
  const couponBelowMinimum =
    appliedCoupon && (couponBase <= 0 || couponBase < (appliedCoupon.coupon.minBillAmount || 0));
  const couponDiscount =
    appliedCoupon && !couponOwnerMismatch && !couponBelowMinimum ? couponDiscountFor(appliedCoupon.coupon, couponBase) : 0;
  const amountAfterCoupon = Math.max(0, amountAfterDiscount - couponDiscount);

  // Loyalty redemption preview (the server re-checks balance, minimum and bill limit)
  const availablePoints = selectedCustomer?.loyaltyPoints ?? 0;
  const pointsToRedeem = Number(redeemPoints) || 0;
  const redemptionValue = Math.round(pointsToRedeem * rupeeValuePerPoint * 100) / 100;
  const maxRedeemablePoints =
    rupeeValuePerPoint > 0 ? Math.min(availablePoints, Math.floor(amountAfterCoupon / rupeeValuePerPoint)) : 0;
  const canRedeem = rupeeValuePerPoint > 0 && availablePoints >= Math.max(minRedeemPoints, 1);
  const redemptionError = (() => {
    if (!redeemPoints) return '';
    if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < 0) return 'Enter whole points.';
    if (pointsToRedeem === 0) return '';
    if (pointsToRedeem > availablePoints) return `Customer has only ${availablePoints.toLocaleString('en-IN')} points.`;
    if (minRedeemPoints > 0 && pointsToRedeem < minRedeemPoints) return `Redeem at least ${minRedeemPoints.toLocaleString('en-IN')} points.`;
    if (redemptionValue > amountAfterCoupon) return `Worth ${formatINR(redemptionValue)}, more than the ${formatINR(amountAfterCoupon)} bill.`;
    return '';
  })();
  const finalAmount = Math.max(0, amountAfterCoupon - (redemptionError ? 0 : redemptionValue));

  const applyCouponRef = useRef(null);
  const applyCoupon = async (rawCode) => {
    const code = (rawCode ?? couponInput).trim();
    if (!code) return;
    setCouponChecking(true);
    setCouponError('');
    try {
      // A voucher code like WELCOME6D is for the selected customer (registered mobile);
      // a scanned QR identifies the customer by itself
      const found = await adminCouponService.lookup(code, customerMode === 'existing' ? selectedCustomer?.id : undefined);
      if (!found.usable) {
        setCouponError(found.reason || 'This coupon cannot be used.');
        return;
      }
      if (!found.customer.isActive) {
        setCouponError('This coupon belongs to a deactivated customer.');
        return;
      }
      // Scanning the coupon also picks the customer when none is chosen yet
      if (customerMode === 'new' || !selectedCustomer) {
        setCustomerMode('existing');
        setSelectedCustomer(found.customer);
        setRedeemPoints('');
        setFormErrors((prev) => ({ ...prev, customer: '', newMobile: '', newName: '' }));
      } else if (selectedCustomer.id !== found.customer.id) {
        setCouponError(`This coupon belongs to ${found.customer.name} (${found.customer.phone}), not the selected customer.`);
        return;
      }
      setAppliedCoupon(found);
      setCouponInput(found.coupon.campaignCode || found.coupon.code);
      // Free-item voucher (e.g. WELCOME6D): put the free item on the bill if it is not there yet
      const free = found.coupon.discount;
      if (free.type === 'free_item' && free.itemName) {
        const wanted = free.itemName.trim().toLowerCase();
        const present = items.some((item) => item.name.trim().toLowerCase() === wanted);
        if (!present) {
          const freeLine = {
            category: 'accessories',
            name: free.itemName,
            price: String(free.value),
            warrantyDuration: '0',
            warrantyUnit: 'months',
          };
          const blank = items.find((item) => !item.name.trim() && !item.price);
          if (blank) updateItem(blank.key, freeLine);
          else addItem(freeLine);
        }
      }
      setFormErrors((prev) => ({ ...prev, coupon: '' }));
    } catch (err) {
      setCouponError(err.message || 'Could not check this coupon.');
    } finally {
      setCouponChecking(false);
    }
  };

  useEffect(() => {
    applyCouponRef.current = applyCoupon;
  });

  const closeScanner = useCallback(() => setScannerOpen(false), []);
  const handleScanned = useCallback((text) => {
    setScannerOpen(false);
    setCouponInput(text.toUpperCase());
    applyCouponRef.current?.(text);
  }, []);

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  };

  // Preview only — the server calculates the points actually credited.
  const estimatedPoints = adminSettingsService.calculatePoints(finalAmount, {
    loyalty: { pointsPerHundred: loyaltyRate },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (customerMode === 'existing' && !selectedCustomer) {
      errors.customer = 'Please select a customer, or choose New customer.';
    }
    if (customerMode === 'new') {
      if (!isValidMobile(newMobileDigits)) errors.newMobile = 'Enter a valid 10-digit mobile number.';
      if (newName.trim() && !/^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,79}$/u.test(newName.trim())) {
        errors.newName = 'Use letters only (at least 2), or leave it empty.';
      }
    }
    items.forEach((item) => {
      if (item.name.trim().length < 2) errors[`items.${item.key}.name`] = 'Product name is required.';
      if (!(Number(item.price) > 0)) errors[`items.${item.key}.price`] = 'Enter a valid price.';
      const imeiProblem = itemImeiError(item);
      if (imeiProblem) errors[`items.${item.key}.imei`] = imeiProblem;
      if (!itemWarrantyValid(item)) {
        errors[`items.${item.key}.warranty`] = `Whole ${item.warrantyUnit}, up to ${item.warrantyUnit === 'years' ? MAX_WARRANTY_MONTHS / 12 : MAX_WARRANTY_MONTHS}.`;
      }
    });
    if (numericDiscount > numericAmount) errors.discount = 'Discount cannot be more than the bill.';
    if (paymentMethod === 'Finance') {
      if (finance.company.trim().length < 2) errors['finance.company'] = 'Choose or type the finance company.';
      if (finance.downPayment !== '' && !(Number(finance.downPayment) >= 0)) errors['finance.downPayment'] = 'Enter the down payment (0 if none).';
      if (Number(finance.downPayment) > finalAmount) errors['finance.downPayment'] = 'Down payment cannot be more than the bill.';
      if (!(Number(finance.emiAmount) > 0)) errors['finance.emiAmount'] = 'Enter the monthly EMI.';
      if (!(Number.isInteger(Number(finance.tenureMonths)) && Number(finance.tenureMonths) >= 1 && Number(finance.tenureMonths) <= 60)) {
        errors['finance.tenureMonths'] = '1 to 60 months.';
      }
      if (!finance.firstEmiDate) errors['finance.firstEmiDate'] = 'Choose the EMI date.';
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
    if (couponOwnerMismatch) {
      errors.coupon = 'This coupon belongs to another customer. Remove it or select its owner.';
    } else if (couponBelowMinimum) {
      errors.coupon = appliedCoupon.coupon.minBillAmount > 0
        ? `This voucher applies ${describeMinimum(appliedCoupon.coupon)}.`
        : `Add ${appliedCoupon.coupon.discount.itemName || 'an eligible product'} to the bill for this voucher.`;
    } else if (couponInput.trim() && !appliedCoupon) {
      errors.coupon = 'Press Apply to check the coupon, or clear the code.';
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      // Loyalty points and the warranty expiry date are calculated by the server.
      const recorded = await adminPurchaseService.createPurchase({
        ...(customerMode === 'existing'
          ? { customerId: selectedCustomer.id }
          : { newCustomer: { mobile: newMobileDigits, ...(newName.trim() ? { name: newName.trim() } : {}) } }),
        invoiceNumber,
        items: items.map((item) => ({
          product: {
            name: item.name,
            brand: item.brand,
            model: item.model,
            variant: item.variant,
            color: item.color,
            imei: item.imei.trim(),
          },
          category: item.category,
          price: Number(item.price),
          warranty: { duration: item.warrantyDuration, unit: item.warrantyUnit },
        })),
        purchaseDate,
        paymentMethod,
        finance: paymentMethod === 'Finance' ? finance : undefined,
        paymentStatus: 'Paid',
        discount: numericDiscount,
        pointsToRedeem,
        couponCode: appliedCoupon?.coupon.code,
      });

      // The purchase is saved. Upload the bill separately: if that fails, the purchase must
      // still count as recorded and the bill can be attached later from the invoice page.
      // Same for the product photo: the purchase stays recorded even if the upload fails.
      // One photo per product line (bill line i ↔ form row i)
      let imageStatus = null;
      const withPhotos = items.map((item, i) => ({ file: item.imageFile, line: recorded.purchases[i] })).filter((x) => x.file && x.line);
      for (const { file, line } of withPhotos) {
        try {
          const withImage = await adminPurchaseService.uploadProductImage(line.id, file);
          line.product = withImage.product;
          imageStatus = imageStatus ?? { ok: true };
        } catch (uploadErr) {
          imageStatus = { ok: false };
          showError('Photo not uploaded', `The purchase was recorded, but the photo of ${line.product.name} could not be uploaded: ${uploadErr.message} You can add it from the invoice page.`);
        }
      }

      let billStatus = null;
      if (billFile) {
        try {
          // The bill file belongs to every product on the bill
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
    setCustomerMode('existing');
    setNewMobile('');
    setNewName('');
    items.forEach((item) => item.imagePreview && URL.revokeObjectURL(item.imagePreview));
    setItems([newPurchaseItem()]);
    setDiscount('');
    setPaymentMethod('Cash');
    setFinance(emptyFinance);
    setBillFile(null);
    setBillError('');
    setInvoiceNumber('');
    setPurchaseDate(toDateInputValue());
    setRedeemPoints('');
    setFormErrors({});
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  };

  // SUCCESS STATE
  if (successRecord) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-stone-900">Purchase Recorded</h2>
          <p className="text-xs text-stone-500 mt-1">
            Invoice <span className="font-mono font-medium text-stone-800">{successRecord.invoiceNumber}</span>
            {successRecord.purchases.length > 1 ? ` with ${successRecord.purchases.length} products` : ''} created for{' '}
            {successRecord.customerName === 'Customer' ? successRecord.customerMobile : successRecord.customerName}.
          </p>
          {successRecord.customerCreated && (
            <p className="mt-3 text-xs text-stone-600 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 text-left">
              New customer saved under <span className="font-medium text-stone-900">{successRecord.customerMobile}</span>.
              When they sign up in the Sundhamata app with this number, they will see this purchase and their points.
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 border border-stone-200/80 text-left text-xs space-y-2.5 shadow-2xs">
          <div className="space-y-2 pb-2.5 border-b border-stone-100">
            {successRecord.purchases.map((line) => (
              <div key={line.id} className="flex justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-stone-900 block truncate">{line.product?.name}</span>
                  <span className="text-[11px] text-stone-400">
                    {line.warranty ? `${line.warranty.type} · until ${line.warranty.validUntil}` : 'No warranty'}
                  </span>
                </div>
                <span className="tabular-nums text-stone-700 shrink-0">{formatINR(line.pricing.purchaseAmount)}</span>
              </div>
            ))}
          </div>
          {successRecord.order.totals.discount > 0 && (
            <div className="flex justify-between text-stone-500">
              <span>Discount</span>
              <span className="tabular-nums">− {formatINR(successRecord.order.totals.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-stone-500">
            <span>Amount Paid</span>
            <span className="font-semibold text-stone-900 tabular-nums">{formatINR(successRecord.order.totals.finalAmount)}</span>
          </div>
          {successRecord.finance && (
            <div className="flex justify-between gap-3 text-stone-500">
              <span>Finance</span>
              <span className="text-right text-stone-800">
                {successRecord.finance.company} · down {formatINR(successRecord.finance.downPayment)}
                <span className="block text-[11px] text-stone-500">
                  {describeEmi(successRecord.finance)} from {formatDate(`${successRecord.finance.firstEmiDate}T12:00:00`)}
                </span>
              </span>
            </div>
          )}
          {successRecord.order.totals.couponDiscount > 0 && (
            <div className="flex justify-between text-brand-800 font-medium pt-2 border-t border-stone-100">
              <span>Coupon {successRecord.coupon?.code}</span>
              <span className="tabular-nums">{formatINR(successRecord.order.totals.couponDiscount)} off</span>
            </div>
          )}
          {successRecord.order.pointsRedeemed > 0 && (
            <div className="flex justify-between text-amber-800 font-medium pt-2 border-t border-stone-100">
              <span>Points Redeemed</span>
              <span className="tabular-nums">
                −{successRecord.order.pointsRedeemed.toLocaleString('en-IN')} pts ({formatINR(successRecord.order.totals.loyaltyDiscount)} off)
              </span>
            </div>
          )}
          <div className="flex justify-between text-emerald-700 font-medium pt-2 border-t border-stone-100">
            <span>Points Credited</span>
            <span className="tabular-nums">+{successRecord.order.pointsEarned || 0} pts</span>
          </div>
          {successRecord.customerLoyaltyBalance !== undefined && (
            <div className="flex justify-between text-stone-500">
              <span>New Points Balance</span>
              <span className="font-medium text-stone-900 tabular-nums">
                {successRecord.customerLoyaltyBalance.toLocaleString('en-IN')} pts
              </span>
            </div>
          )}
          {successRecord.imageStatus && !successRecord.imageStatus.ok && (
            <div className="flex justify-between gap-3 pt-2 border-t border-stone-100 text-rose-700">
              <span>Product photo</span>
              <span className="font-medium text-right">Not uploaded — add it from the invoice page</span>
            </div>
          )}
          {successRecord.billStatus && (
            <div
              className={`flex justify-between gap-3 pt-2 border-t border-stone-100 ${
                successRecord.billStatus.ok ? 'text-stone-500' : 'text-rose-700'
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
            className="py-2 px-4 rounded-lg border border-stone-300 text-stone-700 text-xs font-medium hover:bg-stone-50 cursor-pointer transition-colors"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Record Purchase</h1>
          <p className="text-xs text-stone-500 mt-0.5">Bill a retail counter sale, register device identifiers, and credit loyalty points.</p>
        </div>

        <button
          onClick={() => navigate('/admin/purchases')}
          className="text-xs font-medium text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Purchases</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left (8 Cols): Unified Billing Sheet */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-stone-200/80 shadow-2xs divide-y divide-stone-100 overflow-hidden">
          {/* Section 1: Customer Selection */}
          <div className="p-5 sm:p-6 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">1. Customer Details</h3>
                <p className="text-xs text-stone-400 font-normal">
                  {customerMode === 'new'
                    ? 'Only the mobile number is needed. No sign-up required.'
                    : 'Search by name or mobile number'}
                </p>
              </div>
              <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200 text-xs self-start sm:self-auto" role="tablist">
                {[
                  { id: 'existing', label: 'Existing customer', icon: Users },
                  { id: 'new', label: 'New customer', icon: UserPlus },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={customerMode === id}
                    onClick={() => {
                      setCustomerMode(id);
                      setRedeemPoints('');
                      setFormErrors((prev) => ({ ...prev, customer: '', newMobile: '', newName: '' }));
                    }}
                    className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                      customerMode === id ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {customerMode === 'new' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label htmlFor="new-customer-mobile" className="font-medium text-stone-700 block">
                      Mobile Number <span className="text-rose-500">*</span>
                    </label>
                    <div
                      className={`flex items-center bg-white border rounded-lg shadow-2xs focus-within:border-brand-600 ${
                        formErrors.newMobile ? 'border-rose-400' : 'border-stone-300'
                      }`}
                    >
                      <span className="pl-3 pr-2 text-stone-500 font-medium border-r border-stone-200">+91</span>
                      <input
                        id="new-customer-mobile"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="off"
                        value={newMobile}
                        onChange={(e) => {
                          setNewMobile(e.target.value.replace(/[^\d\s+-]/g, '').slice(0, 16));
                          if (formErrors.newMobile) setFormErrors((prev) => ({ ...prev, newMobile: '' }));
                        }}
                        placeholder="98290 55443"
                        className="flex-1 min-w-0 px-2.5 py-2 bg-transparent font-medium text-stone-900 tabular-nums focus:outline-hidden"
                        autoFocus
                      />
                    </div>
                    {formErrors.newMobile && <p className="text-[11px] text-rose-600">{formErrors.newMobile}</p>}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="new-customer-name" className="font-medium text-stone-700 block">
                      Customer Name <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="new-customer-name"
                      type="text"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        if (formErrors.newName) setFormErrors((prev) => ({ ...prev, newName: '' }));
                      }}
                      maxLength={80}
                      placeholder="e.g. Amit Verma"
                      className={`w-full px-3 py-2 bg-white border rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs ${
                        formErrors.newName ? 'border-rose-400' : 'border-stone-300'
                      }`}
                    />
                    {formErrors.newName && <p className="text-[11px] text-rose-600">{formErrors.newName}</p>}
                  </div>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  The purchase and loyalty points are saved under this number. When the customer signs up in the
                  Sundhamata app with it, they will see everything and can add their own details. If the number
                  already belongs to a customer, the purchase is added to their account.
                </p>
              </div>
            ) : !selectedCustomer ? (
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search customer by name or 10-digit mobile number..."
                  className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-normal text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:bg-white focus:border-brand-600 transition-all shadow-2xs"
                  autoFocus
                />

                {formErrors.customer && (
                  <p className="text-[11px] text-rose-600 mt-1">{formErrors.customer}</p>
                )}

                {(searchResults.length > 0 || isValidMobile(toTenDigits(searchQuery))) && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-white border border-stone-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-stone-100">
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
                        className="p-3 hover:bg-stone-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CustomerAvatar customer={c} className="w-8 h-8 rounded-full" textClassName="text-[10px]" />
                          <span className="font-medium text-stone-900 flex items-center gap-1">
                            {c.name}
                            {c.isVerified && <VerifiedTick className="w-3.5 h-3.5" />}
                          </span>
                          <span className="text-stone-400 font-normal">{c.phone || c.mobile}</span>
                        </div>
                        <span className="text-xs font-medium text-amber-700 tabular-nums">{c.loyaltyPoints || 0} pts</span>
                      </div>
                    ))}
                    {/* A full mobile number nobody has yet: bill it straight away as a new customer */}
                    {isValidMobile(toTenDigits(searchQuery)) &&
                      !searchResults.some((c) => toTenDigits(c.mobile) === toTenDigits(searchQuery)) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerMode('new');
                            setNewMobile(toTenDigits(searchQuery));
                            setSearchQuery('');
                            setSearchResults([]);
                            setRedeemPoints('');
                            setFormErrors((prev) => ({ ...prev, customer: '' }));
                          }}
                          className="w-full p-3 text-left hover:bg-brand-50/60 cursor-pointer flex items-center gap-2.5 text-xs transition-colors"
                        >
                          <span className="w-7 h-7 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                            <UserPlus className="w-3.5 h-3.5" />
                          </span>
                          <span>
                            <span className="font-medium text-stone-900 block">
                              Bill to new customer +91 {toTenDigits(searchQuery)}
                            </span>
                            <span className="text-stone-500">No sign-up needed. They see it when they join the app.</span>
                          </span>
                        </button>
                      )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-lg bg-stone-50/80 border border-stone-200/80 text-xs">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Large photo so staff can check it is the right person */}
                  <CustomerAvatar customer={selectedCustomer} className="w-12 h-12 rounded-xl" textClassName="text-sm" />
                  <div className="min-w-0">
                    <span className="font-medium text-stone-900 text-sm flex items-center gap-1">
                      {selectedCustomer.name}
                      {selectedCustomer.isVerified && <VerifiedTick className="w-4 h-4" />}
                    </span>
                    <span className="text-stone-500 font-normal">{selectedCustomer.phone || selectedCustomer.mobile}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md tabular-nums">
                    {selectedCustomer.loyaltyPoints || 0} pts available
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
                    title="Change customer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Products on this bill */}
          <div className="p-5 sm:p-6 space-y-4">
            <div className="space-y-2">
              <div>
                <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">
                  2. Products {items.length > 1 && <span className="text-stone-400 normal-case font-normal">({items.length} on this bill)</span>}
                </h3>
                <p className="text-xs text-stone-400 font-normal">Type a name to pick a saved product, or add a new one</p>
              </div>

              {/* Most sold products (from the catalog) */}
              {popularProducts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-stone-400 text-[11px]">Popular:</span>
                  {popularProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addPopular(p)}
                      title={`Add ${p.name}`}
                      className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium text-[11px] cursor-pointer whitespace-nowrap transition-colors max-w-[200px] truncate"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <PurchaseItemEditor
                  key={item.key}
                  item={item}
                  index={index}
                  count={items.length}
                  purchaseDate={purchaseDate}
                  errors={{
                    imei: formErrors[`items.${item.key}.imei`],
                    name: formErrors[`items.${item.key}.name`],
                    price: formErrors[`items.${item.key}.price`],
                    warranty: formErrors[`items.${item.key}.warranty`],
                  }}
                  onChange={(patch) => updateItem(item.key, patch)}
                  onRemove={() => removeItem(item.key)}
                />
              ))}
            </div>

            {items.length < 20 && (
              <button
                type="button"
                onClick={() => addItem()}
                className="w-full py-2.5 rounded-lg border border-dashed border-stone-300 hover:border-brand-400 hover:bg-brand-50/40 text-stone-600 hover:text-brand-800 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Add another product
              </button>
            )}
          </div>

          {/* Section 3: Invoice & Purchase Date */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">3. Invoice & Date</h3>
              <p className="text-xs text-stone-400 font-normal">One invoice for all products — use the number printed on the bill, in any format</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-700 block">Invoice / Bill Number *</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  maxLength={50}
                  onChange={(e) => {
                    setInvoiceNumber(e.target.value);
                    if (formErrors.invoiceNumber) setFormErrors((prev) => ({ ...prev, invoiceNumber: '' }));
                  }}
                  placeholder="e.g. SM/2026-27/0042"
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs font-mono text-xs ${formErrors.invoiceNumber ? 'border-rose-400' : 'border-stone-300'}`}
                />
                {formErrors.invoiceNumber && <p className="text-[11px] text-rose-600">{formErrors.invoiceNumber}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-700 block">Purchase Date *</label>
                <input
                  type="date"
                  value={purchaseDate}
                  max={today}
                  onChange={(e) => {
                    setPurchaseDate(e.target.value);
                    if (formErrors.purchaseDate) setFormErrors((prev) => ({ ...prev, purchaseDate: '' }));
                  }}
                  className={`w-full px-3 py-2 bg-white border rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs ${formErrors.purchaseDate ? 'border-rose-400' : 'border-stone-300'}`}
                />
                {formErrors.purchaseDate && <p className="text-[11px] text-rose-600">{formErrors.purchaseDate}</p>}
              </div>
            </div>
          </div>

          {/* Section 4: Pricing & Payment Terms */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">4. Pricing & Payment</h3>
              <p className="text-xs text-stone-400 font-normal">Enter retail price, discount, and settlement mode</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-xs font-medium text-stone-700 block">Subtotal</span>
                <div className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg font-medium text-stone-900 tabular-nums">
                  {formatINR(numericAmount)}
                  {items.length > 1 && <span className="text-stone-400 font-normal"> · {items.length} products</span>}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-stone-700 block">Discount (₹)</label>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => {
                    setDiscount(e.target.value);
                    if (formErrors.discount) setFormErrors((prev) => ({ ...prev, discount: '' }));
                  }}
                  placeholder="0"
                  className={`w-full px-3 py-2 bg-white border rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs ${formErrors.discount ? 'border-rose-400' : 'border-stone-300'}`}
                />
                {formErrors.discount && <p className="text-[11px] text-rose-600">{formErrors.discount}</p>}
              </div>

            </div>

            {/* Purchase By: Cash / UPI / Card / Finance (EMI) */}
            <div className="space-y-2 text-xs">
              <span className="text-xs font-medium text-stone-700 block">Purchase By</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Purchase by">
                {PURCHASE_BY.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === id}
                    onClick={() => setPaymentMethod(id)}
                    className={`py-2.5 rounded-lg border font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      paymentMethod === id
                        ? 'bg-ink-900 border-ink-900 text-white'
                        : 'bg-white border-stone-300 text-stone-700 hover:border-stone-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'Finance' && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3.5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-stone-800">Finance / EMI Details</span>
                  <span className="text-stone-500">
                    Loan amount:{' '}
                    <span className="font-semibold text-stone-900 tabular-nums">
                      {formatINR(Math.max(0, finalAmount - (Number(finance.downPayment) || 0)))}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="finance-company">Finance Company *</label>
                    <input
                      id="finance-company"
                      list="finance-companies"
                      value={finance.company}
                      onChange={setFinanceField('company')}
                      placeholder="e.g. Bajaj Finserv"
                      maxLength={60}
                      className={`w-full px-3 py-2 bg-white border rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs ${formErrors['finance.company'] ? 'border-rose-400' : 'border-stone-300'}`}
                    />
                    <datalist id="finance-companies">
                      {FINANCE_COMPANIES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    {formErrors['finance.company'] && <p className="text-[11px] text-rose-600">{formErrors['finance.company']}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="finance-loan">Loan / Agreement No.</label>
                    <input
                      id="finance-loan"
                      value={finance.loanNumber}
                      onChange={setFinanceField('loanNumber')}
                      placeholder="Optional"
                      maxLength={40}
                      className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-mono focus:outline-hidden focus:border-brand-600 shadow-2xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="finance-down">Down Payment (₹)</label>
                    <input
                      id="finance-down"
                      type="number"
                      min="0"
                      value={finance.downPayment}
                      onChange={setFinanceField('downPayment')}
                      placeholder="0"
                      className={`w-full px-3 py-2 bg-white border rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs ${formErrors['finance.downPayment'] ? 'border-rose-400' : 'border-stone-300'}`}
                    />
                    {formErrors['finance.downPayment'] && <p className="text-[11px] text-rose-600">{formErrors['finance.downPayment']}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="finance-emi">EMI Amount (₹ / month) *</label>
                    <input
                      id="finance-emi"
                      type="number"
                      min="0"
                      value={finance.emiAmount}
                      onChange={setFinanceField('emiAmount')}
                      placeholder="e.g. 8350"
                      className={`w-full px-3 py-2 bg-white border rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs ${formErrors['finance.emiAmount'] ? 'border-rose-400' : 'border-stone-300'}`}
                    />
                    {formErrors['finance.emiAmount'] && <p className="text-[11px] text-rose-600">{formErrors['finance.emiAmount']}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="finance-months">EMI For (months) *</label>
                    <input
                      id="finance-months"
                      type="number"
                      min="1"
                      max="60"
                      value={finance.tenureMonths}
                      onChange={setFinanceField('tenureMonths')}
                      className={`w-full px-3 py-2 bg-white border rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs ${formErrors['finance.tenureMonths'] ? 'border-rose-400' : 'border-stone-300'}`}
                    />
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {[3, 6, 9, 12, 18, 24].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFinance((prev) => ({ ...prev, tenureMonths: String(m) }))}
                          className={`px-1.5 py-0.5 rounded-md border text-[10.5px] cursor-pointer ${
                            String(m) === finance.tenureMonths ? 'bg-sky-100 border-sky-300 text-sky-900' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    {formErrors['finance.tenureMonths'] && <p className="text-[11px] text-rose-600">{formErrors['finance.tenureMonths']}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="finance-date">EMI Date (first EMI) *</label>
                    <input
                      id="finance-date"
                      type="date"
                      value={finance.firstEmiDate}
                      onChange={setFinanceField('firstEmiDate')}
                      className={`w-full px-3 py-2 bg-white border rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs ${formErrors['finance.firstEmiDate'] ? 'border-rose-400' : 'border-stone-300'}`}
                    />
                    {formErrors['finance.firstEmiDate'] ? (
                      <p className="text-[11px] text-rose-600">{formErrors['finance.firstEmiDate']}</p>
                    ) : finance.firstEmiDate ? (
                      <p className="text-[11px] text-stone-500">
                        Every month on the {Number(finance.firstEmiDate.slice(8, 10))}
                        {Number(finance.tenureMonths) > 1 &&
                          ` · last EMI ${formatDate(addMonths(new Date(`${finance.firstEmiDate}T12:00:00`), Number(finance.tenureMonths) - 1))}`}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <span className="font-medium text-stone-700 block">Customer pays in total</span>
                    <div className="px-3 py-2 bg-white/70 border border-stone-200 rounded-lg tabular-nums text-stone-800">
                      {formatINR((Number(finance.downPayment) || 0) + (Number(finance.emiAmount) || 0) * (Number(finance.tenureMonths) || 0))}
                      <span className="text-stone-400"> (down payment + EMIs)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Customer coupon (welcome offer QR / code) */}
            <div className="rounded-lg border border-brand-200/70 bg-brand-50/40 p-3.5 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="coupon-code" className="font-medium text-stone-800 flex items-center gap-1.5">
                  <TicketPercent className="w-3.5 h-3.5 text-brand-600" />
                  <span>Customer Coupon</span>
                </label>
                <span className="text-stone-500">Scan the QR on the customer's phone or type the code</span>
              </div>

              {appliedCoupon ? (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 ${
                    couponOwnerMismatch || couponBelowMinimum ? 'border-rose-300' : 'border-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CustomerAvatar customer={appliedCoupon.customer} className="w-9 h-9 rounded-lg" textClassName="text-[10px]" />
                    <div>
                    <span className="font-mono font-semibold text-stone-900 tracking-wider">
                      {appliedCoupon.coupon.campaignCode || appliedCoupon.coupon.code}
                    </span>
                    <span className="ml-2 text-stone-500">{describeDiscount(appliedCoupon.coupon.discount)}</span>
                    {describeMinimum(appliedCoupon.coupon) && (
                      <span className="ml-1 text-stone-400">· {describeMinimum(appliedCoupon.coupon)}</span>
                    )}
                    <span className="block text-[11px] text-stone-400">
                      {appliedCoupon.customer.name} · valid till {formatDate(appliedCoupon.coupon.expiresAt)}
                    </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {couponDiscount > 0 && (
                      <span className="text-emerald-700 font-medium tabular-nums">− {formatINR(couponDiscount)}</span>
                    )}
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
                      title="Remove coupon"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="coupon-code"
                    type="text"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value.toUpperCase());
                      setCouponError('');
                      if (formErrors.coupon) setFormErrors((prev) => ({ ...prev, coupon: '' }));
                    }}
                    onKeyDown={(e) => {
                      // USB barcode scanners "type" the code and press Enter
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyCoupon();
                      }
                    }}
                    placeholder="SM-XXXX-XXXX"
                    autoComplete="off"
                    spellCheck={false}
                    className={`w-44 px-3 py-2 bg-white border rounded-lg font-mono font-medium tracking-wider text-stone-900 uppercase focus:outline-hidden focus:border-brand-600 shadow-2xs ${
                      couponError || formErrors.coupon ? 'border-rose-400' : 'border-stone-300'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => applyCoupon()}
                    disabled={!couponInput.trim() || couponChecking}
                    className="py-2 px-3 rounded-lg bg-stone-900 text-white font-medium hover:bg-stone-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {couponChecking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="py-2 px-3 rounded-lg border border-brand-300 bg-white text-brand-800 font-medium hover:bg-brand-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    Scan QR
                  </button>
                </div>
              )}
              {(couponError || formErrors.coupon) && (
                <p className="text-[11px] text-rose-600">{couponError || formErrors.coupon}</p>
              )}
              {!formErrors.coupon && couponOwnerMismatch && (
                <p className="text-[11px] text-rose-600">This coupon belongs to {appliedCoupon.customer.name}, not the selected customer.</p>
              )}
              {!formErrors.coupon && !couponOwnerMismatch && couponBelowMinimum && (
                <p className="text-[11px] text-amber-700">
                  {appliedCoupon.coupon.minBillAmount > 0
                    ? `Applies ${describeMinimum(appliedCoupon.coupon)} (now ${formatINR(couponBase)}).`
                    : `Add ${appliedCoupon.coupon.discount.itemName || 'an eligible product'} to the bill.`}
                </p>
              )}
            </div>

            <QrScannerModal
              isOpen={scannerOpen}
              onClose={closeScanner}
              onScan={handleScanned}
              title="Scan Customer Coupon"
            />

            {/* Loyalty points redemption */}
            <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-3.5 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="redeem-points" className="font-medium text-stone-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Redeem Loyalty Points</span>
                </label>
                <span className="text-stone-500">
                  {selectedCustomer ? (
                    <>
                      Available: <span className="font-medium text-amber-800 tabular-nums">{availablePoints.toLocaleString('en-IN')} pts</span>
                      {' '}· 1 pt = {formatINR(rupeeValuePerPoint)}
                      {minRedeemPoints > 0 && <> · min {minRedeemPoints.toLocaleString('en-IN')} pts</>}
                    </>
                  ) : (
                    customerMode === 'new' ? 'New customer: no points to redeem yet' : 'Select a customer first'
                  )}
                </span>
              </div>

              {selectedCustomer && !canRedeem ? (
                <p className="text-stone-500">
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
                    className={`w-36 px-3 py-2 bg-white border rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs disabled:bg-stone-100 ${
                      redemptionError ? 'border-rose-400' : 'border-stone-300'
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
                      className="py-2 px-2 text-stone-500 hover:text-stone-800 cursor-pointer"
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
              <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">5. Bill / Invoice File</h3>
              <p className="text-xs text-stone-400 font-normal">
                Optional. The customer can download it from their purchase. {BILL_HINT}.
              </p>
            </div>

            {billFile ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-stone-50/80 border border-stone-200/80 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium text-stone-900 block truncate">{billFile.name}</span>
                    <span className="text-stone-400">{formatFileSize(billFile.size)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBillFile(null)}
                  className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
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
                  dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-stone-300 bg-stone-50/50 hover:bg-stone-50'
                }`}
              >
                <Paperclip className="w-4 h-4 text-stone-400" />
                <span className="text-xs font-medium text-stone-700">Click to choose a file, or drag it here</span>
                <span className="text-[11px] text-stone-400">{BILL_HINT}</span>
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
        <div className="lg:col-span-4 bg-white rounded-xl p-5 border border-stone-200/80 shadow-2xs space-y-4 sticky top-20">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100 text-xs">
            <span className="font-medium text-stone-500">Invoice Number</span>
            <span className="font-mono text-xs font-medium text-brand-700 truncate max-w-[170px]">{invoiceNumber.trim() || '—'}</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between text-stone-500">
              <span>Customer</span>
              <span className="font-medium text-stone-900 truncate max-w-[150px]">
                {customerMode === 'new'
                  ? newName.trim() || (newMobileDigits ? `+91 ${newMobileDigits}` : '—')
                  : selectedCustomer?.name || '—'}
              </span>
            </div>
            <div className="space-y-1.5 py-2 border-y border-stone-100">
              {items.map((item, index) => (
                <div key={item.key} className="flex justify-between gap-3">
                  <span className="text-stone-700 truncate">
                    {item.name.trim() || <span className="text-stone-400">Product {index + 1}</span>}
                    {itemWarrantyMonths(item) > 0 && (
                      <span className="text-stone-400"> · {item.warrantyDuration} {item.warrantyUnit === 'years' ? 'yr' : 'mo'}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-stone-800 shrink-0">{item.price ? formatINR(Number(item.price)) : '—'}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-stone-500">
              <span>Purchase By</span>
              <span className="font-medium text-stone-800 truncate max-w-[160px]">
                {paymentMethod === 'Finance' ? `Finance${finance.company.trim() ? ` · ${finance.company.trim()}` : ''}` : paymentMethod}
              </span>
            </div>
            <div className="flex justify-between text-stone-500">
              <span>Purchase Date</span>
              <span className="font-medium text-stone-800">{purchaseDate ? formatDate(`${purchaseDate}T12:00:00`) : '—'}</span>
            </div>

            {(numericDiscount > 0 || couponDiscount > 0 || (pointsToRedeem > 0 && !redemptionError)) && (
              <div className="pt-3 border-t border-stone-100 space-y-1.5">
                <div className="flex justify-between text-stone-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums text-stone-800">{formatINR(numericAmount)}</span>
                </div>
                {numericDiscount > 0 && (
                  <div className="flex justify-between text-stone-500">
                    <span>Discount</span>
                    <span className="tabular-nums text-stone-800">− {formatINR(numericDiscount)}</span>
                  </div>
                )}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-brand-800">
                    <span>Coupon</span>
                    <span className="tabular-nums">− {formatINR(couponDiscount)}</span>
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

            <div className="pt-3 border-t border-stone-100 flex justify-between items-baseline">
              <span className="font-medium text-stone-600">Total Billed</span>
              <span className="text-xl font-semibold text-stone-900 tabular-nums">
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

