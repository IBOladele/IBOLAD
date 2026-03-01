import { SchemaPreview } from '@/components/schema-preview';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container">
      <h1>Monorepo Starter</h1>
      <p>The frontend consumes shared Zod schemas from <code>@repo/shared</code>.</p>
      <p>
        <Link href="/internal-invoices">Open Internal Invoices UI</Link>
      </p>
      <p>
        <Link href="/pending-payments">Open Pending Payments UI</Link>
      </p>
      <SchemaPreview />
    </main>
  );
}
