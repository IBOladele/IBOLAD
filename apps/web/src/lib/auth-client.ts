const AUTH_TOKEN_KEY = 'finops_auth_token';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
};

export type SessionProfile = {
  user: SessionUser;
  roles: string[];
  department_ids: string[];
  session: {
    id: string | null;
    expires_at: string | null;
  };
};

type SessionProfileResponse = {
  user?: SessionUser;
  roles?: string[];
  department_ids?: string[];
  session?: {
    id: string | null;
    expires_at: string | null;
  };
  error?: string;
};

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedValue = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (!storedValue || storedValue.trim() === '') {
    return null;
  }

  return storedValue;
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function buildBearerAuthHeader(): Record<string, string> {
  const token = getAuthToken();
  if (!token) {
    return {};
  }

  return {
    authorization: `Bearer ${token}`,
  };
}

export async function fetchSessionProfile(apiBaseUrl: string): Promise<SessionProfile> {
  if (apiBaseUrl === '') {
    throw new Error('Missing environment variable: NEXT_PUBLIC_API_BASE_URL');
  }

  const authHeaders = buildBearerAuthHeader();
  if (!authHeaders.authorization) {
    throw new Error('No active session token');
  }

  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    cache: 'no-store',
    headers: authHeaders,
  });

  const payload = (await response.json()) as SessionProfileResponse;
  if (!response.ok || !payload.user) {
    throw new Error(payload.error ?? `Session lookup failed (${response.status})`);
  }

  return {
    user: payload.user,
    roles: payload.roles ?? [],
    department_ids: payload.department_ids ?? [],
    session: payload.session ?? {
      id: null,
      expires_at: null,
    },
  };
}
