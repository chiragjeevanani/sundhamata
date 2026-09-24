import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  ShoppingBag,
  User,
  Sparkles,
  AlertTriangle,
  X,
} from 'lucide-react';
import { adminNotificationService } from '../../../services/adminNotificationService';

export const NotificationsDrawer = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const data = await adminNotificationService.getNotifications();
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    const updated = await adminNotificationService.markAllAsRead();
    setNotifications(updated);
  };

  const handleClickItem = async (item) => {
    if (!item.read) {
      await adminNotificationService.markAsRead(item.id);
    }
    onClose();
    if (item.link) {
      navigate(item.link);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-2xs">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-label="Close notifications"
      />

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        className="relative z-10 w-full max-w-sm bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleMarkAllRead}
              className="p-1.5 text-slate-500 hover:text-blue-700 text-xs font-semibold flex items-center gap-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="text-[11px]">Mark read</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No notifications at this time.
            </div>
          ) : (
            notifications.map((item) => {
              const isPurchase = item.type === 'purchase';
              const isCustomer = item.type === 'customer';
              const isLoyalty = item.type === 'loyalty';

              return (
                <div
                  key={item.id}
                  onClick={() => handleClickItem(item)}
                  className={`p-3 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 ${
                    item.read
                      ? 'hover:bg-slate-50 opacity-80'
                      : 'bg-blue-50/40 hover:bg-blue-50/70'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isPurchase
                        ? 'bg-blue-100 text-blue-700'
                        : isCustomer
                        ? 'bg-emerald-100 text-emerald-700'
                        : isLoyalty
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isPurchase ? (
                      <ShoppingBag className="w-3.5 h-3.5" />
                    ) : isCustomer ? (
                      <User className="w-3.5 h-3.5" />
                    ) : isLoyalty ? (
                      <Sparkles className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4
                        className={`text-xs font-bold truncate ${
                          item.read ? 'text-slate-700' : 'text-slate-900'
                        }`}
                      >
                        {item.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {item.time}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-slate-500 leading-snug line-clamp-2">
                      {item.message}
                    </p>
                  </div>

                  {!item.read && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
};
