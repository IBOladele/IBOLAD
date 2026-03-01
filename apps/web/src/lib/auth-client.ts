const AUTH_TOKEN_KEY = 'finops_auth_token';

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
