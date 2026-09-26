import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Printer, Download, CheckCircle2, XCircle } from 'lucide-react';
import { formatINR, formatLongDate } from '../../../utils/formatters';
import { useStoreInfo, formatStoreAddress } from '../hooks/useStoreInfo';
import { BrandLogo } from './BrandLogo';

export const InvoiceModal = ({ isOpen, onClose, purchase, customer }) => {
  const store = useStoreInfo();
  if (!isOpen || !purchase) return null;

  const isCancelled = purchase.status === 'Cancelled';
  const gstRate = purchase.pricing?.taxRatePercent ?? 18;

  // Printing (or "Save as PDF") shows only the invoice: see .invoice-print-root in index.css
  const handlePrint = () => {
    window.print();
  };

  // Rendered outside the app root so the print stylesheet can hide everything else
  return createPortal(
    <AnimatePresence>
      <div className="invoice-print-root fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 print:p-0">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs print:hidden"
        />

        {/* Invoice Modal Box */}
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="invoice-sheet relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 z-10 overflow-hidden flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:border-none print:rounded-none"
        >
          {/* Action Toolbar */}
          <div className="flex items-center justify-between px-5 py-3 bg-stone-50 border-b border-stone-200 print:hidden select-none">
            <span className="text-xs font-bold text-ink-900">
              Tax Invoice
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-brand-50 text-brand-800 text-xs font-semibold hover:bg-brand-100 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                onClick={onClose}
                aria-label="Close invoice"
                className="w-7 h-7 rounded-full bg-stone-200/70 hover:bg-stone-300 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Printable Invoice Body */}
          <div className="invoice-body p-6 overflow-y-auto space-y-5 text-stone-800 text-xs leading-normal">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-stone-200 pb-4">
              <div>
                <BrandLogo size="md" />
                <p className="text-[10.5px] text-stone-500 mt-2 max-w-[210px] leading-relaxed">
                  {store?.legalName || store?.name}
                  <br />
                  {formatStoreAddress(store, { includeState: false })}
                  <br />
                  GSTIN: <span className="font-mono font-semibold text-stone-800">{store?.gstin}</span>
                </p>
              </div>

              <div className="text-right">
                <span className="inline-block px-2 py-0.5 rounded bg-stone-100 font-bold text-[9.5px] uppercase tracking-wider text-stone-700 mb-1">
                  Original for Buyer
                </span>
                <h4 className="text-xs font-black text-stone-900 mt-0.5 tracking-tight">TAX INVOICE</h4>
                <p className="font-mono text-xs font-bold text-brand-800 mt-0.5 tabular-nums">
                  {purchase.invoiceNumber}
                </p>
                <p className="text-[10.5px] text-stone-500 mt-0.5">
                  Date: {formatLongDate(purchase.purchaseDate)}
                </p>
              </div>
            </div>

            {/* Customer Billed To */}
            <div className="grid grid-cols-2 gap-3 bg-stone-50 p-3 rounded-xl border border-stone-200/80">
              <div>
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Billed To
                </span>
                <p className="font-bold text-stone-900">{customer?.name}</p>
                <p className="text-stone-600 font-mono text-[11px] tabular-nums">{customer?.phone}</p>
                <p className="text-stone-500 text-[10.5px]">{customer?.email}</p>
              </div>
              <div>
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Payment Ref
                </span>
                <p className="text-stone-800 font-semibold">{purchase.paymentMethod}</p>
                <p className="font-mono text-[10px] text-stone-500 truncate tabular-nums">
                  {purchase.transactionId}
                </p>
                {isCancelled ? (
                  <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[10.5px] mt-1">
                    <XCircle className="w-3 h-3" />
                    <span>CANCELLED</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10.5px] mt-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>PAID</span>
                  </span>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200 text-[11px]">
                    <th className="p-2">Description</th>
                    <th className="p-2 text-center">HSN</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Taxable</th>
                    <th className="p-2 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <tr>
                    <td className="p-2">
                      <p className="font-bold text-stone-900">{purchase.product.name}</p>
                      <p className="text-[10.5px] text-stone-500">
                        {[purchase.product.variant, purchase.product.color].filter(Boolean).join(' • ')}
                      </p>
                      {purchase.product.imei1 && (
                        <p className="font-mono text-[10px] text-stone-500 mt-0.5 tabular-nums">
                          IMEI: {purchase.product.imei1}
                        </p>
                      )}
                      {purchase.product.serialNumber && (
                        <p className="font-mono text-[10px] text-stone-500 tabular-nums">
                          S/N: {purchase.product.serialNumber}
                        </p>
                      )}
                    </td>
                    <td className="p-2 text-center font-mono text-[10.5px] text-stone-600">8517</td>
                    <td className="p-2 text-center font-medium">1</td>
                    <td className="p-2 text-right font-mono text-stone-600 tabular-nums">
                      {formatINR(purchase.baseAmount)}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-stone-900 tabular-nums">
                      {formatINR(purchase.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Tax Summary Breakdown */}
              <div className="bg-stone-50/90 p-3 border-t border-stone-200 flex flex-col items-end gap-1">
                {purchase.pricing?.discount > 0 && (
                  <div className="w-44 flex justify-between text-[10.5px] text-stone-600">
                    <span>Discount:</span>
                    <span className="font-mono tabular-nums">−{formatINR(purchase.pricing.discount)}</span>
                  </div>
                )}
                {purchase.pricing?.loyaltyDiscount > 0 && (
                  <div className="w-44 flex justify-between text-[10.5px] text-stone-600">
                    <span>Points ({purchase.loyalty.pointsRedeemed}):</span>
                    <span className="font-mono tabular-nums">−{formatINR(purchase.pricing.loyaltyDiscount)}</span>
                  </div>
                )}
                <div className="w-44 flex justify-between text-[10.5px] text-stone-600">
                  <span>Taxable Value:</span>
                  <span className="font-mono tabular-nums">{formatINR(purchase.baseAmount)}</span>
                </div>
                <div className="w-44 flex justify-between text-[10.5px] text-stone-600">
                  <span>GST ({gstRate}%):</span>
                  <span className="font-mono tabular-nums">{formatINR(purchase.taxAmount)}</span>
                </div>
                <div className="w-44 flex justify-between text-xs font-black text-ink-900 pt-1 border-t border-stone-300">
                  <span>Grand Total:</span>
                  <span className="font-mono tabular-nums">{formatINR(purchase.amount)}</span>
                </div>
              </div>
            </div>

            {/* Official Store Footer & Seal */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-200 text-[10px] text-stone-500">
              <div>
                <p className="font-semibold text-stone-700">Thank you for shopping at Sundhamata Mobile!</p>
                <p>Helpline: {store?.supportPhone || store?.phone}</p>
              </div>

              <div className="text-right">
                <div className="inline-block px-2.5 py-1 rounded border border-brand-200 bg-brand-50/50 text-[8.5px] font-bold text-brand-950 uppercase tracking-widest text-center">
                  SUNDHAMATA MOBILE
                  <br />
                  <span className="text-[7.5px] text-brand-700">AUTHORIZED INVOICE</span>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Bottom Actions */}
          <div className="p-3.5 bg-stone-50 border-t border-stone-100 flex items-center gap-2.5 print:hidden">
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-ink-900 text-white text-xs font-bold hover:bg-ink-800 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
