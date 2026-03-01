'use client';

import { useMemo, useState } from 'react';

type InternalInvoiceListItem = {
  id: string;
  invoice_number: string;
  status: string;
  from_department_id: string | null;
  to_department_id: string | null;
  currency_id: string;
  total_amount_minor: string;
  created_at: string;
};

type InternalInvoiceDetail = {
  internal_invoice: InternalInvoiceListItem & {
    spend_item_id: string | null;
    submitted_at: string | null;
  };
  line_items: Array<{
    id: string;
    description: string;
    quantity: string;
    unit_amount_minor: string;
    line_amount_minor: string;
  }>;
  attachments: Array<{
    id: string;
    file_name: string;
    mime_type: string;
    size_bytes: string;
  }>;
  timeline: Array<{
    event_type: string;
    occurred_at: string;
    actor_user_id: string | null;
  }>;
  approval_instances: Array<{
    id: string;
    status: string;
    entity_type: string;
  }>;
};

type LineItemForm = {
  description: string;
  quantity: string;
  unit_amount_minor: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

export function InternalInvoicesConsole() {
  const defaultApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBase);
  const [userId, setUserId] = useState('44444444-4444-4444-8444-444444444444');

  const [fromDepartmentId, setFromDepartmentId] = useState('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const [toDepartmentId, setToDepartmentId] = useState('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  const [currencyId, setCurrencyId] = useState('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  const [baseCurrencyId, setBaseCurrencyId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('INT-NEW-001');
  const [invoiceDate, setInvoiceDate] = useState('2026-03-01');
  const [lineItems, setLineItems] = useState<LineItemForm[]>([
    { description: 'Shared infra allocation', quantity: '1', unit_amount_minor: '50000' },
  ]);

  const [attachmentStorageKey, setAttachmentStorageKey] = useState('internal-invoices/supporting.pdf');
  const [attachmentName, setAttachmentName] = useState('supporting.pdf');
  const [attachmentMime, setAttachmentMime] = useState('application/pdf');
  const [attachmentSize, setAttachmentSize] = useState('1024');

  const [statusFilter, setStatusFilter] = useState('');
  const [fromDeptFilter, setFromDeptFilter] = useState('');
  const [toDeptFilter, setToDeptFilter] = useState('');

  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [listData, setListData] = useState<InternalInvoiceListItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detailData, setDetailData] = useState<InternalInvoiceDetail | null>(null);

  const computedDraftTotal = useMemo(() => {
    return lineItems.reduce((sum, line) => {
      const quantity = Number.parseInt(line.quantity, 10);
      const unit = Number.parseInt(line.unit_amount_minor, 10);
      if (!Number.isFinite(quantity) || !Number.isFinite(unit)) {
        return sum;
      }
      return sum + quantity * unit;
    }, 0);
  }, [lineItems]);

  async function listInternalInvoices() {
    setIsBusy(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ page: '1', page_size: '20' });
      if (statusFilter.trim() !== '') {
        params.set('status', statusFilter.trim());
      }
      if (fromDeptFilter.trim() !== '') {
        params.set('from_department_id', fromDeptFilter.trim());
      }
      if (toDeptFilter.trim() !== '') {
        params.set('to_department_id', toDeptFilter.trim());
      }

      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/internal-invoices?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as { data?: InternalInvoiceListItem[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `List failed (${response.status})`);
      }

      setListData(payload.data ?? []);
      setMessage(`Loaded ${(payload.data ?? []).length} internal invoices.`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function loadDetail(invoiceId: string) {
    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/internal-invoices/${invoiceId}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as InternalInvoiceDetail & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Detail failed (${response.status})`);
      }

      setSelectedId(invoiceId);
      setDetailData(payload);
      setMessage(`Loaded detail for invoice ${invoiceId}.`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function createInternalInvoice() {
    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/internal-invoices`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          from_department_id: fromDepartmentId,
          to_department_id: toDepartmentId,
          currency_id: currencyId,
          base_currency_id: baseCurrencyId.trim() === '' ? undefined : baseCurrencyId.trim(),
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          line_items: lineItems.map((line) => ({
            description: line.description,
            quantity: Number.parseInt(line.quantity, 10),
            unit_amount_minor: line.unit_amount_minor,
          })),
          attachments: [
            {
              storage_key: attachmentStorageKey,
              file_name: attachmentName,
              mime_type: attachmentMime,
              size_bytes: attachmentSize,
            },
          ],
        }),
      });

      const payload = (await response.json()) as {
        internal_invoice?: { id: string };
        error?: string;
      };

      if (!response.ok || !payload.internal_invoice) {
        throw new Error(payload.error ?? `Create failed (${response.status})`);
      }

      setMessage(`Created internal invoice ${payload.internal_invoice.id}.`);
      setSelectedId(payload.internal_invoice.id);
      await Promise.all([listInternalInvoices(), loadDetail(payload.internal_invoice.id)]);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function submitInternalInvoice() {
    if (selectedId.trim() === '') {
      setMessage('Select an invoice first.');
      return;
    }

    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, '')}/internal-invoices/${selectedId}/submit`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({}),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Submit failed (${response.status})`);
      }

      setMessage(`Submitted invoice ${selectedId} for approval.`);
      await Promise.all([listInternalInvoices(), loadDetail(selectedId)]);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function updateLineItem(index: number, updates: Partial<LineItemForm>) {
    setLineItems((current) =>
      current.map((line, currentIndex) => (currentIndex === index ? { ...line, ...updates } : line)),
    );
  }

  function addLineItem() {
    setLineItems((current) => [...current, { description: '', quantity: '1', unit_amount_minor: '0' }]);
  }

  return (
    <div className="internal-invoice-grid">
      <section className="card">
        <h2>Create Internal Invoice</h2>
        <div className="form-grid">
          <label>API Base URL<input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} /></label>
          <label>User ID<input value={userId} onChange={(event) => setUserId(event.target.value)} /></label>
          <label>From Department<input value={fromDepartmentId} onChange={(event) => setFromDepartmentId(event.target.value)} /></label>
          <label>To Department<input value={toDepartmentId} onChange={(event) => setToDepartmentId(event.target.value)} /></label>
          <label>Currency<input value={currencyId} onChange={(event) => setCurrencyId(event.target.value)} /></label>
          <label>Base Currency (optional)<input value={baseCurrencyId} onChange={(event) => setBaseCurrencyId(event.target.value)} /></label>
          <label>Invoice Number<input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>
          <label>Invoice Date<input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
        </div>

        <h3>Line Items</h3>
        <div className="line-items">
          {lineItems.map((line, index) => (
            <div key={`line-${index}`} className="line-row">
              <input
                placeholder="Description"
                value={line.description}
                onChange={(event) => updateLineItem(index, { description: event.target.value })}
              />
              <input
                placeholder="Qty"
                value={line.quantity}
                onChange={(event) => updateLineItem(index, { quantity: event.target.value })}
              />
              <input
                placeholder="Unit minor"
                value={line.unit_amount_minor}
                onChange={(event) => updateLineItem(index, { unit_amount_minor: event.target.value })}
              />
            </div>
          ))}
          <button type="button" onClick={addLineItem}>Add Line</button>
          <p className="muted">Draft computed total (minor): {computedDraftTotal}</p>
        </div>

        <h3>Attachment</h3>
        <div className="form-grid">
          <label>Storage Key<input value={attachmentStorageKey} onChange={(event) => setAttachmentStorageKey(event.target.value)} /></label>
          <label>File Name<input value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} /></label>
          <label>MIME Type<input value={attachmentMime} onChange={(event) => setAttachmentMime(event.target.value)} /></label>
          <label>Size (bytes)<input value={attachmentSize} onChange={(event) => setAttachmentSize(event.target.value)} /></label>
        </div>

        <div className="button-row">
          <button type="button" disabled={isBusy} onClick={createInternalInvoice}>Create Draft</button>
          <button type="button" disabled={isBusy || selectedId === ''} onClick={submitInternalInvoice}>Submit Selected</button>
        </div>
        {message && <p className="muted">{message}</p>}
      </section>

      <section className="card">
        <h2>List + Detail</h2>
        <div className="form-grid">
          <label>Status<input value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} placeholder="DRAFT / OPEN" /></label>
          <label>From Dept<input value={fromDeptFilter} onChange={(event) => setFromDeptFilter(event.target.value)} /></label>
          <label>To Dept<input value={toDeptFilter} onChange={(event) => setToDeptFilter(event.target.value)} /></label>
        </div>
        <div className="button-row">
          <button type="button" disabled={isBusy} onClick={listInternalInvoices}>Refresh List</button>
        </div>

        <div className="list">
          {listData.map((invoice) => (
            <button
              type="button"
              key={invoice.id}
              className={`list-item ${selectedId === invoice.id ? 'active' : ''}`}
              onClick={() => loadDetail(invoice.id)}
            >
              <strong>{invoice.invoice_number}</strong>
              <span>{invoice.status}</span>
              <span>{invoice.total_amount_minor} minor</span>
            </button>
          ))}
          {listData.length === 0 && <p className="muted">No invoices loaded.</p>}
        </div>

        {detailData && (
          <div className="detail-block">
            <h3>Invoice Detail: {detailData.internal_invoice.invoice_number}</h3>
            <p className="muted">Status: {detailData.internal_invoice.status}</p>
            <p className="muted">Spend Item: {detailData.internal_invoice.spend_item_id ?? 'None'}</p>
            <h4>Line Items</h4>
            <ul>
              {detailData.line_items.map((lineItem) => (
                <li key={lineItem.id}>
                  {lineItem.description} | qty {lineItem.quantity} | line {lineItem.line_amount_minor}
                </li>
              ))}
            </ul>
            <h4>Attachments</h4>
            <ul>
              {detailData.attachments.map((attachment) => (
                <li key={attachment.id}>
                  {attachment.file_name} ({attachment.mime_type}, {attachment.size_bytes} bytes)
                </li>
              ))}
            </ul>
            <h4>Timeline</h4>
            <ul>
              {detailData.timeline.map((event, index) => (
                <li key={`${event.event_type}-${index}`}>
                  {event.event_type} @ {new Date(event.occurred_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
