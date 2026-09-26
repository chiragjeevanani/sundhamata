import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, MessageSquare, MapPin, Clock, ExternalLink } from 'lucide-react';
import { useStoreInfo, formatStoreAddress } from '../hooks/useStoreInfo';

export const StoreContactDrawer = ({ isOpen, onClose }) => {
  const store = useStoreInfo();
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        />

        {/* Drawer content */}
        <motion.div
          initial={{ y: '100%', opacity: 0.95 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 z-10 overflow-hidden max-h-[88vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 select-none">
            <div>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-brand-700 block">
                Official Retail Store
              </span>
              <h3 className="text-sm font-extrabold text-[#0F2042]">
                {store?.name}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-slate-200/70 hover:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Details Content */}
          <div className="p-4 space-y-3.5 overflow-y-auto">
            {/* Quick Actions (Call & WhatsApp) */}
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={`tel:${store?.phone ?? ''}`}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#0F2042] hover:bg-[#162B56] text-white text-xs font-bold transition-colors shadow-2xs active:scale-[0.98]"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Call Store</span>
              </a>

              <a
                href={`https://wa.me/${(store?.whatsapp ?? '').replace(/\D/g, '')}?text=Hello%20Sundhamata%20Mobile,%20I%20need%20assistance%20with%20my%20recent%20purchase`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-2xs active:scale-[0.98]"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>

            {/* Address Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 text-brand-700 mt-0.5">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-800">
                    Store Location
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                    {formatStoreAddress(store)}
                  </p>
                  <a
                    href={store?.googleMapsUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-900 mt-1.5"
                  >
                    <span>View on Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Timings & Support */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2.5 text-xs text-slate-700">
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="font-semibold text-slate-900 block">Store Hours</span>
                  <span className="text-slate-500">{store?.hours}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/60 text-xs text-slate-500">
                <span>GSTIN: </span>
                <span className="font-mono font-semibold text-slate-700 tabular-nums">{store?.gstin}</span>
              </div>
            </div>
          </div>

          {/* Footer close */}
          <div className="p-3 bg-slate-50 border-t border-slate-100">
            <button
              onClick={onClose}
              className="w-full py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
