// @ts-nocheck
/*
 * Maintenance mode: while the system is being updated, only the owner account
 * keeps access. Everyone else sees the maintenance notice instead of the app.
 * Turn off by setting MAINTENANCE_MODE to false.
 */
export const MAINTENANCE_MODE = true;

const OWNER_LOGIN = 'string';
const LOGIN_ID_KEY = 'alpha_login_id';

const norm = (v) => String(v ?? '').trim().toLowerCase();

export function rememberLoginId(id) {
  try { localStorage.setItem(LOGIN_ID_KEY, String(id ?? '').trim()); } catch { /* private mode */ }
}

export function forgetLoginId() {
  try { localStorage.removeItem(LOGIN_ID_KEY); } catch { /* private mode */ }
}

/** True for the owner account — matched by the login used or by the /auth/me profile. */
export function isMaintenanceExempt(user) {
  let loginId = '';
  try { loginId = localStorage.getItem(LOGIN_ID_KEY) || ''; } catch { /* private mode */ }
  if (norm(loginId) === OWNER_LOGIN) return true;
  return [user?.phone, user?.email, user?.username, user?.login, user?.full_name]
    .some((v) => norm(v) === OWNER_LOGIN);
}
