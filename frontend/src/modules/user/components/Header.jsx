import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, User, PhoneCall } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../context/AuthContext';

export const Header = ({
  title,
  subtitle,
  showBack = false,
  backTo = -1,
  rightAction,
  onOpenStoreInfo,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isHome = location.pathname === '/home';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 select-none">
      <div className="max-w-md mx-auto px-3.5 sm:px-4 h-12 flex items-center justify-between gap-2.5">
        {showBack ? (
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => (typeof backTo === 'string' ? navigate(backTo) : navigate(-1))}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-700 hover:bg-stone-100 active:scale-95 transition-all -ml-1 cursor-pointer"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4.5 h-4.5 text-ink-900" />
            </button>
            <div className="min-w-0 leading-tight">
              <h1 className="text-xs sm:text-sm font-bold text-ink-900 tracking-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[10px] font-mono text-stone-500 font-medium truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <BrandLogo size="sm" showTagline={false} />
          </div>
        )}

        {/* Right Action / Profile Icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {rightAction ? (
            rightAction
          ) : isHome ? (
            <div className="flex items-center gap-1.5">
              {onOpenStoreInfo && (
                <button
                  onClick={onOpenStoreInfo}
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200/80 text-stone-700 text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <PhoneCall className="w-3 h-3 text-[#B55B1F]" />
                  <span>Store</span>
                </button>
              )}

              <button
                onClick={() => navigate('/profile')}
                className="flex items-center gap-1.5 p-0.5 pl-2 rounded-full bg-stone-50 hover:bg-stone-100 border border-stone-200/80 transition-all active:scale-95 cursor-pointer"
                aria-label="View Customer Profile"
              >
                <span className="text-[11px] font-bold text-stone-800 max-w-[65px] truncate">
                  {user?.name ? user.name.split(' ')[0] : ''}
                </span>
                <div className="w-5.5 h-5.5 rounded-full bg-ink-900 text-white flex items-center justify-center text-[9px] font-bold ring-1 ring-white">
                  {user?.name
                    ? user.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                    : 'RS'}
                </div>
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/profile')}
              className="w-7 h-7 rounded-full bg-stone-50 hover:bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-700 transition-transform active:scale-95 cursor-pointer"
              aria-label="Account Profile"
            >
              <User className="w-3.5 h-3.5 text-ink-900" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
