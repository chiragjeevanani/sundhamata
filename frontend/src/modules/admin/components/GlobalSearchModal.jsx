import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  User,
  ShoppingBag,
  FileText,
  ArrowRight,
  X,
  Sparkles,
} from 'lucide-react';
import { customerService } from '../../../services/customerService';
import { adminPurchaseService } from '../../../services/adminPurchaseService';
import { formatINR } from '../../../utils/formatters';

export const GlobalSearchModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [purchases, setPurchases] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setQuery('');
      setCustomers([]);
      setPurchases([]);
    }
  }, [isOpen]);

  // Keyboard shortcut: close on ESC
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Live search debounced
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setCustomers([]);
      setPurchases([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [cList, pList] = await Promise.all([
          customerService.searchCustomers(query),
          adminPurchaseService.getPurchases({ search: query, limit: 4 }),
        ]);
        setCustomers(cList.slice(0, 4));
        setPurchases(pList.slice(0, 4));
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (path) => {
    onClose();
    navigate(path);
  };

  if (!isOpen) return null;

  const hasResults = customers.length > 0 || purchases.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 sm:pt-20 bg-stone-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-xl bg-white rounded-xl border border-stone-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Top Input Header */}
        <div className="p-3.5 sm:p-4 border-b border-stone-200/90 flex items-center gap-2.5">
          <Search className="w-4.5 h-4.5 text-stone-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer name, mobile (+91), invoice number..."
            className="flex-1 text-sm font-normal text-stone-900 placeholder:text-stone-400 focus:outline-hidden"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-stone-400 hover:text-stone-600 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-[10px] font-mono font-medium text-stone-500">
            ESC
          </span>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-xs text-stone-400 flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-stone-300 border-t-brand-600 rounded-full animate-spin" />
              <span>Searching customer records...</span>
            </div>
          ) : !query.trim() ? (
            <div className="py-8 text-center space-y-1">
              <p className="text-xs font-semibold text-stone-700">Quick Store Search</p>
              <p className="text-xs text-stone-400">
                Type a customer name, 10-digit mobile number, or invoice code (e.g. SM-2026).
              </p>
            </div>
          ) : !hasResults ? (
            <div className="py-8 text-center space-y-1">
              <p className="text-xs font-semibold text-stone-700">No records found</p>
              <p className="text-xs text-stone-400">
                No matching customer or invoice found for "{query}".
              </p>
            </div>
          ) : (
            <>
              {/* Customers Section */}
              {customers.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 px-1">
                    <User className="w-3.5 h-3.5 text-brand-600" />
                    <span>Customers ({customers.length})</span>
                  </div>
                  <div className="space-y-1">
                    {customers.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelect(`/admin/customers/${c.id}`)}
                        className="p-2.5 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-200/80 transition-all flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-md bg-stone-800 text-white flex items-center justify-center text-xs font-medium shrink-0">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-medium text-stone-900 group-hover:text-brand-700 transition-colors truncate">
                              {c.name}
                            </h4>
                            <p className="text-xs text-stone-400 font-normal">
                              {c.phone || c.mobile}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-right">
                          <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 tabular-nums">
                            {c.loyaltyPoints || 0} pts
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-600 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Purchases Section */}
              {purchases.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 px-1">
                    <ShoppingBag className="w-3.5 h-3.5 text-brand-600" />
                    <span>Invoices & Purchases ({purchases.length})</span>
                  </div>
                  <div className="space-y-1">
                    {purchases.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelect(`/admin/purchases/${p.id}`)}
                        className="p-2.5 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-200/80 transition-all flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-medium text-stone-900 group-hover:text-brand-700 transition-colors">
                                {p.invoiceNumber}
                              </span>
                              <span className="text-xs text-stone-400 font-normal">
                                • {p.customerName}
                              </span>
                            </div>
                            <p className="text-xs text-stone-500 font-normal truncate">
                              {p.product?.name}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-right">
                          <span className="text-xs font-medium text-stone-900 tabular-nums">
                            {formatINR(p.amount)}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-600 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-stone-50/80 border-t border-stone-200/80 flex items-center justify-between text-xs text-stone-400">
          <span>Search customers & purchases</span>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-700 font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>

    </div>
  );
};
