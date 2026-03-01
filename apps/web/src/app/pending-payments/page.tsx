import { PendingPaymentsConsole } from '@/components/pending-payments-console';
import { SessionGuard } from '@/components/session-guard';

export default function PendingPaymentsPage() {
  return (
    <main className="container app-shell">
      <SessionGuard required_roles={['PAYOR', 'ADMIN']}>
        <section className="card page-intro">
          <p className="eyebrow">Execution</p>
          <h1>Pending Payments</h1>
          <p>List approved spend items pending payment execution and mark them as PAID.</p>
        </section>
        <PendingPaymentsConsole />
      </SessionGuard>
    </main>
  );
}
