import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  ShoppingBag,
  Sparkles,
  HelpCircle,
  MapPin,
  ShieldCheck,
  FileCheck,
  LogOut,
  ChevronRight,
  X,
  Pencil,
  Mail,
  Cake,
  Heart,
  User,
  Home,
  TicketPercent,
  Gift,
} from 'lucide-react';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useStoreInfo } from '../hooks/useStoreInfo';
import { GENDER_LABELS, formatCalendarDate } from '../../../utils/formatters';
import { PhotoEditor } from '../../../components/PhotoEditor';
import { VerifiedTick } from '../../../components/CustomerAvatar';
import { userService } from '../../../services/userService';
import { describeDiscount, offerService } from '../../../services/offerService';

export const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const store = useStoreInfo();
  const { onOpenStoreInfo } = useOutletContext() || {};

  // Keep profile details (e.g. loyalty points) current with the server
  useEffect(() => {
    refreshUser().catch(() => {});
  }, [refreshUser]);

  const [loggingOut, setLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
      setShowLogoutConfirm(false);
    }
  };

  const name = user?.name || '';
  const phone = user?.phone || '';
  const email = user?.email || '';
  const interest = user?.interest || '';
  const points = user?.loyaltyPoints ?? 0;

  const fullAddress = [user?.address, user?.city, user?.pincode].filter(Boolean).join(', ');
  const details = [
    { icon: Mail, label: 'Email', value: email },
    { icon: Cake, label: 'Date of Birth', value: formatCalendarDate(user?.dob) },
    { icon: User, label: 'Gender', value: GENDER_LABELS[user?.gender] },
    { icon: Heart, label: 'Anniversary', value: formatCalendarDate(user?.anniversaryDate) },
    { icon: Home, label: 'Address', value: fullAddress },
  ];

  const [photoError, setPhotoError] = useState('');
  // Welcome voucher still locked behind a 100% complete profile
  const [lockedOffer, setLockedOffer] = useState(null);
  useEffect(() => {
    let active = true;
    offerService
      .getWelcomeOffer()
      .then((data) => {
        const locked = data.vouchers?.find((v) => v.status === 'locked');
        if (active) setLockedOffer(locked ? { voucher: locked, profile: data.profile } : null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);
  const updatePhoto = async (action) => {
    setPhotoError('');
    await action();
    await refreshUser().catch(() => {});
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Header */}
      <Header />

      <div className="p-3.5 sm:p-4 space-y-3">
        {/* Title */}
        <h1 className="text-xl font-black text-ink-900 tracking-tight">
          My Profile
        </h1>

        {/* Customer Profile Card */}
        <div className="bg-white rounded-xl p-3 border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] flex items-center gap-3">
          <PhotoEditor
            customer={user}
            className="w-14 h-14 rounded-2xl"
            textClassName="text-base"
            onUpload={(blob) => updatePhoto(() => userService.uploadPhoto(blob))}
            onRemove={() => updatePhoto(() => userService.removePhoto())}
            onError={setPhotoError}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[14px] font-bold text-stone-900 truncate">
                {name}
              </h2>
              {user?.isVerified && <VerifiedTick className="w-4 h-4" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-stone-500 font-medium">
              <span className="font-mono tabular-nums">{phone}</span>
              {(email || interest) && <span>•</span>}
              {email ? (
                <span className="text-stone-400 truncate">{email}</span>
              ) : interest ? (
                <span className="text-brand-700 font-medium">{interest}</span>
              ) : null}
            </div>
            {user?.isVerified ? (
              <p className="text-[10.5px] font-semibold text-[#1A8CD8] mt-0.5">Verified customer</p>
            ) : (
              <p className="text-[10.5px] text-stone-400 mt-0.5 leading-snug">
                Buy anything at the store to get your <span className="font-semibold text-[#1A8CD8]">blue tick</span>
              </p>
            )}
            {photoError && <p className="text-[10.5px] text-rose-600 mt-0.5">{photoError}</p>}
            {!user?.photoUrl && !photoError && (
              <p className="text-[10.5px] text-stone-400">Add a photo so the store team can recognise you</p>
            )}
          </div>

          <button
            onClick={() => navigate('/profile/edit')}
            className="shrink-0 px-2.5 py-1.5 rounded-lg border border-brand-200 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </div>

        {/* Complete the profile → another offer */}
        {lockedOffer && (
          <button
            onClick={() => navigate('/profile/edit?offer=1')}
            className="w-full text-left rounded-xl bg-brand-50 border border-brand-200/80 p-3 space-y-2 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                <Gift className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 text-[12px] leading-snug">
                <p className="font-bold text-ink-900">
                  Profile {lockedOffer.profile.percent}% complete
                </p>
                <p className="text-stone-600">
                  Complete it to unlock {lockedOffer.voucher.discount.type === 'free_item' ? describeDiscount(lockedOffer.voucher.discount) : lockedOffer.voucher.title}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-brand-700 shrink-0" />
            </div>
            <div className="h-2 rounded-full bg-white border border-brand-100 overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${lockedOffer.profile.percent}%` }} />
            </div>
          </button>
        )}

        {/* Personal Details */}
        <div className="bg-white rounded-xl border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] overflow-hidden">
          <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-stone-600">
              Personal Details
            </h3>
            <button
              onClick={() => navigate('/profile/edit')}
              className="text-[10.5px] font-bold text-brand-700 hover:text-brand-800 cursor-pointer"
            >
              Edit Profile
            </button>
          </div>

          <dl className="divide-y divide-stone-100 text-xs">
            {details.map(({ icon: Icon, label, value }) => (
              <div key={label} className="px-3 py-2 flex items-start gap-2.5">
                <div className="w-6.5 h-6.5 rounded bg-cream-100 text-brand-700 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <dt className="text-[10px] font-semibold text-stone-400 leading-tight">{label}</dt>
                  <dd className={`leading-snug break-words ${value ? 'font-semibold text-stone-800' : 'text-stone-400 italic'}`}>
                    {value || 'Not added'}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        {/* Section 2: My Account Shortcuts */}
        <div className="bg-white rounded-xl border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] overflow-hidden">
          <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
            <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-stone-600">
              My Account
            </h3>
          </div>

          <div className="divide-y divide-stone-100 text-xs">
            {/* Purchase History */}
            <button
              onClick={() => navigate('/purchases')}
              className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6.5 h-6.5 rounded bg-brand-50 text-brand-700 flex items-center justify-center">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-stone-800 group-hover:text-brand-700 transition-colors">
                  Purchase History
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Loyalty Points */}
            <button
              onClick={() => navigate('/loyalty')}
              className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6.5 h-6.5 rounded bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
                </div>
                <div>
                  <span className="font-semibold text-stone-800 group-hover:text-amber-700 transition-colors block leading-tight">
                    Loyalty Points
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold font-mono">
                    {points.toLocaleString('en-IN')} Points Available
                  </span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* My Coupons (welcome offer etc.) */}
            <button
              onClick={() => navigate('/coupons')}
              className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6.5 h-6.5 rounded bg-brand-50 text-brand-700 flex items-center justify-center">
                  <TicketPercent className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-stone-800 group-hover:text-brand-700 transition-colors">
                  My Coupons
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Help & Support */}
            <button
              onClick={onOpenStoreInfo}
              className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6.5 h-6.5 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <HelpCircle className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-stone-800 group-hover:text-emerald-700 transition-colors">
                  Help & Support
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Store Information */}
            <button
              onClick={onOpenStoreInfo}
              className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6.5 h-6.5 rounded bg-amber-50 text-amber-700 flex items-center justify-center">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-stone-800 group-hover:text-amber-700 transition-colors block leading-tight">
                    Store Information
                  </span>
                  <span className="text-[9.5px] text-stone-400">
                    {[store?.city, store?.state].filter(Boolean).join(', ')}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Privacy Policy */}
            <button
              onClick={() => setActiveModal('privacy')}
              className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6.5 h-6.5 rounded bg-stone-100 text-stone-700 flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-stone-800">
                  Privacy Policy
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            </button>

            {/* Terms & Conditions */}
            <button
              onClick={() => setActiveModal('terms')}
              className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6.5 h-6.5 rounded bg-stone-100 text-stone-700 flex items-center justify-center">
                  <FileCheck className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-stone-800">
                  Terms & Conditions
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
            </button>
          </div>
        </div>

        {/* Bottom Log Out Section */}
        <div className="pt-0.5 pb-2">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full py-2 px-3 rounded-xl border border-rose-200/80 bg-rose-50/50 hover:bg-rose-100/60 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-600" />
            <span>Log Out</span>
          </button>
        </div>
      </div>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="w-full max-w-xs bg-white rounded-xl p-4 border border-stone-200 shadow-xl space-y-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-stone-900">
                Log out of Sundhamata Mobile?
              </h4>
              <p className="text-[11px] text-stone-500 mt-0.5 font-normal">
                You will need to verify your phone number to access your purchases again.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                disabled={loggingOut}
                onClick={handleLogout}
                className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                {loggingOut ? 'Logging out...' : 'Log Out'}
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-1.5 rounded-lg border border-stone-300 text-stone-700 font-bold text-xs hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Policy Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-xl p-4 border border-stone-200 shadow-xl space-y-2.5 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-1.5 border-b border-stone-100">
              <h4 className="text-xs font-bold text-stone-900">
                {activeModal === 'privacy' ? 'Customer Privacy Policy' : 'Terms & Conditions'}
              </h4>
              <button
                onClick={() => setActiveModal(null)}
                className="w-6 h-6 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-y-auto text-[11px] text-stone-600 space-y-2 leading-relaxed pr-1 font-normal">
              {activeModal === 'privacy' ? (
                <>
                  <p>
                    At Sundhamata Mobile, customer data privacy is our utmost priority. Mobile numbers and purchase records are stored strictly for billing, warranty verification, and customer identification purposes.
                  </p>
                  <p>
                    Your contact information will never be shared with third parties. All device IMEIs and serial numbers are linked directly to GST tax invoices generated at our retail store in Narol, Ahmedabad.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    All electronic goods sold through Sundhamata Mobile carry manufacturer brand warranties as specified on official retail tax invoices.
                  </p>
                  <p>
                    Invoices stored in this customer portal are valid proof of purchase across all authorized service centers (Samsung, Apple, OnePlus) in India. Physical verification of IMEI may be requested at the time of repair.
                  </p>
                </>
              )}
            </div>
            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-1.5 rounded-lg bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
