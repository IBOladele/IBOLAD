'use client';

import { useState } from 'react';

type PendingPaymentItem = {
  id: string;
  description: string;
  spend_item_type: string;
  amount_minor: string;
  currency_id: string;
  department_id: string | null;
  approved_at: string | null;
  status: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';
const actorUserId = process.env.NEXT_PUBLIC_FINOPS_ACTOR_USER_ID ?? '';
const missingRuntimeConfig: string[] = [];

if (apiBaseUrl === '') {
  missingRuntimeConfig.push('NEXT_PUBLIC_API_BASE_URL');
}

if (actorUserId === '') {
  missingRuntimeConfig.push('NEXT_PUBLIC_FINOPS_ACTOR_USER_ID');
}

const runtimeConfigError =
  missingRuntimeConfig.length === 0
    ? ''
    : `Missing environment variable(s): ${missingRuntimeConfig.join(', ')}.`;

export function PendingPaymentsConsole() {
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString());
  const [selectedSpendItemId, setSelectedSpendItemId] = useState('');
  const [pendingItems, setPendingItems] = useState<PendingPaymentItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadPendingPayments() {
    if (runtimeConfigError !== '') {
      setMessage(runtimeConfigError);
      return;
    }

    setIsBusy(true);
    setMessage('');
    try {
      const params = new URLSearchParams({
        page: '1',
        page_size: '50',
      });

      const response = await fetch(
        `${apiBaseUrl}/spend-items/pending-payment?${params.toString()}`,
        {
          cache: 'no-store',
          headers: {
            'x-user-id': actorUserId,
          },
        },
      );

      const payload = (await response.json()) as { data?: PendingPaymentItem[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Pending payment list failed (${response.status})`);
      }

      const items = payload.data ?? [];
      setPendingItems(items);
      if (items.length > 0 && selectedSpendItemId === '') {
        setSelectedSpendItemId(items[0]?.id ?? '');
      }
      setMessage(`Loaded ${items.length} approved spend items pending payment.`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function markSelectedPaid() {
    if (runtimeConfigError !== '') {
      setMessage(runtimeConfigError);
      return;
    }

    if (selectedSpendItemId.trim() === '') {
      setMessage('Select a spend item first.');
      return;
    }

    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `${apiBaseUrl}/spend-items/${selectedSpendItemId}/mark-paid`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-user-id': actorUserId,
          },
          body: JSON.stringify({
            payment_reference: paymentReference,
            paid_at: paidAt,
          }),
        },
      );

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Mark paid failed (${response.status})`);
      }

      setMessage(`Spend item ${selectedSpendItemId} marked as PAID.`);
      setSelectedSpendItemId('');
      await loadPendingPayments();
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <section className="card panel">
        <h2>Pending Payment Queue</h2>
        <p className="muted">
          {runtimeConfigError !== '' ? runtimeConfigError : `Connected to API: ${apiBaseUrl}`}
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-secondary" disabled={isBusy || runtimeConfigError !== ''} onClick={loadPendingPayments}>
            Refresh Pending
          </button>
        </div>

        <div className="list">
          {pendingItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`list-item ${selectedSpendItemId === item.id ? 'active' : ''}`}
              onClick={() => setSelectedSpendItemId(item.id)}
            >
              <strong>{item.description}</strong>
              <span className="list-meta">{item.spend_item_type}</span>
              <span className="list-meta">{item.amount_minor} minor</span>
              <span className="list-meta">Approved: {item.approved_at ? new Date(item.approved_at).toLocaleString() : 'N/A'}</span>
            </button>
          ))}
          {pendingItems.length === 0 && <p className="muted">No approved spend items pending payment.</p>}
        </div>
      </section>

      <section className="card panel">
        <h2>Mark As Paid</h2>
        <div className="form-grid">
          <label>
            Selected Spend Item ID
            <input value={selectedSpendItemId} onChange={(event) => setSelectedSpendItemId(event.target.value)} />
          </label>
          <label>
            Payment Reference
            <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
          </label>
          <label>
            Paid At (ISO)
            <input value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
          </label>
        </div>
        <div className="button-row">
          <button type="button" className="btn" disabled={isBusy || runtimeConfigError !== '' || selectedSpendItemId === ''} onClick={markSelectedPaid}>
            Mark Paid
          </button>
        </div>
        {message && <p className="muted">{message}</p>}
      </section>
    </div>
  );
}
