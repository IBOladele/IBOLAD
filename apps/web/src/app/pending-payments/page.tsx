import { PendingPaymentsConsole } from '@/components/pending-payments-console';

export default function PendingPaymentsPage() {
  return (
    <main className="container">
      <h1>Pending Payments</h1>
      <p>List approved spend items pending payment execution and mark them as PAID.</p>
      <PendingPaymentsConsole />
    </main>
  );
}
