import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  Plus,
  User,
  Settings,
  LogOut,
  ExternalLink,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { adminNotificationService } from '../../../services/adminNotificationService';

export const AdminHeader = ({
  isSidebarCollapsed,
  onToggleSidebarCollapse,
  onMobileMenuToggle,
  onOpenSearchModal,
  onOpenNotifications,
  onOpenLogoutModal,
}) => {
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const notifs = await adminNotificationService.getNotifications();
        const unread = notifs.filter((n) => !n.read).length;
        setUnreadCount(unread);
      } catch (e) {
        // ignore
      }
    };
    fetchUnread();
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 h-14 flex items-center justify-between px-3 sm:px-6 select-none">
      {/* Left Section: Sidebar Toggle Buttons & Global Search */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-lg">
        {/* Mobile Hamburger */}
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Desktop Sidebar Toggle */}
        <button
          onClick={onToggleSidebarCollapse}
          className="hidden lg:flex p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          aria-label="Toggle sidebar collapse"
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpen className="w-4.5 h-4.5 text-slate-600" />
          ) : (
            <PanelLeftClose className="w-4.5 h-4.5 text-slate-600" />
          )}
        </button>

        {/* Global Search Bar Trigger */}
        <button
          onClick={onOpenSearchModal}
          className="flex-1 max-w-sm sm:max-w-md py-1.5 px-3 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 rounded-lg text-left text-xs text-slate-400 flex items-center justify-between transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0" />
            <span className="truncate font-normal">Search customer, mobile, invoice...</span>
          </div>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-400 font-medium shadow-2xs">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right Section: Actions & Admin Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Quick Record Purchase Button */}
        <button
          onClick={() => navigate('/admin/purchases/new')}
          className="hidden sm:inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-2xs active:scale-[0.98] transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Record Purchase</span>
        </button>

        {/* Notifications Icon Button */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="View notifications"
        >
          <Bell className="w-4.5 h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white" />
          )}
        </button>

        {/* Admin Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setProfileDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 pl-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-md bg-[#0B1528] text-white font-medium text-xs flex items-center justify-center">
              {admin?.avatarInitials}
            </div>
            <div className="hidden md:block text-left leading-tight">
              <span className="text-xs font-semibold text-slate-800 block truncate max-w-[120px]">
                {admin?.name}
              </span>
              <span className="text-[10px] text-slate-500 font-normal block truncate">
                {admin?.roleLabel || admin?.role}
              </span>
            </div>
            <ChevronDown className="hidden md:block w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Dropdown Menu */}
          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 z-40 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="font-semibold text-slate-900 truncate">
                  {admin?.name}
                </p>
                <p className="text-[11px] text-slate-500 font-normal truncate">
                  {admin?.email}
                </p>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    navigate('/admin/settings');
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer font-medium"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Store Settings</span>
                </button>

                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    navigate('/home');
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-700 flex items-center justify-between cursor-pointer font-medium"
                >
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span>Customer App</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>

              <div className="pt-1 border-t border-slate-100">
                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    onOpenLogoutModal();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-rose-50 text-rose-700 flex items-center gap-2 cursor-pointer font-medium"
                >
                  <LogOut className="w-4 h-4 text-rose-600" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
