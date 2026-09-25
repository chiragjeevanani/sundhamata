import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ShoppingBag,
  User,
  Calendar,
  CreditCard,
  Sparkles,
  FileText,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  Edit2,
  XCircle,
  Check,
  X,
  ExternalLink,
  Download,
  Upload,
  Trash2,
  Paperclip,
} from 'lucide-react';
import { adminPurchaseService } from '../../../services/adminPurchaseService';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { DetailsSkeleton } from '../components/SkeletonLoaders';
import { formatINR, formatLongDate } from '../../../utils/formatters';
import { BILL_ACCEPT, BILL_HINT, formatFileSize, saveBlob, validateBillFile } from '../../../utils/billFile';
import {
  addMonthsToDate,
  MAX_WARRANTY_MONTHS,
  monthsToWarrantyInput,
  toDateInputValue,
  warrantyToMonths,
} from '../../../utils/purchaseDates';
import { useToast } from '../context/ToastContext';

export const PurchaseDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editPaymentStatus, setEditPaymentStatus] = useState('Paid');
  const [editPaymentMethod, setEditPaymentMethod] = useState('UPI');
  const [editNotes, setEditNotes] = useState('');
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editPurchaseDate, setEditPurchaseDate] = useState('');
  const [editWarrantyDuration, setEditWarrantyDuration] = useState('1');
  const [editWarrantyUnit, setEditWarrantyUnit] = useState('years');
  const [savingEdit, setSavingEdit] = useState(false);

  // Bill file (upload / replace / download / remove)
  const billInputRef = useRef(null);
  const [billBusy, setBillBusy] = useState(''); // '' | 'upload' | 'download' | 'remove'
  const [removeBillOpen, setRemoveBillOpen] = useState(false);

  // Cancel Modal State
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchPurchase = async () => {
    setLoading(true);
    try {
      const data = await adminPurchaseService.getPurchaseById(id);
      setPurchase(data);
      setEditPaymentStatus(data.paymentStatus || 'Paid');
      setEditPaymentMethod(data.paymentMethod || 'UPI');
      setEditNotes(data.notes || '');
      setEditInvoiceNumber(data.invoiceNumber || '');
      setEditPurchaseDate(toDateInputValue(data.purchaseDate));
      const w = monthsToWarrantyInput(data.warranty?.months ?? (data.warranty ? 12 : 0));
      setEditWarrantyDuration(w.duration);
      setEditWarrantyUnit(w.unit);
    } catch (err) {
      showError('Error', err.message || 'Could not find purchase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchase();
  }, [id]);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const months = warrantyToMonths(editWarrantyDuration, editWarrantyUnit);
    if (!editInvoiceNumber.trim()) {
      showError('Validation', 'Enter the invoice / bill number.');
      return;
    }
    if (!editPurchaseDate || editPurchaseDate > toDateInputValue()) {
      showError('Validation', 'Choose a purchase date that is not in the future.');
      return;
    }
    if (months === null || months > MAX_WARRANTY_MONTHS) {
      showError('Validation', `Warranty must be a whole number up to ${MAX_WARRANTY_MONTHS / 12} years.`);
      return;
    }
    setSavingEdit(true);
    try {
      const dateChanged = editPurchaseDate !== toDateInputValue(purchase.purchaseDate);
      const updated = await adminPurchaseService.updatePurchase(purchase.id, {
        invoiceNumber: editInvoiceNumber,
        purchaseDate: dateChanged ? editPurchaseDate : undefined,
        warranty: { duration: editWarrantyDuration, unit: editWarrantyUnit },
        paymentStatus: editPaymentStatus,
        paymentMethod: editPaymentMethod,
        notes: editNotes.trim(),
      });
      setPurchase(updated);
      setIsEditing(false);
      showSuccess('Saved', `Invoice ${updated.invoiceNumber} details updated.`);
    } catch (err) {
      showError('Error', err.message || 'Unable to update purchase.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleBillPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateBillFile(file);
    if (problem) {
      showError('Invalid file', problem);
      return;
    }
    setBillBusy('upload');
    try {
      setPurchase(await adminPurchaseService.uploadBill(purchase.id, file));
      showSuccess('Bill uploaded', file.name);
    } catch (err) {
      showError('Upload failed', err.message || 'Unable to upload the bill.');
    } finally {
      setBillBusy('');
    }
  };

  const handleBillDownload = async () => {
    setBillBusy('download');
    try {
      saveBlob(await adminPurchaseService.downloadBill(purchase.id), purchase.bill.filename);
    } catch (err) {
      showError('Download failed', err.message || 'Unable to download the bill.');
    } finally {
      setBillBusy('');
    }
  };

  const handleBillRemove = async () => {
    setBillBusy('remove');
    try {
      setPurchase(await adminPurchaseService.removeBill(purchase.id));
      setRemoveBillOpen(false);
      showSuccess('Bill removed', 'The bill file was removed from this purchase.');
    } catch (err) {
      showError('Error', err.message || 'Unable to remove the bill.');
    } finally {
      setBillBusy('');
    }
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      const cancelled = await adminPurchaseService.cancelPurchase(
        purchase.id,
        'Cancelled by store administrator'
      );
      setPurchase(cancelled);
      setCancelModalOpen(false);
      showSuccess('Purchase Cancelled', `Invoice ${cancelled.invoiceNumber} was marked cancelled.`);
    } catch (err) {
      showError('Error', err.message || 'Unable to cancel purchase.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return <DetailsSkeleton />;
  }

  if (!purchase) {
    return (
      <div className="py-16 text-center space-y-3">
        <h2 className="text-base font-bold text-slate-900">Purchase Not Found</h2>
        <button
          onClick={() => navigate('/admin/purchases')}
          className="py-2 px-4 rounded-xl bg-[#0F2042] text-white text-xs font-bold"
        >
          Back to Purchases
        </button>
      </div>
    );
  }

  const isCancelled = purchase.status === 'Cancelled';
  const loyaltyPoints =
    purchase.loyalty?.pointsEarned ?? 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div>
          <button
            onClick={() => navigate('/admin/purchases')}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 mb-1.5 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Purchases</span>
          </button>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight font-mono">
              {purchase.invoiceNumber}
            </h1>
            <StatusBadge status={purchase.paymentStatus || 'Paid'} size="sm" />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Purchased on <span className="font-medium text-slate-700">{formatLongDate(purchase.purchaseDate)}</span>
            {purchase.warranty && (
              <>
                {' '}• Warranty until <span className="font-medium text-slate-700">{formatLongDate(purchase.warranty.validUntilDate)}</span>
              </>
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {!isCancelled && !isEditing && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="py-2 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-700" />
                <span>Edit Purchase</span>
              </button>

              <button
                onClick={() => setCancelModalOpen(true)}
                className="py-2 px-3.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Cancel</span>
              </button>
            </>
          )}

          <button
            onClick={() => navigate(`/admin/customers/${purchase.customerId}`)}
            className="py-2 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <User className="w-3.5 h-3.5" />
            <span>View Customer</span>
          </button>
        </div>
      </div>

      {/* Editing Panel (When enabled) */}
      {isEditing && (
        <div className="bg-amber-50/70 rounded-xl p-4 border border-amber-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900 flex items-center gap-1.5">
              <Edit2 className="w-3.5 h-3.5 text-amber-700" />
              <span>Editing Purchase Record</span>
            </h3>
            <button
              onClick={() => setIsEditing(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Cancel Edit
            </button>
          </div>

          <form onSubmit={handleSaveEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Invoice / Bill Number</label>
              <input
                type="text"
                value={editInvoiceNumber}
                maxLength={50}
                onChange={(e) => setEditInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Purchase Date</label>
              <input
                type="date"
                value={editPurchaseDate}
                max={toDateInputValue()}
                onChange={(e) => setEditPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Warranty</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editWarrantyDuration}
                  aria-label="Warranty duration"
                  onChange={(e) => setEditWarrantyDuration(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden w-20 shrink-0 tabular-nums"
                />
                <select
                  value={editWarrantyUnit}
                  aria-label="Warranty unit"
                  onChange={(e) => setEditWarrantyUnit(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden"
                >
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
              <p className="text-[11px] text-amber-800 mt-1">
                {(() => {
                  const m = warrantyToMonths(editWarrantyDuration, editWarrantyUnit);
                  if (m === null || m > MAX_WARRANTY_MONTHS || !editPurchaseDate) return null;
                  if (m === 0) return 'No warranty';
                  const expiry = addMonthsToDate(new Date(`${editPurchaseDate}T12:00:00`), m);
                  return `Valid until ${formatLongDate(expiry)}`;
                })()}
              </p>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Status</label>
              <select
                value={editPaymentStatus}
                onChange={(e) => setEditPaymentStatus(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden"
              >
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Partially Paid">Partially Paid</option>

              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
              <select
                value={editPaymentMethod}
                onChange={(e) => setEditPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden"
              >
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="EMI">EMI</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="sm:col-span-3 flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="py-1.5 px-3 rounded-lg border border-slate-300 text-slate-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="py-1.5 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 cursor-pointer"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left (8 Cols): Unified Product & Pricing Information */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
          {/* Product Information Card */}
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-600" />
                <span>Product Specifications</span>
              </h3>
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md">
                {purchase.product?.brand || 'Mobile Device'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 font-normal">Model Name</span>
                <p className="font-medium text-slate-900 text-sm mt-0.5">
                  {purchase.product?.name}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-normal">Variant & Specs</span>
                <p className="font-medium text-slate-900 mt-0.5">
                  {purchase.product?.variant || 'Standard'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-normal">Colour</span>
                <p className="font-medium text-slate-900 mt-0.5">
                  {purchase.product?.color || 'Standard'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-normal">Quantity</span>
                <p className="font-medium text-slate-900 tabular-nums mt-0.5">
                  {purchase.product?.quantity || 1} Unit
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-normal">IMEI Number</span>
                <p className="font-mono text-xs font-normal text-slate-800 mt-0.5">
                  {purchase.product?.imei1 || purchase.product?.imei || 'Not recorded'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 font-normal">Serial Number</span>
                <p className="font-mono text-xs font-normal text-slate-800 mt-0.5">
                  {purchase.product?.serialNumber || 'Not recorded'}
                </p>
              </div>
            </div>
          </div>

          {/* Pricing & Billing Breakdown */}
          <div className="p-5 sm:p-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Billing & Tax Breakdown</span>
            </h3>

            <div className="space-y-2 text-xs divide-y divide-slate-100">
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-500 font-normal">Base Amount</span>
                <span className="font-medium text-slate-800 tabular-nums">
                  {formatINR(purchase.baseAmount || Math.round(purchase.amount * 0.82))}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-slate-500 font-normal">GST Tax (18% Retail)</span>
                <span className="font-medium text-slate-800 tabular-nums">
                  {formatINR(purchase.taxAmount || Math.round(purchase.amount * 0.18))}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 text-sm">
                <span className="font-semibold text-slate-900">Total Billed Paid</span>
                <span className="font-semibold text-slate-900 tabular-nums text-base">
                  {formatINR(purchase.amount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right (4 Cols): Customer & Loyalty Overview */}
        <div className="lg:col-span-4 space-y-5">
          {/* Customer Summary Card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Customer</h3>
              <button
                onClick={() => navigate(`/admin/customers/${purchase.customerId}`)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>View Profile</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center font-medium text-xs shrink-0">
                  {purchase.customerName?.slice(0, 2).toUpperCase() || 'CU'}
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 text-sm">
                    {purchase.customerName}
                  </h4>
                  <p className="text-xs text-slate-500 font-normal">
                    {purchase.customerMobile}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                <span>Customer ID: </span>
                <span className="font-mono text-xs text-slate-700 font-normal">
                  {purchase.customerCode || purchase.customerId}
                </span>
              </div>
            </div>
          </div>

          {/* Loyalty Reward Card */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-900">Loyalty Awarded</h3>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-xs space-y-1">
              <span className="text-[11px] font-medium text-amber-800 block">
                Points Credited
              </span>
              <span className="text-xl font-semibold text-amber-950 tabular-nums block">
                +{loyaltyPoints.toLocaleString('en-IN')} Points
              </span>
              <p className="text-[11px] text-amber-800 font-normal">
                {isCancelled
                  ? `Reversed ${(purchase.loyalty?.pointsReversed ?? 0).toLocaleString('en-IN')} pts on cancellation${purchase.loyalty?.reversalShortfall ? ` (${purchase.loyalty.reversalShortfall.toLocaleString('en-IN')} pts had already been used)` : ''}.`
                  : 'Synced with customer loyalty balance.'}
              </p>
            </div>
          </div>

          {/* Bill file */}
          <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Paperclip className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">Bill</h3>
            </div>

            <input
              ref={billInputRef}
              type="file"
              accept={BILL_ACCEPT}
              className="sr-only"
              onChange={handleBillPicked}
            />

            {purchase.bill ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 break-words">{purchase.bill.filename}</p>
                    <p className="text-slate-400 mt-0.5">
                      {formatFileSize(purchase.bill.size)} • uploaded {formatLongDate(purchase.bill.uploadedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleBillDownload}
                    disabled={Boolean(billBusy)}
                    className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{billBusy === 'download' ? 'Downloading...' : 'Download'}</span>
                  </button>
                  {!isCancelled && (
                    <>
                      <button
                        onClick={() => billInputRef.current?.click()}
                        disabled={Boolean(billBusy)}
                        className="py-1.5 px-3 rounded-lg border border-slate-300 text-slate-700 font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{billBusy === 'upload' ? 'Uploading...' : 'Replace'}</span>
                      </button>
                      <button
                        onClick={() => setRemoveBillOpen(true)}
                        disabled={Boolean(billBusy)}
                        className="py-1.5 px-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                        title="Remove bill"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs">
                <p className="text-slate-500 font-normal">
                  {isCancelled
                    ? 'No bill was attached to this purchase.'
                    : 'No bill attached yet. Once uploaded, the customer can download it from their purchase.'}
                </p>
                {!isCancelled && (
                  <>
                    <button
                      onClick={() => billInputRef.current?.click()}
                      disabled={Boolean(billBusy)}
                      className="py-1.5 px-3 rounded-lg border border-slate-300 text-slate-700 font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{billBusy === 'upload' ? 'Uploading...' : 'Upload bill'}</span>
                    </button>
                    <p className="text-[11px] text-slate-400">{BILL_HINT}</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Warranty Info */}
          {purchase.warranty && (
            <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs space-y-2 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-medium text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Warranty</span>
                </span>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  {purchase.warranty.status}
                </span>
              </div>
              <p className="font-medium text-slate-800">{purchase.warranty.type}</p>
              <p className="text-xs text-slate-500 font-normal">
                Valid until {purchase.warranty.validUntil}. {purchase.warranty.coverage}
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={removeBillOpen}
        onClose={() => setRemoveBillOpen(false)}
        onConfirm={handleBillRemove}
        title="Remove This Bill?"
        message="The uploaded bill file will be deleted and the customer will no longer be able to download it."
        confirmText="Remove Bill"
        type="danger"
        isLoading={billBusy === 'remove'}
      />

      {/* Cancel Purchase Confirmation Modal */}
      <ConfirmationModal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        onConfirm={handleConfirmCancel}
        title="Cancel This Purchase?"
        message={`Invoice ${purchase.invoiceNumber} will be marked as Cancelled. Note: ${loyaltyPoints} loyalty points were associated with this purchase.`}
        confirmText="Confirm Cancellation"
        type="danger"
        isLoading={cancelling}
      />
    </div>
  );
};

