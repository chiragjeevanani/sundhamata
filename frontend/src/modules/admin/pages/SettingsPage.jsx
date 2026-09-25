import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { adminSettingsService } from '../../../services/adminSettingsService';
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
      <div className="py-12 text-center text-xs text-slate-400">Loading settings...</div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">Store Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">Configure store branding, contact parameters, and loyalty engine ratios.</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
        {/* Store Information */}
        <div className="p-5 sm:p-6 space-y-4 text-xs">
          <div>
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Store Details</h3>
            <p className="text-xs text-slate-400 font-normal">Legal store identity, physical location, and invoice branding</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">Store Name</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="font-medium text-slate-700 block">Store Address (street / area)</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>


            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">State</label>
              <input
                type="text"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">Pincode</label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-normal focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">GSTIN / Tax ID</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs uppercase text-slate-900 focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Loyalty Program Rules */}
        <div className="p-5 sm:p-6 space-y-4 text-xs">
          <div>
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Loyalty Engine Configuration</h3>
            <p className="text-xs text-slate-400 font-normal">Conversion rules applied on purchase recordings and redemptions</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">Points per ₹100 Spent</label>
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={pointsPerHundred}
                onChange={(e) => setPointsPerHundred(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 tabular-nums focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-slate-700 block">Rupee Value per Point (₹)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={rupeeValuePerPoint}
                onChange={(e) => setRupeeValuePerPoint(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 tabular-nums focus:outline-hidden focus:border-blue-600 shadow-2xs"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

