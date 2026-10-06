import React, { useState, useEffect } from 'react';
import { Gift, Headphones, Save, Smartphone } from 'lucide-react';
import { adminSettingsService } from '../../../services/adminSettingsService';
import { AppStylesSettings } from '../components/AppStylesSettings';
import { useToast } from '../context/ToastContext';

export const SettingsPage = () => {
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Store Info
  const [storeName, setStoreName] = useState('');
  const [tagline, setTagline] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Loyalty Settings
  const [pointsPerHundred, setPointsPerHundred] = useState(1);
  const [rupeeValuePerPoint, setRupeeValuePerPoint] = useState(1.0);
  const [minRedeemPoints, setMinRedeemPoints] = useState(0);
  const [theme, setTheme] = useState(null);

  // Welcome vouchers new app users unlock on registering (values as typed in the form)
  const [vouchers, setVouchers] = useState({
    enabled: true,
    validityDays: '30',
    glass: { enabled: true, unlock: 'register', code: 'WELCOME6D', itemName: '6D Toughened Glass', value: '299' },
    accessories: { enabled: true, unlock: 'profile', code: 'SAVE200', amount: '200', minBill: '2000' },
  });
  const setVoucherField = (group, field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setVouchers((prev) => (group ? { ...prev, [group]: { ...prev[group], [field]: value } } : { ...prev, [field]: value }));
  };

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const s = await adminSettingsService.getSettings();
        setStoreName(s.storeName || 'Sundhamata Mobile');
        setTagline(s.tagline || 'Smart Phones Smart People');
        setGstin(s.gstin || '08AABCS1429P1Z5');
        setAddress(s.address || '');
        setCity(s.city || '');
        setStateName(s.state || '');
        setPincode(s.pincode || '');
        setPhone(s.phone || '+91 98290 12345');
        setEmail(s.email || 'care@sundhamatamobile.com');

        setPointsPerHundred(s.loyalty?.pointsPerHundred ?? 1);
        setRupeeValuePerPoint(s.loyalty?.rupeeValuePerPoint ?? 1.0);
        setMinRedeemPoints(s.loyalty?.minRedeemPoints ?? 0);
        setTheme(s.theme ?? null);
        const v = s.offers?.welcomeVouchers;
        if (v) {
          setVouchers({
            enabled: v.enabled,
            validityDays: String(v.validityDays),
            glass: { ...v.glass, value: String(v.glass.value) },
            accessories: { ...v.accessories, amount: String(v.accessories.amount), minBill: String(v.accessories.minBill) },
          });
        }
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminSettingsService.updateSettings({
        storeName,
        tagline,
        gstin,
        address,
        city,
        state: stateName,
        pincode,
        phone,
        email,
        loyalty: {
          pointsPerHundred: Number(pointsPerHundred),
          rupeeValuePerPoint: Number(rupeeValuePerPoint),
          minRedeemPoints: Number(minRedeemPoints) || 0,
        },
        offers: {
          welcomeVouchers: {
            enabled: vouchers.enabled,
            validityDays: Number(vouchers.validityDays) || 30,
            glass: {
              enabled: vouchers.glass.enabled,
              unlock: vouchers.glass.unlock,
              code: vouchers.glass.code.trim(),
              itemName: vouchers.glass.itemName.trim(),
              value: Number(vouchers.glass.value) || 0,
            },
            accessories: {
              enabled: vouchers.accessories.enabled,
              unlock: vouchers.accessories.unlock,
              code: vouchers.accessories.code.trim(),
              amount: Number(vouchers.accessories.amount) || 0,
              minBill: Number(vouchers.accessories.minBill) || 0,
            },
          },
        },
      });

      showSuccess('Settings Saved', 'Store details updated.');
    } catch (err) {
      showError('Error', err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-xs text-stone-400">Loading settings...</div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Store Settings</h1>
          <p className="text-xs text-stone-500 mt-0.5">Configure store branding, contact parameters, loyalty engine ratios, and app colours.</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl border border-stone-200/80 shadow-2xs divide-y divide-stone-100 overflow-hidden">
        {/* Store Information */}
        <div className="p-5 sm:p-6 space-y-4 text-xs">
          <div>
            <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">Store Details</h3>
            <p className="text-xs text-stone-400 font-normal">Legal store identity, physical location, and invoice branding</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">Store Name</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-normal text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="font-medium text-stone-700 block">Store Address (street / area)</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>


            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">State</label>
              <input
                type="text"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">Pincode</label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">GSTIN / Tax ID</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-mono text-xs uppercase text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Loyalty Program Rules */}
        <div className="p-5 sm:p-6 space-y-4 text-xs">
          <div>
            <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">Loyalty Engine Configuration</h3>
            <p className="text-xs text-stone-400 font-normal">Conversion rules applied on sales and redemptions</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">Points per ₹100 Spent</label>
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={pointsPerHundred}
                onChange={(e) => setPointsPerHundred(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">Rupee Value per Point (₹)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={rupeeValuePerPoint}
                onChange={(e) => setRupeeValuePerPoint(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-stone-700 block">Minimum Points per Redemption</label>
              <input
                type="number"
                step="1"
                min="0"
                value={minRedeemPoints}
                onChange={(e) => setMinRedeemPoints(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs"
              />
              <p className="text-[11px] text-stone-400">0 = customers can redeem any amount</p>
            </div>
          </div>
        </div>

        {/* Welcome Vouchers (App Welcome Offers) */}
        <div className="p-5 sm:p-6 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">App Welcome Vouchers</h3>
                <p className="text-xs text-stone-400 font-normal">
                  New app users get them as scratch cards: one right after registering, one when their profile is 100% complete
                  (anniversary and photo are optional). One of each per customer; redeem on Add Sale by typing the code
                  (for the selected customer) or scanning the QR.
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none self-start">
              <input type="checkbox" checked={vouchers.enabled} onChange={setVoucherField(null, 'enabled')} className="w-4 h-4 accent-brand-600" />
              <span className="font-medium text-stone-700">{vouchers.enabled ? 'Vouchers are on' : 'Vouchers are off'}</span>
            </label>
          </div>

          <div className={`space-y-3.5 ${vouchers.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="font-medium text-stone-700 block" htmlFor="voucher-validity">Valid For (days after claiming)</label>
                <input id="voucher-validity" type="number" min="1" max="365" value={vouchers.validityDays} onChange={setVoucherField(null, 'validityDays')} className={`w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs tabular-nums`} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Voucher 1: free item */}
              <div className="rounded-lg border border-stone-200 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-brand-600" />
                    Voucher 1 · Free item
                  </span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={vouchers.glass.enabled} onChange={setVoucherField('glass', 'enabled')} className="w-3.5 h-3.5 accent-brand-600" />
                    <span className="text-stone-600">On</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="voucher-glass-unlock">Unlocks</label>
                    <select id="voucher-glass-unlock" value={vouchers.glass.unlock} onChange={setVoucherField('glass', 'unlock')} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs cursor-pointer">
                      <option value="register">Right after registering</option>
                      <option value="profile">When the profile is 100% complete</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="voucher-glass-code">Voucher Code</label>
                    <input id="voucher-glass-code" value={vouchers.glass.code} onChange={setVoucherField('glass', 'code')} maxLength={20} className={`w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs font-mono uppercase`} />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="voucher-glass-value">Item Value (₹)</label>
                    <input id="voucher-glass-value" type="number" min="0" value={vouchers.glass.value} onChange={setVoucherField('glass', 'value')} className={`w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs tabular-nums`} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="voucher-glass-item">Free Item</label>
                    <input id="voucher-glass-item" value={vouchers.glass.itemName} onChange={setVoucherField('glass', 'itemName')} maxLength={60} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs" />
                  </div>
                </div>
                <p className="text-[11px] text-stone-500">
                  Customers see "Free {vouchers.glass.itemName || 'item'}". At the counter it is added to the bill and up to ₹
                  {Number(vouchers.glass.value || 0).toLocaleString('en-IN')} is taken off.
                </p>
              </div>

              {/* Voucher 2: discount on accessories */}
              <div className="rounded-lg border border-stone-200 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5 text-brand-600" />
                    Voucher 2 · Accessories discount
                  </span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={vouchers.accessories.enabled} onChange={setVoucherField('accessories', 'enabled')} className="w-3.5 h-3.5 accent-brand-600" />
                    <span className="text-stone-600">On</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="voucher-acc-unlock">Unlocks</label>
                    <select id="voucher-acc-unlock" value={vouchers.accessories.unlock} onChange={setVoucherField('accessories', 'unlock')} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs cursor-pointer">
                      <option value="register">Right after registering</option>
                      <option value="profile">When the profile is 100% complete</option>
                    </select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="voucher-acc-code">Voucher Code</label>
                    <input id="voucher-acc-code" value={vouchers.accessories.code} onChange={setVoucherField('accessories', 'code')} maxLength={20} className={`w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs font-mono uppercase`} />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="voucher-acc-min">Buy Accessories Of (₹)</label>
                    <input id="voucher-acc-min" type="number" min="0" value={vouchers.accessories.minBill} onChange={setVoucherField('accessories', 'minBill')} className={`w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs tabular-nums`} />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-stone-700 block" htmlFor="voucher-acc-amount">Get Off (₹)</label>
                    <input id="voucher-acc-amount" type="number" min="0" value={vouchers.accessories.amount} onChange={setVoucherField('accessories', 'amount')} className={`w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs tabular-nums`} />
                  </div>
                </div>
                <p className="text-[11px] text-stone-500">
                  "Buy ₹{Number(vouchers.accessories.minBill || 0).toLocaleString('en-IN')} mobile accessories & get ₹
                  {Number(vouchers.accessories.amount || 0).toLocaleString('en-IN')} off". Only accessories on the bill count.
                </p>
              </div>
            </div>
            <p className="text-[11px] text-stone-400">Changes apply to vouchers claimed from now on; vouchers already claimed keep their terms.</p>
          </div>
        </div>
      </form>

      <AppStylesSettings initialTheme={theme} />
    </div>
  );
};

