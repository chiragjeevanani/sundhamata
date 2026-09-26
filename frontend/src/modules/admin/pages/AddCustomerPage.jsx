import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Smartphone, Headphones, Wrench } from 'lucide-react';
import { customerService } from '../../../services/customerService';
import { useToast } from '../context/ToastContext';

export const AddCustomerPage = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [interest, setInterest] = useState('Mobile');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const interestOptions = [
    { id: 'Mobile', label: 'Smartphones', icon: Smartphone },
    { id: 'Accessories', label: 'Accessories', icon: Headphones },
    { id: 'Service', label: 'Repairs & Care', icon: Wrench },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Please enter customer name.';
    }
    const cleanMobile = mobile.replace(/\D/g, '');
    if (!cleanMobile || cleanMobile.length !== 10) {
      newErrors.mobile = 'Enter a valid 10-digit mobile number.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const created = await customerService.createCustomer({
        name: name.trim(),
        mobile: cleanMobile,
        email: email.trim(),
        interest,
      });

      showSuccess('Customer Registered', `${created.name} added to store.`);
      navigate(`/admin/customers/${created.id}`);
    } catch (err) {
      showError('Registration Failed', err.message || 'Unable to register customer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">Add Customer</h1>
          <p className="text-xs text-slate-500 mt-0.5">Register a new store customer for quick counter billing and loyalty rewards.</p>
        </div>

        <button
          onClick={() => navigate('/admin/customers')}
          className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Customers</span>
        </button>
      </div>

      <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs">
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Full Name */}
          <div className="space-y-1">
            <label className="block font-medium text-slate-700">
              Customer Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder="e.g. Ramesh Agrawal"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden focus:border-brand-600 shadow-2xs transition-all"
              autoFocus
            />
            {errors.name && <p className="text-[11px] text-rose-600">{errors.name}</p>}
          </div>

          {/* Mobile Number */}
          <div className="space-y-1">
            <label className="block font-medium text-slate-700">
              Mobile Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-brand-600 overflow-hidden shadow-2xs">
              <span className="px-3 py-2 bg-slate-50 border-r border-slate-200 text-slate-600 font-medium select-none text-xs">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value.replace(/\D/g, ''));
                  if (errors.mobile) setErrors((prev) => ({ ...prev, mobile: '' }));
                }}
                placeholder="98290 12345"
                className="w-full px-3 py-2 font-normal text-slate-900 placeholder:text-slate-400 focus:outline-hidden text-xs"
              />
            </div>
            {errors.mobile && <p className="text-[11px] text-rose-600">{errors.mobile}</p>}
          </div>

          {/* Primary Shopping Interest */}
          <div className="space-y-1.5 pt-1">
            <label className="block font-medium text-slate-700">Shopping Interest</label>
            <div className="grid grid-cols-3 gap-2.5">
              {interestOptions.map((item) => {
                const Icon = item.icon;
                const isSelected = interest === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setInterest(item.id)}
                    className={`p-3 rounded-lg border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-600 border-brand-600 text-white shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                    <span className="font-medium text-xs">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Email (Optional) */}
          <div className="space-y-1 pt-1">
            <label className="block font-medium text-slate-700">
              Email Address <span className="font-normal text-slate-400">(Optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@gmail.com"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg font-normal text-slate-900 focus:outline-hidden focus:border-brand-600 shadow-2xs"
            />
          </div>

          {/* Action CTAs */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/customers')}
              className="py-2 px-4 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="py-2 px-5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium transition-all shadow-2xs active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Registering...' : 'Register Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

