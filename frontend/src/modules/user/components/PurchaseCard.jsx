import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatINR, formatDate } from '../../../utils/formatters';
import { StatusBadge } from './StatusBadge';

export const PurchaseCard = ({ purchase }) => {
  const navigate = useNavigate();
  const [imageFailed, setImageFailed] = useState(false);

  const {
    id,
    formattedDate,
    amount,
    status,
    product,
  } = purchase;

  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.1 }}
      onClick={() => navigate(`/purchases/${id}`)}
      className="group bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,32,66,0.05)] transition-all cursor-pointer p-3 flex items-center gap-3"
    >
      {/* Product Image */}
      <div className="w-13 h-15 rounded-lg bg-slate-50 border border-slate-100 p-1 shrink-0 flex items-center justify-center overflow-hidden">
        {!imageFailed && product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            onError={() => setImageFailed(true)}
            className="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-150"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full rounded flex flex-col items-center justify-center text-white"
            style={{ backgroundColor: product.fallbackColor || '#1E3A5F' }}
          >
            <Smartphone className="w-4 h-4 opacity-80" />
            <span className="text-[6.5px] font-bold uppercase mt-0.5 tracking-wider opacity-90">
              {product.brand}
            </span>
          </div>
        )}
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-[13.5px] font-bold text-slate-900 tracking-tight leading-snug truncate group-hover:text-blue-700 transition-colors">
          {product.name}
        </h4>
        <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
          {[product.variant, product.color].filter(Boolean).join(' • ')}
        </p>
        <p className="text-[10.5px] text-slate-400 mt-1 font-medium">
          {formattedDate || formatDate(purchase.purchaseDate)}
        </p>
      </div>

      {/* Price & Status on Right */}
      <div className="text-right shrink-0 flex flex-col items-end gap-1.5 pl-2">
        <span className="text-[14px] font-extrabold text-[#0F2042] font-mono tabular-nums leading-none">
          {formatINR(amount)}
        </span>
        <div className="flex items-center gap-1">
          <StatusBadge status={status} size="sm" />
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </motion.div>
  );
};
