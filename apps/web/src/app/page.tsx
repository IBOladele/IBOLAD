import { SchemaPreview } from '@/components/schema-preview';
import { LandingAuthCards } from '@/components/landing-auth-cards';

export default function HomePage() {
  return (
    <main className="container landing">
      <section className="landing-hero card panel">
        <div className="landing-mark">F</div>
        <p className="eyebrow">FinOps Finance Command</p>
        <h1>
          Own every naira and pound
          <br />
          before it moves.
        </h1>
        <p className="hero-copy">
          FinOps is your operations-grade control room for spend, approvals, payroll, invoices, and payouts.
          Move fast without losing control.
        </p>
        <div className="hero-metrics">
          <span>Policy-Driven Approvals</span>
          <span>FX Locking + Audit Trails</span>
          <span>Payroll + Invoice Ops</span>
        </div>
      </section>

      <LandingAuthCards />

      <SchemaPreview />
    </main>
  );
}
