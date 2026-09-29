import { ShieldCheck, ShieldOff } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

/**
 * Warranty state of a purchase for the purchase cards:
 * "Under Warranty" while the warranty runs, "Out of Warranty" once it has ended or when the
 * product had none. Cancelled purchases show "Cancelled" instead (their warranty is void).
 * The server works out the state (`warranty.status`: Active / Expired / Void).
 */
export const WarrantyBadge = ({ purchase, size = 'sm' }) => {
  if (purchase.status === 'Cancelled') return <StatusBadge status="Cancelled" size={size} />;

  const covered = purchase.warranty?.status === 'Active';
  const Icon = covered ? ShieldCheck : ShieldOff;
  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-md border tracking-tight whitespace-nowrap select-none ${
        covered
          ? 'bg-emerald-50/90 text-emerald-800 border-emerald-200/70'
          : 'bg-stone-100 text-stone-600 border-stone-300/70'
      } ${isSmall ? 'text-[10.5px] px-2 py-0.5' : 'text-[11.5px] px-2.5 py-1'}`}
      title={
        covered && purchase.warranty?.validUntil
          ? `Warranty valid until ${purchase.warranty.validUntil}`
          : purchase.warranty?.validUntil
            ? `Warranty ended on ${purchase.warranty.validUntil}`
            : 'No warranty on this purchase'
      }
    >
      <Icon className={isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{covered ? 'Under Warranty' : 'Out of Warranty'}</span>
    </span>
  );
};
