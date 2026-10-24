import { STATUS_LABEL } from '@/lib/source';

/** A small inline status badge, e.g. <Badge status="coming-soon" /> next to a field. */
export function Badge({ status }: { status: 'coming-soon' | 'new' }) {
  return (
    <span className="ch-badge align-middle" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}
