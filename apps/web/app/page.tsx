'use client';

import React, { useState, useEffect } from 'react';

/**
 * Next.js App Router Root Page (apps/web/app/page.tsx)
 * Connects to the Enterprise IT Support REST API (/api/*) with Keycloak OIDC session tokens.
 */
export default function EnterpriseITSupportPortal() {
  const [user, setUser] = useState<{ id: string; email: string; displayName: string; roleName: string; sbuCode: string } | null>(null);
  const [tickets, setTickets] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <main className="p-8 font-sans">Loading AIIT...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="border-b border-slate-800 pb-4 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">AIIT</h1>
          <p className="text-sm text-slate-400">Multi-SBU AI-Powered Service Desk & Governance Portal</p>
        </div>
        {user && (
          <div className="text-right">
            <span className="text-sm font-medium">{user.displayName}</span>
            <span className="ml-2 px-2 py-1 text-xs rounded bg-indigo-900 text-indigo-200">{user.roleName}</span>
          </div>
        )}
      </header>
      <section>
        <p className="text-slate-300">Active Tickets Loaded: {tickets.length}</p>
      </section>
    </main>
  );
}
