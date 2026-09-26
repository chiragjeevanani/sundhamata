import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { purchaseService } from '../../../services/purchaseService';
import { formatFileSize, saveBlob } from '../../../utils/billFile';

/**
 * Shows the bill the store uploaded for a purchase (only offered when one exists).
 * Images and PDFs are shown inside the app; other files (Word, Excel) can be downloaded.
 */
export const BillViewerModal = ({ isOpen, ...props }) =>
  createPortal(<AnimatePresence>{isOpen && <Viewer {...props} />}</AnimatePresence>, document.body);

const kindOf = (bill) => {
  const type = bill?.contentType || '';
  if (type.startsWith('image/') && !/hei[cf]/.test(type)) return 'image'; // HEIC does not render in most browsers
  if (type === 'application/pdf') return 'pdf';
  return 'file';
};

// Mounted only while open, so every opening fetches a fresh copy.
const Viewer = ({ onClose, purchase }) => {
  const bill = purchase.bill;
  const kind = kindOf(bill);
  const [file, setFile] = useState(null); // { blob, url }
  const [error, setError] = useState('');

  useEffect(() => {
    let url = null;
    let active = true;
    purchaseService
      .downloadBill(purchase.id)
      .then((data) => {
        if (!active) return;
        const blob = new Blob([data], { type: bill.contentType || data.type });
        url = URL.createObjectURL(blob);
        setFile({ blob, url });
      })
      .catch((err) => active && setError(err.message || 'Could not load the bill. Please try again.'));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [purchase.id, bill.contentType]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const download = () => file && saveBlob(file.blob, bill.filename);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[60] bg-stone-900/70 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Store bill"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg h-[92vh] sm:h-[85vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Title bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 bg-stone-50 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-ink-900">Store Bill</div>
            <div className="text-[10.5px] text-stone-500 truncate">
              {bill.filename} • {formatFileSize(bill.size)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-200/70 hover:bg-stone-300 flex items-center justify-center text-stone-700 cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-stone-100 flex items-center justify-center overflow-auto">
          {error ? (
            <p className="px-6 text-center text-xs text-rose-600">{error}</p>
          ) : !file ? (
            <Loader2 className="w-6 h-6 text-brand-600 animate-spin" aria-label="Loading bill" />
          ) : kind === 'image' ? (
            <img src={file.url} alt={`Bill ${bill.filename}`} className="max-w-full max-h-full object-contain" />
          ) : kind === 'pdf' ? (
            <iframe src={file.url} title={`Bill ${bill.filename}`} className="w-full h-full bg-white" />
          ) : (
            <div className="px-8 text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-white border border-stone-200 flex items-center justify-center">
                <FileText className="w-7 h-7 text-brand-600" />
              </div>
              <p className="text-xs font-bold text-stone-800">{bill.filename}</p>
              <p className="text-[11px] text-stone-500">
                This file can't be previewed here. Download it to open it on your phone.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-stone-200 flex items-center gap-2 shrink-0 bg-white">
          <button
            onClick={download}
            disabled={!file}
            className="flex-1 py-2.5 rounded-xl bg-ink-900 hover:bg-ink-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            <Download className="w-3.5 h-3.5" />
            Download Bill
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
        {kind === 'pdf' && file && (
          <p className="sm:hidden px-4 pb-3 -mt-1 text-[10.5px] text-stone-400 text-center bg-white">
            PDF not showing? Tap Download Bill to open it.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};
