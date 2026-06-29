import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AuthSessionRecord } from '../lib/types';
import { AppShellNav } from './app-shell-nav';
import { SignOutButton } from './sign-out-button';

const navItems = [
  { href: '/app', label: 'Overview' },
  { href: '/app/documents', label: 'Documents' },
  { href: '/app/reviews', label: 'Classification Reviews' },
  { href: '/app/review-queue', label: 'Review Queue' },
  { href: '/app/memos', label: 'Memos' },
  { href: '/app/audit-log', label: 'Audit Log' },
  { href: '/app/team', label: 'Team' },
  { href: '/app/settings', label: 'Settings' },
  { href: '/app/profile', label: 'Profile' },
];

export function AppShell({
  session,
  currentPath,
  title,
  description,
  actions,
  children,
}: {
  session: AuthSessionRecord;
  currentPath: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <div className="mx-auto max-w-[1600px] lg:h-screen lg:overflow-hidden">
        <div className="lg:grid lg:h-full lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-5">
              <Link href="/app" className="flex items-center gap-3">
                <Image
                  src="/brand/substrata-mark.png"
                  alt="Substrata mark"
                  width={36}
                  height={36}
                  className="h-9 w-9"
                />
                <div className="min-w-0">
                  <p className="text-base font-semibold tracking-tight text-slate-950">
                    Substrata
                  </p>
                  <p className="truncate text-xs uppercase tracking-[0.18em] text-slate-500">
                    Compliance workspace
                  </p>
                </div>
              </Link>
            </div>
            <div className="px-4 py-4">
              <Link
                href="/app/documents/new"
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                New Classification
              </Link>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
              {navItems.map((item) => {
                const active = currentPath === item.href || currentPath.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? 'border border-slate-200 bg-slate-100 text-slate-950'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <span className="block truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-slate-200 px-4 py-4">
              <SignOutButton fullWidth />
            </div>
          </aside>

          <main className="min-w-0 lg:h-screen lg:overflow-y-auto">
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
              <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between gap-4 lg:hidden">
                  <Link href="/app" className="flex min-w-0 items-center gap-3">
                    <Image
                      src="/brand/substrata-mark.png"
                      alt="Substrata mark"
                      width={32}
                      height={32}
                      className="h-8 w-8"
                    />
                    <span className="truncate text-sm font-semibold text-slate-950">
                      {session.organization?.name ?? 'Substrata'}
                    </span>
                  </Link>
                  <AppShellNav currentPath={currentPath} navItems={navItems} session={session} />
                </div>

                <div className="mt-4 flex flex-col gap-4 lg:mt-0 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {session.organization?.name}
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                      {title}
                    </h1>
                    {description ? (
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-3 lg:items-end">
                    <div className="hidden min-w-[18rem] rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 lg:block">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {session.user?.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">{session.user?.email}</p>
                      <p className="mt-1 truncate text-xs uppercase tracking-[0.14em] text-slate-500">
                        {session.organization?.name}
                      </p>
                    </div>
                    {actions ? <div>{actions}</div> : null}
                  </div>
                </div>
              </div>
            </header>
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
