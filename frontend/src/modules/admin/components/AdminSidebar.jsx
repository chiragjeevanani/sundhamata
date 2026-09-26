import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Sparkles,
  BarChart3,
  Settings,
  Plus,
  ExternalLink,
  LogOut,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { BrandLogo } from '../../user/components/BrandLogo';
import { useAdminAuth } from '../context/AdminAuthContext';

export const AdminSidebar = ({
  isMobileOpen,
  onMobileClose,
  isCollapsed = false,
  onToggleCollapse,
  onOpenLogoutModal,
}) => {
  const navigate = useNavigate();
  const { admin } = useAdminAuth();

  const navLinks = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/customers', label: 'Customers', icon: Users },
    { to: '/admin/purchases', label: 'Purchases', icon: ShoppingBag },
    { to: '/admin/loyalty', label: 'Loyalty Program', icon: Sparkles },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  const handleLinkClick = () => {
    if (isMobileOpen && onMobileClose) {
      onMobileClose();
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B1528] text-slate-300 border-r border-[#17253D] select-none">
      {/* Brand Header */}
      <div className={`h-14 border-b border-[#17253D] flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-black/90 p-0.5 ring-1 ring-slate-800 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                <img src="/logo.png" alt="Sundhamata Mobile" className="w-full h-full object-contain rounded-md" />
              </div>
              {/* Same wordmark as the customer app's BrandLogo (light variant) */}
              <div className="min-w-0 leading-none">
                <div className="flex items-baseline gap-1 whitespace-nowrap">
                  <span className="text-[13px] font-black text-white tracking-tight">SUNDHAMATA</span>
                  <span className="text-[10px] font-bold text-amber-400">MOBILE</span>
                </div>
                <span className="text-[8.5px] font-semibold tracking-[0.14em] uppercase text-slate-400 block truncate mt-1">
                  Store Management
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                title="Collapse sidebar (Ctrl+B)"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>

              {isMobileOpen && (
                <button
                  onClick={onMobileClose}
                  className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  aria-label="Close navigation drawer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="w-8 h-8 rounded-lg bg-black/90 p-0.5 ring-1 ring-slate-800 flex items-center justify-center shadow-xs hover:ring-2 hover:ring-amber-500/50 transition-all cursor-pointer overflow-hidden"
            title="Expand sidebar (Ctrl+B)"
          >
            <img src="/logo.png" alt="Sundhamata Mobile" className="w-full h-full object-contain rounded-md" />
          </button>
        )}
      </div>

      {/* Primary Action Button */}
      <div className={`py-3 ${isCollapsed ? 'px-2 flex justify-center' : 'px-3'}`}>
        {!isCollapsed ? (
          <button
            onClick={() => {
              navigate('/admin/purchases/new');
              handleLinkClick();
            }}
            className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Record Purchase</span>
          </button>
        ) : (
          <button
            onClick={() => {
              navigate('/admin/purchases/new');
              handleLinkClick();
            }}
            className="w-10 h-10 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-xs transition-all active:scale-[0.96] cursor-pointer group relative"
            title="Record Purchase"
            aria-label="Record Purchase"
          >
            <Plus className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1 text-xs">
        {navLinks.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={handleLinkClick}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg transition-colors ${
                  isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2'
                } ${
                  isActive
                    ? 'bg-blue-600/20 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 font-medium'
                }`
              }
            >
              <Icon className="w-4 h-4 text-blue-400 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer User Info */}
      <div className="p-2 border-t border-[#17253D] space-y-1.5">
        {!isCollapsed ? (
          <>
            <button
              onClick={() => {
                navigate('/home');
                handleLinkClick();
              }}
              className="w-full py-1.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium flex items-center justify-between transition-colors cursor-pointer"
            >
              <span>Customer App</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <div className="flex items-center justify-between pt-1 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-md bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center shrink-0">
                  {admin?.avatarInitials}
                </div>
                <div className="truncate">
                  <span className="text-xs font-medium text-slate-200 block truncate">
                    {admin?.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal block truncate">
                    {admin?.roleLabel || admin?.role}
                  </span>
                </div>
              </div>

              <button
                onClick={onOpenLogoutModal}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <button
              onClick={() => {
                navigate('/home');
                handleLinkClick();
              }}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              title="Open Customer App"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenLogoutModal}
              className="p-2 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>

            <button
              onClick={onToggleCollapse}
              className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/5 transition-colors cursor-pointer mt-1"
              title="Expand sidebar (Ctrl+B)"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Collapsible Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 h-screen sticky top-0 transition-all duration-300 ease-in-out select-none ${
          isCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={onMobileClose}
          />
          <div className="relative w-64 max-w-[80vw] h-full shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

