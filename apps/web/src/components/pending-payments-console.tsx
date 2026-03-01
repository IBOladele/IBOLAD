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

export function PendingPaymentsConsole() {
  const defaultApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBase);
  const [userId, setUserId] = useState('66666666-6666-4666-8666-666666666666');
  const [paymentReference, setPaymentReference] = useState('PAY-REF-20260301-001');
  const [paidAt, setPaidAt] = useState('2026-03-01T12:00:00.000Z');
  const [selectedSpendItemId, setSelectedSpendItemId] = useState('');
  const [pendingItems, setPendingItems] = useState<PendingPaymentItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadPendingPayments() {
    setIsBusy(true);
    setMessage('');
    try {
      const params = new URLSearchParams({
        page: '1',
        page_size: '50',
      });

      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, '')}/spend-items/pending-payment?${params.toString()}`,
        {
          cache: 'no-store',
          headers: {
            'x-user-id': userId,
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
    if (selectedSpendItemId.trim() === '') {
      setMessage('Select a spend item first.');
      return;
    }

    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, '')}/spend-items/${selectedSpendItemId}/mark-paid`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-user-id': userId,
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
    <div className="internal-invoice-grid">
      <section className="card">
        <h2>Pending Payment Queue</h2>
        <div className="form-grid">
          <label>
            API Base URL
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
          </label>
          <label>
            User ID
            <input value={userId} onChange={(event) => setUserId(event.target.value)} />
          </label>
        </div>
        <div className="button-row">
          <button type="button" disabled={isBusy} onClick={loadPendingPayments}>
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
              <span>{item.spend_item_type}</span>
              <span>{item.amount_minor} minor</span>
              <span>Approved: {item.approved_at ? new Date(item.approved_at).toLocaleString() : 'N/A'}</span>
            </button>
          ))}
          {pendingItems.length === 0 && <p className="muted">No approved spend items pending payment.</p>}
        </div>
      </section>

      <section className="card">
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
          <button type="button" disabled={isBusy || selectedSpendItemId === ''} onClick={markSelectedPaid}>
            Mark Paid
          </button>
        </div>
        {message && <p className="muted">{message}</p>}
      </section>
    </div>
  );
}
