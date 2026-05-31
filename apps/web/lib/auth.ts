/**
 * Browser-side token storage. Pragmatic localStorage for a single-tenant
 * admin tool — server-side rendering doesn't need the tokens because
 * every authenticated screen is a client component.
 */
const ACCESS = 'placescraper.access';
const REFRESH = 'placescraper.refresh';
const EXPIRES_AT = 'placescraper.expires_at';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function saveTokens(t: StoredTokens) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS, t.accessToken);
  localStorage.setItem(REFRESH, t.refreshToken);
  localStorage.setItem(EXPIRES_AT, String(Date.now() + t.expiresIn * 1000));
}

export function loadAccess(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS);
}

export function loadRefresh(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(EXPIRES_AT);
}

export function isAuthed(): boolean {
  return !!loadAccess();
}
