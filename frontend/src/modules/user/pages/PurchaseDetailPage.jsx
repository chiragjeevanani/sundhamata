import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import {
  Copy,
  Check,
  Download,
  PhoneCall,
  Calendar,
  FileText,
  ShieldCheck,
  MapPin,
  Smartphone,
  Share2,
} from 'lucide-react';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { PurchaseDetailSkeleton } from '../components/SkeletonLoader';
import { ErrorState } from '../components/ErrorState';
import { InvoiceModal } from '../components/InvoiceModal';
import { purchaseService } from '../../../services/purchaseService';
import { formatINR, formatLongDate, formatDate } from '../../../utils/formatters';
import { formatFileSize, saveBlob } from '../../../utils/billFile';
import { useAuth } from '../context/AuthContext';
import { useStoreInfo, formatStoreAddress } from '../hooks/useStoreInfo';

export const PurchaseDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const store = useStoreInfo();
  const { onOpenStoreInfo } = useOutletContext() || {};

  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [billDownloading, setBillDownloading] = useState(false);
  const [billError, setBillError] = useState('');
  const [imgError, setImgError] = useState(false);

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseService.getPurchaseById(id);
      setPurchase(data);
    } catch (err) {
      setError(err.message || 'Purchase record not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const downloadBill = async () => {
    setBillDownloading(true);
    setBillError('');
    try {
      saveBlob(await purchaseService.downloadBill(purchase.id), purchase.bill.filename);
    } catch (err) {
      setBillError(err.message || 'Could not download the bill. Please try again.');
    } finally {
      setBillDownloading(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleShare = async () => {
    if (navigator.share && purchase) {
      try {
        await navigator.share({
          title: `${purchase.product.name} - Sundhamata Mobile Purchase`,
          text: `Purchased ${purchase.product.name} (${purchase.product.variant}) on ${purchase.formattedDate} from Sundhamata Mobile. Invoice: ${purchase.invoiceNumber}`,
          url: window.location.href,
        });
      } catch {
        // User cancelled
      }
    } else {
      copyToClipboard(window.location.href, 'share');
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Header */}
      <Header
        title="Purchase Details"
        subtitle={purchase?.invoiceNumber}
        showBack={true}
        backTo="/purchases"
        rightAction={
          purchase && (
            <button
              onClick={handleShare}
              className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
              aria-label="Share Purchase"
            >
              {copiedKey === 'share' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Share2 className="w-3.5 h-3.5 text-[#0F2042]" />
              )}
            </button>
          )
        }
      />

      <div className="p-3.5 sm:p-4 space-y-2.5">
        {loading ? (
          <PurchaseDetailSkeleton />
        ) : error ? (
          <ErrorState
            title="Purchase not found"
            description={error}
            onRetry={fetchDetail}
          />
        ) : !purchase ? null : (
          <>
            {/* Sleek Horizontal Product Hero Card */}
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] flex flex-col gap-2.5">
              <div className="flex gap-3 items-center">
                {/* Product Photography Container */}
                <div className="w-18 h-22 rounded-xl bg-slate-50 border border-slate-100 p-1 shrink-0 flex items-center justify-center overflow-hidden">
                  {!imgError && purchase.product.imageUrl ? (
                    <img
                      src={purchase.product.imageUrl}
                      alt={purchase.product.name}
                      onError={() => setImgError(true)}
                      className="w-full h-full object-contain mix-blend-multiply"
                    />
                  ) : (
                    <div className="w-full h-full rounded-lg flex items-center justify-center p-1 bg-black/90">
                      <img
                        src="/logo.png"
                        alt={purchase.product.brand || 'Sundhamata'}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Main Product Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700">
                      {purchase.product.brand}
                    </span>
                    <StatusBadge status={purchase.status} size="sm" />
                  </div>

                  <h2 className="text-[14.5px] sm:text-base font-black text-[#0F2042] tracking-tight leading-snug">
                    {purchase.product.name}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {[purchase.product.variant, purchase.product.color].filter(Boolean).join(' • ')}
                  </p>
                </div>
              </div>

              {/* Price & Date Strip */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block leading-none">
                    Amount Paid
                  </span>
                  <span className="text-[15px] font-extrabold text-[#0F2042] font-mono tabular-nums leading-tight mt-0.5 block">
                    {formatINR(purchase.amount)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block leading-none">
                    Purchased On
                  </span>
                  <span className="text-[11.5px] font-bold text-slate-700 leading-tight mt-0.5 block">
                    {formatLongDate(purchase.purchaseDate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 1: Product Details (Brand, Model, Variant, Colour, IMEI/SN) */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#0F2042] flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
                <Smartphone className="w-3 h-3 text-blue-700" />
                <span>Product Details</span>
              </h3>

              <div className="space-y-1 text-xs divide-y divide-slate-100">
                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <span className="text-slate-500 font-medium shrink-0">Brand</span>
                  <span className="font-semibold text-slate-900 text-right break-words">{purchase.product.brand || '—'}</span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-slate-500 font-medium shrink-0">Model</span>
                  <span className="font-semibold text-slate-900 text-right break-words">{purchase.product.model || purchase.product.name}</span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-slate-500 font-medium shrink-0">Variant</span>
                  <span className="font-semibold text-slate-900 text-right break-words">{purchase.product.variant || '—'}</span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-slate-500 font-medium shrink-0">Colour</span>
                  <span className="font-semibold text-slate-900 text-right break-words">{purchase.product.color || '—'}</span>
                </div>

                {/* IMEI or serial number, with copy */}
                {(purchase.product.imei || purchase.product.serialNumber) && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500 font-medium">IMEI / SN</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-bold text-slate-800 tabular-nums">
                        {purchase.product.imei || purchase.product.serialNumber}
                      </span>
                      <button
                        onClick={() => copyToClipboard(purchase.product.imei || purchase.product.serialNumber, 'identifier')}
                        className="p-0.5 text-slate-400 hover:text-blue-700 transition-colors cursor-pointer"
                        title="Copy IMEI / serial number"
                      >
                        {copiedKey === 'identifier' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Purchase & Payment Information */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#0F2042] flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
                <FileText className="w-3 h-3 text-blue-700" />
                <span>Purchase Information</span>
              </h3>

              <div className="space-y-1 text-xs divide-y divide-slate-100">
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-slate-500 font-medium">Invoice Number</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {purchase.invoiceNumber}
                    </span>
                    <button
                      onClick={() => copyToClipboard(purchase.invoiceNumber, 'invoice')}
                      className="p-0.5 text-slate-400 hover:text-blue-700 cursor-pointer"
                    >
                      {copiedKey === 'invoice' ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500 font-medium">Purchase Date</span>
                  <span className="font-medium text-slate-800">
                    {purchase.formattedDate || formatDate(purchase.purchaseDate)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500 font-medium">Payment Method</span>
                  <span className="font-semibold text-slate-800">
                    {purchase.paymentMethod}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500 font-medium">Payment Status</span>
                  <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/80 text-[10.5px]">
                    {purchase.paymentStatus}
                  </span>
                </div>

                {purchase.loyalty?.pointsRedeemed > 0 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500 font-medium">Points Redeemed</span>
                    <span className="font-bold text-amber-800 tabular-nums">
                      {purchase.loyalty.pointsRedeemed.toLocaleString('en-IN')} pts (−{formatINR(purchase.pricing.loyaltyDiscount)})
                    </span>
                  </div>
                )}

                {purchase.loyalty?.pointsEarned > 0 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500 font-medium">Points Earned</span>
                    <span className="font-bold text-emerald-700 tabular-nums">
                      +{purchase.loyalty.pointsEarned.toLocaleString('en-IN')} pts
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Warranty Coverage */}
            {purchase.warranty && (
              <div className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] space-y-1.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#0F2042] flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Brand Warranty</span>
                  </h3>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    {purchase.warranty.status}
                  </span>
                </div>

                <p className="text-xs font-bold text-slate-900 leading-tight">
                  {purchase.warranty.type}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
                  Valid until <span className="font-semibold text-slate-800">{purchase.warranty.validUntil}</span>. {purchase.warranty.coverage}
                </p>
              </div>
            )}

            {/* Section 4: Store & Service Counter */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#0F2042] flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
                <MapPin className="w-3 h-3 text-blue-700" />
                <span>Store</span>
              </h3>

              <div className="flex items-start justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-bold text-[#0F2042] leading-tight">
                    {store?.name}
                  </h4>
                  <p className="text-slate-500 text-[10.5px] mt-0.5">
                    {formatStoreAddress(store, { includeState: false })}
                  </p>
                  <p className="text-slate-400 text-[10px] mt-0.5 font-medium">
                    Billed by: {purchase.store?.salesExecutive}
                  </p>
                </div>

                <button
                  onClick={onOpenStoreInfo}
                  className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 font-bold text-[11px] hover:bg-blue-100 transition-colors inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <PhoneCall className="w-3 h-3" />
                  <span>Contact</span>
                </button>
              </div>
            </div>

            {/* Action: Download the bill uploaded by the store */}
            {purchase.bill && (
              <div className="pt-0.5 space-y-1">
                <button
                  onClick={downloadBill}
                  disabled={billDownloading}
                  className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-[#0F2042] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-[0.98] cursor-pointer disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5 text-blue-700" />
                  <span>{billDownloading ? 'Downloading...' : 'Download Bill'}</span>
                </button>
                <p className="text-[10.5px] text-slate-400 text-center truncate">
                  {purchase.bill.filename} • {formatFileSize(purchase.bill.size)}
                </p>
                {billError && <p className="text-[11px] text-rose-600 text-center">{billError}</p>}
              </div>
            )}

            {/* Action: Download Tax Invoice */}
            <div className="pt-0.5 pb-2">
              <button
                onClick={() => setShowInvoiceModal(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-[#0F2042] hover:bg-[#162B56] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-[0.98] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-200" />
                <span>Download Tax Invoice</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Tax Invoice Modal */}
      <InvoiceModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        purchase={purchase}
        customer={user}
      />
    </div>
  );
};
