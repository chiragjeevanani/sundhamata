import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MessageSquareText, Phone, RotateCcw, Search, StickyNote, Trash2, X } from 'lucide-react';
import { adminInquiryService } from '../../../services/adminInquiryService';
import {
  ACCESSORY_TYPE_LABELS,
  SERVICE_DEVICE_LABELS,
  SERVICE_PREFERENCE_LABELS,
  describeAccessoriesInquiry,
  describeServiceInquiry,
  inquiryPhotoUrl,
} from '../../../services/inquiryService';
import { formatINR, formatPhone, formatRelativeTime } from '../../../utils/formatters';
import { useToast } from '../context/ToastContext';

const CATEGORY_LABELS = { mobile: 'Mobile', accessories: 'Accessories', service: 'Service' };
const CATEGORY_BADGE = {
  mobile: 'bg-brand-50 text-brand-700 border-brand-200/70',
  accessories: 'bg-amber-50 text-amber-800 border-amber-200/70',
  service: 'bg-violet-50 text-violet-700 border-violet-200/70',
};
// A lead is Open until staff close it. (Stored as new / contacted / closed: the customer app
// shows those as "Sent", "Store contacted you" and "Closed".)
const STATUS_TABS = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];
const isOpen = (lead) => lead.status !== 'closed';

/** Staff note on a lead, e.g. "Called, will visit on Sunday" */
const NoteForm = ({ inquiry, onClose, onSaved }) => {
  const { showError } = useToast();
  const [note, setNote] = useState(inquiry.adminNote ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved(await adminInquiryService.update(inquiry.id, { adminNote: note }));
    } catch (err) {
      showError('Error', err.message || 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-3 text-xs"
        aria-label="Lead note"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-900">
            Note for {inquiry.leadCode ? `${inquiry.leadCode} · ` : ''}
            {inquiry.customer?.name ?? 'this lead'}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-stone-500 bg-stone-50 rounded-lg p-2.5 border border-stone-100">
          {[
            inquiry.mobile && `${inquiry.mobile.brand} · ${inquiry.mobile.ramRom}`,
            inquiry.accessories && describeAccessoriesInquiry(inquiry.accessories),
            inquiry.service && describeServiceInquiry(inquiry.service),
            inquiry.message,
          ].filter(Boolean).join(' · ')}
        </p>
        <textarea
          rows={4}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Called, will visit the store on Sunday"
          className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs resize-none"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </form>
    </div>
  );
};

/** Leads: inquiries customers send from the app (Home / Profile → Make an Inquiry) */
export const LeadsPage = () => {
  const { showSuccess, showError } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [updating, setUpdating] = useState(null);
  const [category, setCategory] = useState('all');
  const [data, setData] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [noting, setNoting] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      adminInquiryService
        .list({ search, status, category, limit: 100 })
        .then((res) => active && setData(res))
        .catch((err) => active && showError('Error', err.message || 'Could not load leads.'));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, status, category, reloadKey, showError]);

  const counts = data?.counts ?? {};
  const tabCount = { open: counts.open ?? 0, closed: counts.closed ?? 0, all: (counts.open ?? 0) + (counts.closed ?? 0) };

  /** Close an open lead, or reopen a closed one (a reopened lead counts as contacted) */
  const toggleOpen = async (lead) => {
    const closing = isOpen(lead);
    setUpdating(lead.id);
    try {
      await adminInquiryService.update(lead.id, { status: closing ? 'closed' : 'contacted' });
      showSuccess(closing ? 'Lead closed' : 'Lead reopened');
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError('Error', err.message || 'Could not update the lead.');
    } finally {
      setUpdating(null);
    }
  };

  const confirmDelete = async () => {
    try {
      await adminInquiryService.remove(deleting.id);
      showSuccess('Lead deleted');
      setDeleting(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError('Error', err.message || 'Could not delete the lead.');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="pb-4 border-b border-stone-200/80">
        <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Leads</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Inquiries customers send from the app for a mobile, accessories or a service. Mark a lead closed once it is
          dealt with.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => {
          const count = tabCount[tab.key];
          const selected = status === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatus(tab.key)}
              className={`py-1.5 px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 cursor-pointer transition-colors ${
                selected ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              {tab.label}
              {data && (
                <span className={`tabular-nums text-[10.5px] ${selected ? 'text-white/80' : 'text-stone-400'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lead no. (SM-001), customer, mobile, brand, model, problem..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-xs text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-hidden focus:border-brand-600 shadow-2xs cursor-pointer"
          aria-label="Lead type"
        >
          <option value="all">All types</option>
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
                <th className="py-2.5 pl-5 pr-2 font-medium whitespace-nowrap">Lead No.</th>
                <th className="py-2.5 px-4 font-medium">Customer</th>
                <th className="py-2.5 px-4 font-medium">Type</th>
                <th className="py-2.5 px-4 font-medium text-right">Budget</th>
                <th className="py-2.5 px-4 font-medium">Details</th>
                <th className="py-2.5 px-4 font-medium">Received</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!data &&
                [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-5 py-3">
                      <div className="h-4 bg-stone-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-stone-400">
                    <MessageSquareText className="w-7 h-7 mx-auto mb-2 opacity-60" />
                    {search || category !== 'all'
                      ? 'No leads match these filters.'
                      : status === 'open'
                        ? 'No open leads. New inquiries from the app appear here.'
                        : status === 'closed'
                          ? 'No closed leads yet.'
                          : 'No leads yet. They appear here when customers send an inquiry from the app.'}
                  </td>
                </tr>
              )}
              {data?.items.map((inq) => (
                <tr key={inq.id} className={`hover:bg-stone-50/60 align-top ${isOpen(inq) ? '' : 'bg-stone-50/50 text-stone-500'}`}>
                  <td className="py-3 pl-5 pr-2 whitespace-nowrap">
                    <span className="font-mono text-[11.5px] font-semibold text-stone-800 bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5">
                      {inq.leadCode ?? '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {inq.customer ? (
                      <>
                        <Link to={`/admin/customers/${inq.customer.id}`} className="font-medium text-stone-900 hover:text-brand-700 block">
                          {inq.customer.name}
                        </Link>
                        <a href={`tel:${inq.customer.mobile}`} className="text-[11px] text-stone-500 hover:text-brand-700 font-mono inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {formatPhone(inq.customer.mobile)}
                        </a>
                      </>
                    ) : (
                      <span className="text-stone-400 italic">Customer removed</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${CATEGORY_BADGE[inq.category]}`}>
                      {CATEGORY_LABELS[inq.category]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-stone-800 whitespace-nowrap">
                    {inq.budget != null ? formatINR(inq.budget) : '—'}
                  </td>
                  <td className="py-3 px-4 text-stone-700 min-w-[220px] max-w-[360px]">
                    {inq.mobile && (
                      <div className="mb-1 space-y-1">
                        <p>
                          <span className="text-stone-400">Brand:</span> <span className="font-semibold text-stone-900">{inq.mobile.brand}</span>
                          <span className="text-stone-300"> · </span>
                          <span className="text-stone-400">RAM & ROM:</span> <span className="font-semibold text-stone-900">{inq.mobile.ramRom}</span>
                        </p>
                        {inq.mobile.features.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {inq.mobile.features.map((f) => (
                              <span key={f} className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 text-[10.5px] font-medium">{f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {inq.accessories && (
                      <dl className="mb-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                        {[
                          ['Type', ACCESSORY_TYPE_LABELS[inq.accessories.type]],
                          ['Needs', inq.accessories.item],
                          ['Quantity', inq.accessories.quantity],
                          ['Brand', inq.accessories.brandPreference],
                          ['Device', inq.accessories.device],
                        ]
                          .filter(([, value]) => value)
                          .map(([label, value]) => (
                            <div key={label} className="contents">
                              <dt className="text-stone-400">{label}:</dt>
                              <dd className="font-semibold text-stone-900 break-words">{value}</dd>
                            </div>
                          ))}
                      </dl>
                    )}
                    {inq.service && (
                      <dl className="mb-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                        {[
                          ['Device', SERVICE_DEVICE_LABELS[inq.service.device]],
                          ['Model', inq.service.brandModel],
                          ['Problem', inq.service.problem],
                          ['Details', inq.service.details],
                          ['Service', SERVICE_PREFERENCE_LABELS[inq.service.preference]],
                        ]
                          .filter(([, value]) => value)
                          .map(([label, value]) => (
                            <div key={label} className="contents">
                              <dt className="text-stone-400">{label}:</dt>
                              <dd className="font-semibold text-stone-900 break-words whitespace-pre-line">{value}</dd>
                            </div>
                          ))}
                      </dl>
                    )}
                    {inq.message && <p className="whitespace-pre-line break-words">{inq.message}</p>}
                    {inq.photo && (
                      <a href={inquiryPhotoUrl(inq.photo)} target="_blank" rel="noreferrer" className="inline-block mt-1" title="Open photo">
                        <img
                          src={inquiryPhotoUrl(inq.photo)}
                          alt="Photo of the problem"
                          className="w-20 h-20 rounded-lg object-cover border border-stone-200 hover:opacity-90"
                        />
                      </a>
                    )}
                    {inq.adminNote && (
                      <p className="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 break-words">
                        Note: {inq.adminNote}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-stone-500 whitespace-nowrap">{formatRelativeTime(inq.createdAt)}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col items-start gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${
                          isOpen(inq) ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-stone-100 text-stone-600 border-stone-200'
                        }`}
                      >
                        {isOpen(inq) ? 'Open' : 'Closed'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleOpen(inq)}
                        disabled={updating === inq.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stone-200 bg-white text-[11px] font-medium text-stone-700 hover:bg-stone-50 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isOpen(inq) ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <RotateCcw className="w-3 h-3" />}
                        {isOpen(inq) ? 'Mark closed' : 'Reopen'}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    <button
                      onClick={() => setNoting(inq)}
                      className="p-1.5 text-stone-400 hover:text-brand-700 rounded-md hover:bg-stone-100 cursor-pointer"
                      aria-label="Add note"
                      title="Add note"
                    >
                      <StickyNote className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(inq)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-md hover:bg-stone-100 cursor-pointer"
                      aria-label="Delete lead"
                      title="Delete"
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
            Showing {data.items.length} of {data.pagination.total}. Search or filter to find others.
          </p>
        )}
      </div>

      {noting && (
        <NoteForm
          inquiry={noting}
          onClose={() => setNoting(null)}
          onSaved={() => {
            showSuccess('Note saved');
            setNoting(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-sm bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-stone-900">Delete lead {deleting.leadCode ?? ''}?</h3>
            <p className="text-stone-500">
              The inquiry is removed for the customer too, and this cannot be undone. To keep it, mark it closed instead.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
                Cancel
              </button>
              <button onClick={confirmDelete} className="py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
