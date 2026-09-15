// @ts-nocheck
import { contractStatusBadge } from '@/shared/ui/status';

export function statusChip(status, t = (k) => k) {
  return contractStatusBadge(status, t);
}
