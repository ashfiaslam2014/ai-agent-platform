"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { BusinessSelect, useBusinessPicker } from "../_components/BusinessPicker";

type Trace = {
  id: string;
  channel: string;
  input: string;
  final_output: string;
  steps: { layer: string; ok: boolean; detail: Record<string, unknown> }[];
  used_skills: string[];
  duration_ms: number;
  degraded: boolean;
  created_at: string;
};

export default function TracesPage() {
  const { businesses, businessId, choose } = useBusinessPicker();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    fetch(`/api/traces?business_id=${businessId}&limit=40`)
      .then((r) => r.json())
      .then((d) => setTraces(d.traces ?? []))
      .catch(() => {});
  }, [businessId]);

  useEffect(load, [load]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <NavBar />
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Decision traces</h1>
            <p className="text-sm text-zinc-500">Every message, and exactly how the agent handled it.</p>
          </div>
          <div className="flex gap-2">
            <BusinessSelect businesses={businesses} businessId={businessId} onChange={choose} />
            <button onClick={load} className="px-3 py-2 text-sm bg-zinc-100 dark:bg-zinc-800 rounded-md">
              Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {traces.map((t) => (
            <div key={t.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <button
                onClick={() => setOpen(open === t.id ? null : t.id)}
                className="w-full text-left p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.input}</p>
                  <p className="text-xs text-zinc-500 truncate">{t.final_output}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs text-zinc-500">
                  {t.used_skills?.map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      {s}
                    </span>
                  ))}
                  {t.degraded && <span className="text-amber-600">degraded</span>}
                  <span>{t.duration_ms}ms</span>
                  <span>{t.channel}</span>
                </div>
              </button>
              {open === t.id && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 space-y-2">
                  {t.steps.map((step, i) => (
                    <div key={i} className="text-xs font-mono">
                      <span className={step.ok ? "text-green-600" : "text-red-500"}>
                        {step.ok ? "ok" : "fail"} · {step.layer}
                      </span>
                      <pre className="mt-1 p-2 bg-zinc-50 dark:bg-zinc-800/60 rounded overflow-x-auto">
                        {JSON.stringify(step.detail, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {traces.length === 0 && <p className="text-sm text-zinc-500">No traces yet for this business.</p>}
        </div>
      </div>
    </div>
  );
}
