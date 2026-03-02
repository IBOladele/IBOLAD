'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, fetchSessionProfile, getApiBaseUrl, type SessionProfile } from '@/lib/auth-client';

type SessionGuardProps = {
  children: ReactNode;
  required_roles?: string[];
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

export function SessionGuard({ children, required_roles }: SessionGuardProps) {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionProfile, setSessionProfile] = useState<SessionProfile | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSession() {
      setIsLoading(true);
      setError('');
      try {
        const profile = await fetchSessionProfile(apiBaseUrl);
        if (!isActive) {
          return;
        }
        setSessionProfile(profile);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }
        clearAuthToken();
        setSessionProfile(null);
        setError(getErrorMessage(caughtError));
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      isActive = false;
    };
  }, [apiBaseUrl]);

  if (isLoading) {
    return (
      <section className="card page-intro">
        <p className="eyebrow">Session</p>
        <h1>Checking Access</h1>
        <p className="muted">Validating your FinOps session.</p>
      </section>
    );
  }

  if (sessionProfile === null) {
    return (
      <section className="card page-intro">
        <p className="eyebrow">Session</p>
        <h1>Authentication Required</h1>
        <p className="muted">{error === '' ? 'Sign in to access live modules.' : error}</p>
        <div className="pill-nav">
          <Link href="/" className="pill-link">
            Go To Login
          </Link>
        </div>
      </section>
    );
  }

  if (
    required_roles &&
    required_roles.length > 0 &&
    !required_roles.some((role) => sessionProfile.roles.includes(role))
  ) {
    return (
      <section className="card page-intro">
        <p className="eyebrow">Session</p>
        <h1>Access Restricted</h1>
        <p className="muted">
          This module requires one of: {required_roles.join(', ')}. Your roles: {sessionProfile.roles.join(', ') || 'None'}.
        </p>
        <div className="pill-nav">
          <Link href="/" className="pill-link">
            Back To Dashboard
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="card panel">
        <p className="eyebrow">Session</p>
        <h2>{sessionProfile.user.email}</h2>
        <p className="muted">
          Roles: {sessionProfile.roles.join(', ') || 'None'}
        </p>
      </section>
      {children}
    </>
  );
}
