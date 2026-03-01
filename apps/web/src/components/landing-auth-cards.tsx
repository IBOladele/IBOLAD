'use client';

import { useMemo, useState } from 'react';
import { buildBearerAuthHeader, clearAuthToken, getApiBaseUrl, setAuthToken } from '@/lib/auth-client';

type SessionUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
};

type AuthResponse = {
  token?: string;
  user?: SessionUser;
  error?: string;
};

type MeResponse = {
  user?: SessionUser;
  roles?: string[];
  department_ids?: string[];
  error?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

export function LandingAuthCards() {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [signedInUser, setSignedInUser] = useState<SessionUser | null>(null);
  const [signedInRoles, setSignedInRoles] = useState<string[]>([]);

  const [organizationName, setOrganizationName] = useState('FinOps Group Ltd');
  const [organizationAdminName, setOrganizationAdminName] = useState('');
  const [organizationEmail, setOrganizationEmail] = useState('');
  const [organizationPassword, setOrganizationPassword] = useState('');

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  async function runAuthRequest(path: string, body: Record<string, unknown>) {
    if (apiBaseUrl === '') {
      throw new Error('Missing environment variable: NEXT_PUBLIC_API_BASE_URL');
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as AuthResponse;
    if (!response.ok || !payload.token || !payload.user) {
      throw new Error(payload.error ?? `Request failed (${response.status})`);
    }

    setAuthToken(payload.token);
    setSignedInUser(payload.user);
  }

  async function loadSessionProfile() {
    if (apiBaseUrl === '') {
      setMessage('Missing environment variable: NEXT_PUBLIC_API_BASE_URL');
      return;
    }

    const authHeaders = buildBearerAuthHeader();
    if (!authHeaders.authorization) {
      setMessage('No active session. Sign up or log in first.');
      setSignedInUser(null);
      setSignedInRoles([]);
      return;
    }

    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl}/auth/me`, {
        cache: 'no-store',
        headers: authHeaders,
      });
      const payload = (await response.json()) as MeResponse;
      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? `Session lookup failed (${response.status})`);
      }

      setSignedInUser(payload.user);
      setSignedInRoles(payload.roles ?? []);
      setMessage(`Signed in as ${payload.user.email}`);
    } catch (error) {
      clearAuthToken();
      setSignedInUser(null);
      setSignedInRoles([]);
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function signupOrganization() {
    setIsBusy(true);
    setMessage('');
    try {
      await runAuthRequest('/auth/signup', {
        name: organizationAdminName,
        email: organizationEmail,
        password: organizationPassword,
        signup_type: 'ORGANIZATION',
        organization_name: organizationName,
      });

      await loadSessionProfile();
      setMessage('Organization admin account created and signed in.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function signupInvitedEmployee() {
    setIsBusy(true);
    setMessage('');
    try {
      await runAuthRequest('/auth/signup', {
        name: inviteName,
        email: inviteEmail,
        password: invitePassword,
        signup_type: 'EMPLOYEE',
        invite_code: inviteCode.trim() === '' ? undefined : inviteCode.trim(),
      });

      await loadSessionProfile();
      setMessage('Invite accepted. Employee account is now active.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function loginExistingUser() {
    setIsBusy(true);
    setMessage('');
    try {
      await runAuthRequest('/auth/login', {
        email: loginEmail,
        password: loginPassword,
      });

      await loadSessionProfile();
      setMessage('Login successful.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function logout() {
    if (apiBaseUrl === '') {
      setMessage('Missing environment variable: NEXT_PUBLIC_API_BASE_URL');
      return;
    }

    const authHeaders = buildBearerAuthHeader();
    clearAuthToken();
    setSignedInUser(null);
    setSignedInRoles([]);

    if (!authHeaders.authorization) {
      setMessage('Logged out.');
      return;
    }

    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: authHeaders,
      });
      setMessage('Logged out.');
    } catch {
      setMessage('Logged out locally.');
    }
  }

  return (
    <>
      <section className="entry-grid">
        <article className="card panel entry-card">
          <p className="entry-tag">For Organizations</p>
          <h2>Launch Your Finance Control Tower</h2>
          <p className="muted">
            Create your FinOps workspace and establish your first admin identity in one step.
          </p>
          <div className="form-grid">
            <label>
              Organization Name
              <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
            </label>
            <label>
              Admin Name
              <input value={organizationAdminName} onChange={(event) => setOrganizationAdminName(event.target.value)} />
            </label>
            <label>
              Work Email
              <input value={organizationEmail} onChange={(event) => setOrganizationEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={organizationPassword}
                onChange={(event) => setOrganizationPassword(event.target.value)}
              />
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="btn" disabled={isBusy} onClick={signupOrganization}>
              Create FinOps Workspace
            </button>
          </div>
        </article>

        <article className="card panel entry-card">
          <p className="entry-tag">For Invited Employees</p>
          <h2>Claim Your Seat</h2>
          <p className="muted">
            Activate your account with invite details and start operating in your assigned role.
          </p>
          <div className="form-grid">
            <label>
              Full Name
              <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} />
            </label>
            <label>
              Work Email
              <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            </label>
            <label>
              Invite Code
              <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={invitePassword}
                onChange={(event) => setInvitePassword(event.target.value)}
              />
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="btn btn-secondary" disabled={isBusy} onClick={signupInvitedEmployee}>
              Join Organization
            </button>
          </div>
        </article>

        <article className="card panel entry-card">
          <p className="entry-tag">For Existing Users</p>
          <h2>Login and Execute</h2>
          <p className="muted">
            Sign in and continue approvals, payroll, invoices, and payment execution.
          </p>
          <div className="form-grid">
            <label>
              Work Email
              <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>
          </div>
          <div className="button-row">
            <button type="button" className="btn" disabled={isBusy} onClick={loginExistingUser}>
              Login to Workspace
            </button>
            <button type="button" className="btn btn-secondary" disabled={isBusy} onClick={loadSessionProfile}>
              Check Session
            </button>
            <button type="button" className="btn btn-secondary" disabled={isBusy} onClick={logout}>
              Logout
            </button>
          </div>
        </article>
      </section>

      <section className="card panel">
        <h2>Session</h2>
        <p className="muted">
          {signedInUser
            ? `Signed in as ${signedInUser.email}${signedInRoles.length ? ` | Roles: ${signedInRoles.join(', ')}` : ''}`
            : 'No active session.'}
        </p>
        {message && <p className="muted">{message}</p>}
      </section>
    </>
  );
}
