import { InternalInvoicesConsole } from '@/components/internal-invoices-console';
import { SessionGuard } from '@/components/session-guard';

export default function InternalInvoicesPage() {
  return (
    <main className="container app-shell">
      <SessionGuard>
        <section className="card page-intro">
          <p className="eyebrow">Invoices</p>
          <h1>Internal Invoices</h1>
          <p>Create, review, and submit internal invoices using the unified approvals workflow.</p>
        </section>
        <InternalInvoicesConsole />
      </SessionGuard>
    </main>
  );
}
