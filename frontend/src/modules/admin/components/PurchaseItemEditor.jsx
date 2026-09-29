import { useEffect, useRef, useState } from 'react';
import { History, Image as ImageIcon, Trash2 } from 'lucide-react';
import { adminProductService } from '../../../services/adminProductService';
import { formatDate, formatINR } from '../../../utils/formatters';
import { formatFileSize, IMAGE_ACCEPT, validateImageFile } from '../../../utils/billFile';
import { addMonthsToDate } from '../../../utils/purchaseDates';
import { fillFromCatalog, ITEM_TYPES, itemWarrantyMonths, itemWarrantyValid } from '../../../utils/purchaseItems';

const typeOf = (category) => ITEM_TYPES.find((t) => t.id === category) ?? ITEM_TYPES[0];

const inputClass = (hasError) =>
  `w-full px-3 py-2 bg-white border rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs ${
    hasError ? 'border-rose-400' : 'border-stone-300'
  }`;

const Chips = ({ values, current, onPick }) =>
  values?.length > 0 ? (
    <div className="flex flex-wrap gap-1 pt-1">
      {values.slice(0, 6).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          className={`px-1.5 py-0.5 rounded-md border text-[10.5px] cursor-pointer transition-colors ${
            current === value ? 'bg-brand-50 border-brand-300 text-brand-800' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  ) : null;

/**
 * One product on the bill: catalog suggestions while typing the name, details, IMEI,
 * price, its own warranty and an optional photo.
 */
export const PurchaseItemEditor = ({ item, index, count, errors = {}, purchaseDate, onChange, onRemove }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef(null);

  // Suggestions from the catalog while typing the product name
  useEffect(() => {
    const query = item.name.trim();
    if (query.length < 2 || !showSuggestions) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      adminProductService
        .search(query, 8)
        .then((items) => {
          if (!active) return;
          setSuggestions(items);
          setHighlight(-1);
        })
        .catch(() => {});
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [item.name, showSuggestions]);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (product) => {
    onChange(fillFromCatalog(item, product));
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const chooseImage = (file) => {
    if (!file) return;
    const problem = validateImageFile(file);
    if (item.imagePreview) URL.revokeObjectURL(item.imagePreview);
    onChange({
      imageError: problem || '',
      imageFile: problem ? null : file,
      imagePreview: problem ? null : URL.createObjectURL(file),
    });
  };
  const clearImage = () => {
    if (item.imagePreview) URL.revokeObjectURL(item.imagePreview);
    onChange({ imageFile: null, imagePreview: null, imageError: '' });
  };

  const months = itemWarrantyMonths(item);
  const warrantyValid = itemWarrantyValid(item);
  const warrantyUntil =
    warrantyValid && months > 0 && purchaseDate
      ? formatDate(addMonthsToDate(new Date(`${purchaseDate}T12:00:00`), months))
      : null;
  const type = typeOf(item.category);
  const chooseType = (category) => {
    if (category === item.category) return;
    const next = typeOf(category);
    const patch = { category };
    // Fields the new type does not use are cleared, so they are not saved by mistake
    if (!next.variant) patch.variant = '';
    if (!next.color) patch.color = '';
    // Services usually have no warranty; phones and accessories default to 1 year
    const untouched = (item.warrantyDuration === '1' && item.warrantyUnit === 'years') || item.warrantyDuration === '0';
    if (untouched) {
      Object.assign(patch, category === 'service' ? { warrantyDuration: '0', warrantyUnit: 'months' } : { warrantyDuration: '1', warrantyUnit: 'years' });
    }
    onChange(patch);
  };
  const visibleSuggestions = showSuggestions && item.name.trim().length >= 2 ? suggestions : [];

  return (
    <div className={`rounded-lg border ${count > 1 ? 'border-stone-200 bg-stone-50/40 p-3.5' : 'border-transparent'} space-y-3`}>
      {count > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Product {index + 1}</span>
          <button
            type="button"
            onClick={onRemove}
            className="text-stone-400 hover:text-rose-600 flex items-center gap-1 text-[11px] font-medium cursor-pointer"
            aria-label={`Remove product ${index + 1}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        </div>
      )}

      {/* What is being sold: Mobile / Accessories / Services */}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={`Type of product ${index + 1}`}>
        {ITEM_TYPES.map((t) => {
          const Icon = t.icon;
          const active = item.category === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => chooseType(t.id)}
              className={`py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                active ? 'bg-brand-600 border-brand-600 text-white shadow-2xs' : 'bg-white border-stone-300 text-stone-700 hover:border-brand-400 hover:bg-brand-50/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="sm:col-span-3 space-y-1 relative" ref={boxRef}>
          <label className="text-xs font-medium text-stone-700 block" htmlFor={`item-name-${item.key}`}>
            {type.name} *
          </label>
          <input
            id={`item-name-${item.key}`}
            type="text"
            value={item.name}
            autoComplete="off"
            onFocus={() => setShowSuggestions(true)}
            onChange={(e) => {
              onChange({ name: e.target.value, catalog: null });
              setShowSuggestions(true);
            }}
            onKeyDown={(e) => {
              if (!visibleSuggestions.length) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, visibleSuggestions.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter' && highlight >= 0) {
                e.preventDefault();
                pick(visibleSuggestions[highlight]);
              } else if (e.key === 'Escape') {
                setShowSuggestions(false);
              }
            }}
            placeholder={`${type.namePlaceholder} — saved products appear as you type`}
            className={inputClass(errors.name)}
          />
          {errors.name && <p className="text-[11px] text-rose-600">{errors.name}</p>}

          {visibleSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-stone-200 rounded-lg shadow-lg max-h-64 overflow-y-auto divide-y divide-stone-100">
              {visibleSuggestions.map((product, i) => (
                <button
                  key={product.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(product)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 cursor-pointer ${
                    highlight === i ? 'bg-brand-50' : 'hover:bg-stone-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-stone-900 truncate">{product.name}</span>
                    <span className="block text-[11px] text-stone-400 truncate">
                      {[product.brand, product.category === 'phones' ? 'Smartphone' : product.category === 'accessories' ? 'Accessory' : 'Service', product.variants?.[0]]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    {product.lastPrice ? (
                      <span className="block font-medium text-stone-700 tabular-nums">{formatINR(product.lastPrice)}</span>
                    ) : null}
                    <span className="flex items-center justify-end gap-1 text-[10.5px] text-stone-400">
                      <History className="w-3 h-3" />
                      sold {product.timesSold}×
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700 block">{type.brand}</label>
          <input
            type="text"
            value={item.brand}
            maxLength={40}
            onChange={(e) => onChange({ brand: e.target.value })}
            placeholder="Auto-detected if empty"
            className={inputClass(false)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700 block">{type.model}</label>
          <input
            type="text"
            value={item.model}
            maxLength={80}
            onChange={(e) => onChange({ model: e.target.value })}
            placeholder="e.g. SM-S938B"
            className={inputClass(false)}
          />
        </div>

        {type.variant && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700 block">Variant</label>
          <input
            type="text"
            value={item.variant}
            maxLength={80}
            onChange={(e) => onChange({ variant: e.target.value })}
            placeholder="e.g. 12GB + 256GB"
            className={inputClass(false)}
          />
          <Chips values={item.catalog?.variants} current={item.variant} onPick={(variant) => onChange({ variant })} />
        </div>
        )}

        {type.color && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700 block">Colour</label>
          <input
            type="text"
            value={item.color}
            maxLength={40}
            onChange={(e) => onChange({ color: e.target.value })}
            placeholder="e.g. Titanium Black"
            className={inputClass(false)}
          />
          <Chips values={item.catalog?.colors} current={item.color} onPick={(color) => onChange({ color })} />
        </div>
        )}

        <div className={`${type.variant ? 'sm:col-span-2' : 'sm:col-span-1'} space-y-1`}>
          <label className="text-xs font-medium text-stone-700 block" htmlFor={`item-imei-${item.key}`}>
            {type.imei.label}
          </label>
          <input
            id={`item-imei-${item.key}`}
            type="text"
            inputMode={item.category === 'phones' ? 'numeric' : 'text'}
            value={item.imei}
            onChange={(e) => onChange({ imei: e.target.value })}
            placeholder={type.imei.placeholder}
            className={`${inputClass(errors.imei)} font-mono text-xs`}
          />
          {errors.imei && <p className="text-[11px] text-rose-600">{errors.imei}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700 block" htmlFor={`item-price-${item.key}`}>
            Price (₹) *
          </label>
          <input
            id={`item-price-${item.key}`}
            type="number"
            min="0"
            value={item.price}
            onChange={(e) => onChange({ price: e.target.value })}
            placeholder="e.g. 124999"
            className={`${inputClass(errors.price)} font-medium tabular-nums`}
          />
          {errors.price && <p className="text-[11px] text-rose-600">{errors.price}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700 block">{type.warranty}</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="1"
              value={item.warrantyDuration}
              aria-label={`Warranty duration for product ${index + 1}`}
              onChange={(e) => onChange({ warrantyDuration: e.target.value })}
              className={`px-3 py-2 bg-white border rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs tabular-nums w-16 shrink-0 ${
                errors.warranty ? 'border-rose-400' : 'border-stone-300'
              }`}
            />
            <select
              value={item.warrantyUnit}
              aria-label={`Warranty unit for product ${index + 1}`}
              onChange={(e) => onChange({ warrantyUnit: e.target.value })}
              className="w-full px-2 py-2 bg-white border border-stone-300 rounded-lg text-stone-800 focus:outline-hidden focus:border-brand-600 shadow-2xs cursor-pointer"
            >
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </div>
          {errors.warranty ? (
            <p className="text-[11px] text-rose-600">{errors.warranty}</p>
          ) : (
            <p className="text-[11px] text-stone-500">
              {warrantyUntil ? (
                <>
                  Valid until <span className="font-medium text-stone-800">{warrantyUntil}</span>
                </>
              ) : warrantyValid && months === 0 ? (
                'No warranty'
              ) : null}
            </p>
          )}
        </div>

        <div className="sm:col-span-2 space-y-1">
          <label className="text-xs font-medium text-stone-700 block">Product Photo</label>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg border border-stone-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              {item.imagePreview ? (
                <img src={item.imagePreview} alt="Product preview" className="w-full h-full object-contain" />
              ) : (
                <ImageIcon className="w-4 h-4 text-stone-300" />
              )}
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <label className="py-1 px-2.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer bg-white">
                  {item.imageFile ? 'Change photo' : 'Choose photo'}
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT}
                    aria-label={`Photo for product ${index + 1}`}
                    className="sr-only"
                    onChange={(e) => {
                      chooseImage(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {item.imageFile && (
                  <button type="button" onClick={clearImage} className="text-stone-500 hover:text-stone-800 cursor-pointer">
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-stone-400 truncate">
                {item.imageFile ? `${item.imageFile.name} • ${formatFileSize(item.imageFile.size)}` : 'Optional. Shown in the customer app.'}
              </p>
              {item.imageError && <p className="text-[11px] text-rose-600">{item.imageError}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
