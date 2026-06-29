'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AuthSessionRecord } from '../lib/types';
import { SignOutButton } from './sign-out-button';

type NavItem = {
  href: string;
  label: string;
};

export function AppShellNav({
  currentPath,
  navItems,
  session,
}: {
  currentPath: string;
  navItems: NavItem[];
  session: AuthSessionRecord;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-workspace-nav"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        {open ? 'Close' : 'Menu'}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/30 lg:hidden" onClick={() => setOpen(false)}>
          <div
            id="mobile-workspace-nav"
            className="ml-auto flex h-full w-full max-w-[20rem] flex-col border-l border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-4 py-4">
              <p className="truncate text-sm font-semibold text-slate-950">
                {session.organization?.name}
              </p>
              <p className="mt-1 truncate text-xs uppercase tracking-[0.16em] text-slate-500">
                Compliance workspace
              </p>
            </div>
            <div className="px-4 py-4">
              <Link
                href="/app/documents/new"
                onClick={() => setOpen(false)}
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                New Classification
              </Link>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
              {navItems.map((item) => {
                const active =
                  currentPath === item.href || currentPath.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? 'bg-slate-950 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-slate-200 px-4 py-4">
              <div className="mb-3">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {session.user?.name}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">{session.user?.email}</p>
              </div>
              <SignOutButton fullWidth onComplete={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
