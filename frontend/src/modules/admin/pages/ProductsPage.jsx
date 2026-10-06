import { useEffect, useState } from 'react';
import { Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { adminProductService } from '../../../services/adminProductService';
import { formatDate, formatINR } from '../../../utils/formatters';
import { useToast } from '../context/ToastContext';

const CATEGORY_LABELS = { phones: 'Smartphones', accessories: 'Accessories', service: 'Service & Repairs' };
const EMPTY_FORM = { name: '', category: 'phones', brand: '', model: '', hsn: '', lastPrice: '', warrantyMonths: '' };

const inputClass =
  'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs';

/** Add / edit a catalog product */
const ProductForm = ({ initial, onClose, onSaved }) => {
  const { showError } = useToast();
  const [form, setForm] = useState(() =>
    initial
      ? {
          name: initial.name,
          category: initial.category,
          brand: initial.brand ?? '',
          model: initial.model ?? '',
          hsn: initial.hsn ?? '',
          lastPrice: initial.lastPrice ?? '',
          warrantyMonths: initial.warrantyMonths ?? '',
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        brand: form.brand.trim(),
        model: form.model.trim(),
        hsn: form.hsn.trim(),
        lastPrice: form.lastPrice === '' ? null : Number(form.lastPrice),
        warrantyMonths: form.warrantyMonths === '' ? null : Number(form.warrantyMonths),
      };
      const saved = initial ? await adminProductService.update(initial.id, body) : await adminProductService.create(body);
      onSaved(saved, Boolean(initial));
    } catch (err) {
      showError('Error', err.message || 'Could not save the product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-4 text-xs"
        aria-label={initial ? 'Edit product' : 'Add product'}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-900">{initial ? 'Edit Product' : 'Add Product'}</h3>
          <button type="button" onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="font-medium text-stone-700 block" htmlFor="product-name">Product Name *</label>
            <input id="product-name" value={form.name} onChange={set('name')} required minLength={2} maxLength={120} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="font-medium text-stone-700 block" htmlFor="product-category">Category</label>
            <select id="product-category" value={form.category} onChange={set('category')} className={`${inputClass} cursor-pointer`}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-medium text-stone-700 block" htmlFor="product-brand">Brand</label>
            <input id="product-brand" value={form.brand} onChange={set('brand')} maxLength={40} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="font-medium text-stone-700 block" htmlFor="product-model">Model</label>
            <input id="product-model" value={form.model} onChange={set('model')} maxLength={80} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="font-medium text-stone-700 block" htmlFor="product-hsn">{form.category === 'service' ? 'SAC Code' : 'HSN Code'}</label>
            <input
              id="product-hsn"
              inputMode="numeric"
              maxLength={8}
              value={form.hsn}
              onChange={(e) => setForm((prev) => ({ ...prev, hsn: e.target.value.replace(/\D/g, '') }))}
              placeholder="4, 6 or 8 digits"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="space-y-1">
            <label className="font-medium text-stone-700 block" htmlFor="product-price">Price (₹)</label>
            <input id="product-price" type="number" min="0" value={form.lastPrice} onChange={set('lastPrice')} className={`${inputClass} tabular-nums`} />
          </div>
          <div className="space-y-1">
            <label className="font-medium text-stone-700 block" htmlFor="product-warranty">Warranty (months)</label>
            <input
              id="product-warranty"
              type="number"
              min="0"
              max="120"
              value={form.warrantyMonths}
              onChange={set('warrantyMonths')}
              className={`${inputClass} tabular-nums`}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : initial ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  );
};

/**
 * Product catalog: every product sold is added automatically, so the counter can pick it
 * on Add Sale instead of typing the full name. Fix names, prices and details here.
 */
export const ProductsPage = () => {
  const { showSuccess, showError } = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [data, setData] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(null); // product, or 'new'
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      adminProductService
        .list({ search, category, limit: 100 })
        .then((res) => active && setData(res))
        .catch((err) => active && showError('Error', err.message || 'Could not load products.'));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, category, reloadKey, showError]);

  const confirmDelete = async () => {
    try {
      await adminProductService.remove(deleting.id);
      showSuccess('Product removed', `${deleting.name} will no longer be suggested.`);
      setDeleting(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError('Error', err.message || 'Could not remove the product.');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Products</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Every product you sell is saved here automatically and suggested on Add Sale.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="py-2 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Product
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, brand or model..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-xs text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-hidden focus:border-brand-600 shadow-2xs cursor-pointer"
          aria-label="Category"
        >
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-100">
              <tr>
                <th className="py-2.5 px-5 font-medium">Product</th>
                <th className="py-2.5 px-4 font-medium">Category</th>
                <th className="py-2.5 px-4 font-medium">Variants / Colours</th>
                <th className="py-2.5 px-4 font-medium text-right">Last Price</th>
                <th className="py-2.5 px-4 font-medium text-right">Sold</th>
                <th className="py-2.5 px-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!data &&
                [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3">
                      <div className="h-4 bg-stone-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-stone-400">
                    <Package className="w-7 h-7 mx-auto mb-2 opacity-60" />
                    {search ? 'No products match your search.' : 'No products yet. They appear here as you add sales.'}
                  </td>
                </tr>
              )}
              {data?.items.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50/60">
                  <td className="py-3 px-5">
                    <span className="font-medium text-stone-900 block">{p.name}</span>
                    <span className="text-[11px] text-stone-400">{[p.brand, p.model].filter(Boolean).join(' · ') || '—'}</span>
                  </td>
                  <td className="py-3 px-4 text-stone-600 whitespace-nowrap">{CATEGORY_LABELS[p.category]}</td>
                  <td className="py-3 px-4 text-stone-500 max-w-[240px]">
                    <span className="block truncate">{p.variants.join(', ') || '—'}</span>
                    <span className="block truncate text-stone-400">{p.colors.join(', ')}</span>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-stone-800">{p.lastPrice ? formatINR(p.lastPrice) : '—'}</td>
                  <td className="py-3 px-4 text-right text-stone-600 whitespace-nowrap">
                    <span className="tabular-nums">{p.timesSold}×</span>
                    {p.lastSoldAt && <span className="block text-[11px] text-stone-400">{formatDate(p.lastSoldAt)}</span>}
                  </td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(p)}
                      className="p-1.5 text-stone-400 hover:text-brand-700 rounded-md hover:bg-stone-100 cursor-pointer"
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(p)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-md hover:bg-stone-100 cursor-pointer"
                      aria-label={`Remove ${p.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.pagination.total > data.items.length && (
          <p className="px-5 py-2.5 text-[11px] text-stone-400 border-t border-stone-100">
            Showing {data.items.length} of {data.pagination.total}. Search to find others.
          </p>
        )}
      </div>

      {editing && (
        <ProductForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, wasEdit) => {
            showSuccess(wasEdit ? 'Product updated' : 'Product added', saved.name);
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-sm bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-stone-900">Remove {deleting.name}?</h3>
            <p className="text-stone-500">
              It will no longer be suggested on Add Sale. Past purchases are not affected, and it is added again
              automatically if you sell it later.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmDelete} className="py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
