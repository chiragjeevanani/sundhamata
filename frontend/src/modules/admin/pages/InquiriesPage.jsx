import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareText, Phone, Search, StickyNote, Trash2, X } from 'lucide-react';
import { adminInquiryService } from '../../../services/adminInquiryService';
import { formatINR, formatPhone, formatRelativeTime } from '../../../utils/formatters';
import { useToast } from '../context/ToastContext';

const CATEGORY_LABELS = { mobile: 'Mobile', accessories: 'Accessories', service: 'Service' };
const CATEGORY_BADGE = {
  mobile: 'bg-brand-50 text-brand-700 border-brand-200/70',
  accessories: 'bg-amber-50 text-amber-800 border-amber-200/70',
  service: 'bg-violet-50 text-violet-700 border-violet-200/70',
};
const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'closed', label: 'Closed' },
];
const STATUS_SELECT = {
  new: 'bg-brand-50 text-brand-700 border-brand-200',
  contacted: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  closed: 'bg-stone-100 text-stone-600 border-stone-200',
};

/** Staff note on an inquiry, e.g. "Called, will visit on Sunday" */
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
        aria-label="Inquiry note"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-900">Note for {inquiry.customer?.name ?? 'this inquiry'}</h3>
          <button type="button" onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-stone-500 bg-stone-50 rounded-lg p-2.5 border border-stone-100">{inquiry.message}</p>
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

/** Inquiries sent by customers from the app (Profile → Make an Inquiry) */
export const InquiriesPage = () => {
  const { showSuccess, showError } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
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
        .catch((err) => active && showError('Error', err.message || 'Could not load inquiries.'));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, status, category, reloadKey, showError]);

  const counts = data?.counts ?? {};
  const total = (counts.new ?? 0) + (counts.contacted ?? 0) + (counts.closed ?? 0);

  const changeStatus = async (inquiry, next) => {
    try {
      await adminInquiryService.update(inquiry.id, { status: next });
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError('Error', err.message || 'Could not update the inquiry.');
    }
  };

  const confirmDelete = async () => {
    try {
      await adminInquiryService.remove(deleting.id);
      showSuccess('Inquiry deleted');
      setDeleting(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError('Error', err.message || 'Could not delete the inquiry.');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="pb-4 border-b border-stone-200/80">
        <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Inquiries</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Requests customers send from the app for a mobile, accessories or a service, with their budget.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => {
          const count = tab.key === 'all' ? total : counts[tab.key] ?? 0;
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
            placeholder="Search by customer name, mobile or message..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-xs text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-hidden focus:border-brand-600 shadow-2xs cursor-pointer"
          aria-label="Inquiry type"
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
                <th className="py-2.5 px-5 font-medium">Customer</th>
                <th className="py-2.5 px-4 font-medium">Type</th>
                <th className="py-2.5 px-4 font-medium text-right">Budget</th>
                <th className="py-2.5 px-4 font-medium">Reason</th>
                <th className="py-2.5 px-4 font-medium">Received</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!data &&
                [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3">
                      <div className="h-4 bg-stone-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))}
              {data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-stone-400">
                    <MessageSquareText className="w-7 h-7 mx-auto mb-2 opacity-60" />
                    {search || status !== 'all' || category !== 'all'
                      ? 'No inquiries match these filters.'
                      : 'No inquiries yet. They appear here when customers send one from the app.'}
                  </td>
                </tr>
              )}
              {data?.items.map((inq) => (
                <tr key={inq.id} className="hover:bg-stone-50/60 align-top">
                  <td className="py-3 px-5 whitespace-nowrap">
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
                    <p className="whitespace-pre-line break-words">{inq.message}</p>
                    {inq.adminNote && (
                      <p className="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 break-words">
                        Note: {inq.adminNote}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-stone-500 whitespace-nowrap">{formatRelativeTime(inq.createdAt)}</td>
                  <td className="py-3 px-4">
                    <select
                      value={inq.status}
                      onChange={(e) => changeStatus(inq, e.target.value)}
                      className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer focus:outline-hidden ${STATUS_SELECT[inq.status]}`}
                      aria-label="Status"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="closed">Closed</option>
                    </select>
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
                      aria-label="Delete inquiry"
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
            <h3 className="text-sm font-semibold text-stone-900">Delete this inquiry?</h3>
            <p className="text-stone-500">It is removed for the customer too. This cannot be undone.</p>
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
