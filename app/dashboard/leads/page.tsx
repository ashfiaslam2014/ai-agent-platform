"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { BusinessSelect, useBusinessPicker } from "../_components/BusinessPicker";
import { authedFetch } from "../_components/api";

const STAGES = ["new", "qualified", "quoted", "won", "lost"] as const;

type Lead = {
  id: string;
  summary: string;
  stage: (typeof STAGES)[number];
  value_aed: number | null;
  source: string | null;
  created_at: string;
  contacts: { name: string | null; phone: string | null; email: string | null } | null;
};

export default function LeadsPage() {
  const { businesses, businessId, choose } = useBusinessPicker();
  const [leads, setLeads] = useState<Lead[]>([]);

  const load = useCallback(() => {
    if (!businessId) return;
    fetch(`/api/leads?business_id=${businessId}`)
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .catch(() => {});
  }, [businessId]);

  useEffect(load, [load]);

  async function move(leadId: string, stage: string) {
    await authedFetch(`/api/leads`, {
      method: "PATCH",
      body: JSON.stringify({ business_id: businessId, lead_id: leadId, stage }),
    });
    load();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <NavBar />
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Leads</h1>
            <p className="text-sm text-zinc-500">Enquiries the agent captured.</p>
          </div>
          <BusinessSelect businesses={businesses} businessId={businessId} onChange={choose} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STAGES.map((stage) => (
            <div key={stage} className="min-w-0">
              <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
                {stage} ({leads.filter((l) => l.stage === stage).length})
              </h2>
              <div className="flex flex-col gap-2">
                {leads
                  .filter((l) => l.stage === stage)
                  .map((l) => (
                    <div
                      key={l.id}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-sm"
                    >
                      <p className="line-clamp-3">{l.summary}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {l.contacts?.name ?? l.contacts?.phone ?? "unknown"}
                        {l.value_aed ? ` · AED ${l.value_aed}` : ""}
                      </p>
                      <select
                        value={l.stage}
                        onChange={(e) => move(l.id, e.target.value)}
                        className="mt-2 w-full text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-800 px-1 py-1"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
        {leads.length === 0 && <p className="text-sm text-zinc-500 mt-4">No leads yet.</p>}
      </div>
    </div>
  );
}
