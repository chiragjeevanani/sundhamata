import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from '../components/BottomNav';
import { StoreContactDrawer } from '../components/StoreContactDrawer';
import { Smartphone, Monitor } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

export const UserLayout = () => {
  const location = useLocation();
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [deviceMode, setDeviceMode] = useState('mobile');

  // Ensure scroll is reset to absolute top on every navigation
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname]);

  const isLoginPage = location.pathname === '/login';


  return (
    <div className="min-h-screen bg-cream-100 flex flex-col justify-start items-center relative overflow-x-hidden selection:bg-brand-600 selection:text-white">
      {/* Desktop Ambient Brand Anchor */}
      <div className="hidden lg:flex fixed top-4 left-6 items-center gap-3 z-30 select-none">
        <BrandLogo size="md" />
      </div>

      {/* Desktop Helper Bar */}
      <div className="hidden lg:flex fixed top-4 right-6 items-center gap-2 z-30">
        <div className="bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-stone-200 shadow-2xs flex items-center gap-2 text-xs text-stone-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-stone-800 text-[11.5px]">Customer Mobile App</span>
          <span className="text-stone-300">|</span>
          <button
            onClick={() => setDeviceMode(deviceMode === 'mobile' ? 'desktop' : 'mobile')}
            className="text-brand-700 hover:text-brand-900 font-bold inline-flex items-center gap-1 cursor-pointer text-[11.5px]"
          >
            {deviceMode === 'mobile' ? (
              <>
                <Monitor className="w-3 h-3" />
                <span>Expand Shell</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3 h-3" />
                <span>Mobile Shell</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Responsive Mobile Shell Container */}
      <div
        className={`w-full bg-cream-50 min-h-screen transition-all duration-200 relative flex flex-col ${
          deviceMode === 'mobile'
            ? 'max-w-md sm:my-3 sm:min-h-[88vh] sm:rounded-2xl sm:border sm:border-stone-200/90 sm:shadow-[0_4px_24px_rgba(15,32,66,0.06)] sm:overflow-hidden'
            : 'max-w-2xl sm:my-3 sm:min-h-[88vh] sm:rounded-2xl sm:border sm:border-stone-200/90 sm:shadow-[0_4px_24px_rgba(15,32,66,0.06)] sm:overflow-hidden'
        }`}
      >
        {/* Page Content Container with subtle page transition and compact bottom padding */}
        <main className={`flex-1 flex flex-col ${isLoginPage ? 'pb-3' : 'pb-18'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="flex-1 flex flex-col"
            >
              <Outlet context={{ onOpenStoreInfo: () => setIsStoreOpen(true) }} />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile Bottom Navigation (Visible on authenticated pages) */}
        {!isLoginPage && <BottomNav />}
      </div>

      {/* Official Retail Store Contact Bottom Drawer */}
      <StoreContactDrawer
        isOpen={isStoreOpen}
        onClose={() => setIsStoreOpen(false)}
      />
    </div>
  );
};
