import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Sparkles, User } from 'lucide-react';
import { motion } from 'framer-motion';

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      path: '/home',
      isActive: location.pathname === '/home',
    },
    {
      id: 'purchases',
      label: 'Purchases',
      icon: ShoppingBag,
      path: '/purchases',
      isActive:
        location.pathname.startsWith('/purchases') &&
        location.pathname !== '/purchases/new',
    },
    {
      id: 'loyalty',
      label: 'Loyalty',
      icon: Sparkles,
      path: '/loyalty',
      isActive: location.pathname === '/loyalty',
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      path: '/profile',
      isActive: location.pathname === '/profile',
    },
  ];


  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <div className="w-full max-w-md pointer-events-auto">
        <nav
          aria-label="Bottom Navigation"
          className="bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-1px_6px_rgba(15,32,66,0.04)] px-4 pt-1 pb-1.5 sm:pb-2 flex items-center justify-around select-none"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.isActive;

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`relative flex-1 py-0.5 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  active ? 'text-[#0F2042]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {/* Active Indicator Top Notch */}
                {active && (
                  <motion.div
                    layoutId="navActiveTopLine"
                    className="absolute -top-1 w-5 h-0.5 rounded-full bg-[#1E40AF]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}

                <div className="relative">
                  <Icon
                    className={`w-4.5 h-4.5 transition-transform duration-150 ${
                      active ? 'stroke-[2.2] text-[#1E40AF]' : 'stroke-[1.8]'
                    }`}
                  />
                </div>

                <span
                  className={`text-[9.5px] tracking-tight leading-none ${
                    active ? 'font-bold text-[#0F2042]' : 'font-medium text-slate-500'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
