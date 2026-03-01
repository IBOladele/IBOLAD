import { SchemaPreview } from '@/components/schema-preview';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container landing">
      <section className="landing-hero card panel">
        <div className="landing-mark">F</div>
        <p className="eyebrow">ForgePay Finance OS</p>
        <h1>
          Run every naira and pound
          <br />
          like a strike team.
        </h1>
        <p className="hero-copy">
          One battlefield for spend control, approvals, payroll, and payment execution.
          Built for organizations that move fast and hate financial chaos.
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
          <h2>Start Your Control Tower</h2>
          <p className="muted">
            Spin up your finance workspace, define approval policies, and onboard teams in minutes.
          </p>
          <form className="form-grid">
            <label>
              Organization Name
              <input placeholder="ForgePay Holdings Ltd" />
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
            <button type="button" className="btn">Create Organization Workspace</button>
          </div>
        </article>

        <article className="card panel entry-card">
          <p className="entry-tag">For Invited Employees</p>
          <h2>Claim Your Seat</h2>
          <p className="muted">
            Got invited? Enter your invite details and get straight into your assigned finance role.
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
            Back in the arena. Sign in to approve, pay, reconcile, and keep cash movement locked down.
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
