import { SchemaPreview } from '@/components/schema-preview';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container app-shell">
      <section className="hero card">
        <p className="eyebrow">Finance Operations Workspace</p>
        <h1>Unified Finance Console</h1>
        <p className="hero-copy">
          Manage internal invoices, approvals, and payment execution from one focused interface.
        </p>
        <div className="pill-nav">
          <Link href="/internal-invoices" className="pill-link">
            Internal Invoices
          </Link>
          <Link href="/pending-payments" className="pill-link">
            Pending Payments
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>Platform Notes</h2>
        <p>
          This frontend consumes shared Zod schemas from <code>@repo/shared</code>.
        </p>
      </section>

      <SchemaPreview />
    </main>
  );
}
