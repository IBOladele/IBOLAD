import { SchemaPreview } from '@/components/schema-preview';
import Link from 'next/link';

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

      <section className="entry-grid">
        <article className="card panel entry-card">
          <p className="entry-tag">For Organizations</p>
          <h2>Launch Your Finance Control Tower</h2>
          <p className="muted">
            Create your FinOps workspace, configure approvals, and onboard departments in minutes.
          </p>
          <form className="form-grid">
            <label>
              Organization Name
              <input placeholder="FinOps Group Ltd" />
            </label>
            <label>
              Work Email
              <input placeholder="finance.lead@company.com" />
            </label>
            <label>
              Country
              <input placeholder="Nigeria / United Kingdom" />
            </label>
            <label>
              Team Size
              <input placeholder="50" />
            </label>
          </form>
          <div className="button-row">
            <button type="button" className="btn">Create FinOps Workspace</button>
          </div>
        </article>

        <article className="card panel entry-card">
          <p className="entry-tag">For Invited Employees</p>
          <h2>Claim Your Seat</h2>
          <p className="muted">
            Accept your invite and jump directly into your assigned role with secure access.
          </p>
          <form className="form-grid">
            <label>
              Work Email
              <input placeholder="you@company.com" />
            </label>
            <label>
              Invite Code
              <input placeholder="INV-9F3K-21A7" />
            </label>
            <label>
              Temporary Password
              <input type="password" placeholder="••••••••" />
            </label>
            <label>
              MFA Code (Optional)
              <input placeholder="123456" />
            </label>
          </form>
          <div className="button-row">
            <button type="button" className="btn btn-secondary">Join Organization</button>
          </div>
        </article>

        <article className="card panel entry-card">
          <p className="entry-tag">For Existing Users</p>
          <h2>Login and Execute</h2>
          <p className="muted">
            Sign in to approve, pay, reconcile, and run mission-critical finance operations.
          </p>
          <form className="form-grid">
            <label>
              Work Email
              <input placeholder="operator@company.com" />
            </label>
            <label>
              Password
              <input type="password" placeholder="••••••••" />
            </label>
            <label>
              Workspace ID
              <input placeholder="ORG-AB12" />
            </label>
            <label>
              Security Key
              <input placeholder="Tap or enter backup code" />
            </label>
          </form>
          <div className="button-row">
            <button type="button" className="btn">Login to Workspace</button>
          </div>
        </article>
      </section>

      <section className="card panel">
        <h2>Live Modules</h2>
        <p className="muted">Jump into the active product surfaces used in this workspace.</p>
        <div className="pill-nav">
          <Link href="/internal-invoices" className="pill-link">
            Open Internal Invoices
          </Link>
          <Link href="/pending-payments" className="pill-link">
            Open Pending Payments
          </Link>
        </div>
      </section>

      <SchemaPreview />
    </main>
  );
}
