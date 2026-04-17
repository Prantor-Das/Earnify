"use client";

import { withAuth } from "../components/auth/withAuth";

const stats = [
  { label: "Active campaigns", value: "24" },
  { label: "Creators onboarded", value: "3.8K" },
  { label: "Tracked payouts", value: "$148K" }
];

function HomePage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <section
        className="mx-auto flex max-w-6xl flex-col gap-10 rounded-lg border border-border p-6 shadow-xl md:p-10"
        style={{
          backgroundColor: "var(--color-surface)",
          boxShadow: "0 24px 80px color-mix(in srgb, var(--color-primary) 12%, transparent)"
        }}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <span className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-background">
              Earnify Platform Starter
            </span>
            <h1 className="text-balance text-2xl font-bold tracking-tight text-secondary md:text-5xl">
              Launch social campaigns, verify creator posts, and track payouts in one place.
            </h1>
            <p className="max-w-xl text-md leading-7 text-muted">
              This monorepo ships with a Next.js frontend, an Express API, shared types, and a Prisma data layer
              designed for founder-led campaign growth.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-border bg-background p-4">
                <p className="text-sm font-medium text-muted">{stat.label}</p>
                <p className="mt-2 text-xl font-semibold text-secondary">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-lg bg-secondary p-6 text-background">
            <p
              className="text-sm font-medium uppercase tracking-[0.2em]"
              style={{ color: "color-mix(in srgb, var(--color-background) 80%, transparent)" }}
            >
              Creator engine
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <article
                className="rounded-md p-4 backdrop-blur-sm"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-background) 10%, transparent)" }}
              >
                <h2 className="text-lg font-semibold">Campaign intake</h2>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: "color-mix(in srgb, var(--color-background) 85%, transparent)" }}
                >
                  Founders can publish budgets, product links, end dates, and Stellar payout details.
                </p>
              </article>
              <article
                className="rounded-md p-4 backdrop-blur-sm"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-background) 10%, transparent)" }}
              >
                <h2 className="text-lg font-semibold">Post verification</h2>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: "color-mix(in srgb, var(--color-background) 85%, transparent)" }}
                >
                  Review creator posts across Twitter, LinkedIn, and Instagram with authenticity scoring.
                </p>
              </article>
            </div>
          </div>

          <aside className="rounded-lg border border-border bg-background p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">System map</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
              <li>
                <span className="font-semibold text-secondary">`apps/web`</span> for the dashboard, marketing pages, and
                authenticated creator experience.
              </li>
              <li>
                <span className="font-semibold text-secondary">`apps/api`</span> for campaign workflows, scoring, and
                payout APIs.
              </li>
              <li>
                <span className="font-semibold text-secondary">`packages/db`</span> for Prisma models, migrations, and
                database seeding.
              </li>
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default withAuth(HomePage);
