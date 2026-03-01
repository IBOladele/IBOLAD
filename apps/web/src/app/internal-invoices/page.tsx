import { InternalInvoicesConsole } from '@/components/internal-invoices-console';

export default function InternalInvoicesPage() {
  return (
    <main className="container">
      <h1>Internal Invoices</h1>
      <p>Create, review, and submit internal invoices using the unified approvals workflow.</p>
      <InternalInvoicesConsole />
    </main>
  );
}
