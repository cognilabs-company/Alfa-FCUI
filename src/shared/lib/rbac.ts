// @ts-nocheck
export const ROLE_PERMISSIONS = {
  'Super Admin': '*',
  'Director': ['students:view','groups:view','attendance:view','reports:attendance:view','reports:dashboard:view','gate:logs:view','settings:system:view','contracts:view','finance:transactions:view','finance:expenses:view'],
  'Accountant': ['students:view','reports:dashboard:view','contracts:view','finance:transactions:view','finance:expenses:view','finance:expenses:edit'],
  'Admin': ['students:view','students:edit','groups:view','groups:edit','attendance:view','gate:logs:view','reports:dashboard:view','contracts:view','contracts:edit','finance:transactions:view','users:manage','roles:manage','settings:system:view'],
  'Head Coach': ['students:view','groups:view','groups:edit','attendance:view','attendance:coach:mark','sessions:create','sessions:manage','reports:dashboard:view'],
  'Coach': ['students:view','groups:view','attendance:view','attendance:coach:mark'],
};

export function normalizeRoleName(name) {
  if (!name) return null;
  if (Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, name)) return name;
  const cleaned = String(name).toLowerCase().replace(/[-_]/g, ' ').trim();
  const match = Object.keys(ROLE_PERMISSIONS).find(k => k.toLowerCase() === cleaned);
  return match || null;
}

export function hasPerm(role, perm) {
  const normalized = normalizeRoleName(role) || role;
  const p = ROLE_PERMISSIONS[normalized];
  if (p === '*') return true;
  if (!p) return false;
  return p.includes(perm);
}
