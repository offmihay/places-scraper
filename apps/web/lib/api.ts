import { API_URL } from './config';
import { clearTokens, loadAccess, loadRefresh, saveTokens } from './auth';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const refresh = loadRefresh();
  if (!refresh) return null;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return null;
      const tokens = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      };
      saveTokens(tokens);
      return tokens.accessToken;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Don't throw on 4xx — return parsed body so caller can branch. */
  expect4xx?: boolean;
  /** Don't auto-attach Authorization — used for /auth/login. */
  anonymous?: boolean;
}

function qs(params?: ApiOptions['query']): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function request<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, query, expect4xx, anonymous, headers, ...rest } = opts;
  const url = `${API_URL}${path}${qs(query)}`;
  const init: RequestInit = {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  if (!anonymous) {
    const token = loadAccess();
    if (token) {
      (init.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }
  let res = await fetch(url, init);

  if (res.status === 401 && !anonymous) {
    const fresh = await tryRefresh();
    if (fresh) {
      (init.headers as Record<string, string>).Authorization = `Bearer ${fresh}`;
      res = await fetch(url, init);
    } else {
      clearTokens();
    }
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson
    ? ((await res.json().catch(() => null)) as unknown)
    : ((await res.text().catch(() => null)) as unknown);

  if (!res.ok) {
    if (expect4xx && res.status >= 400 && res.status < 500) return payload as T;
    throw new ApiError(
      (payload as { message?: string })?.message ?? `Request failed: ${res.status}`,
      res.status,
      payload,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<ApiOptions, 'body'>) =>
    request<T>(path, { method: 'GET', ...opts }),
  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, { method: 'PATCH', body, ...opts }),
  delete: <T>(path: string, opts?: ApiOptions) =>
    request<T>(path, { method: 'DELETE', ...opts }),
};

export function buildExportUrl(path: string, params?: Record<string, string>): string {
  const token = loadAccess();
  const usp = new URLSearchParams();
  if (token) usp.set('token', token);
  if (params) for (const [k, v] of Object.entries(params)) usp.set(k, v);
  return `${API_URL}${path}?${usp.toString()}`;
}

/** Open an EventSource for SSE — auth via ?token=. */
export function openStream(path: string): EventSource {
  const token = loadAccess();
  const url = `${API_URL}${path}${path.includes('?') ? '&' : '?'}token=${token ?? ''}`;
  return new EventSource(url);
}
