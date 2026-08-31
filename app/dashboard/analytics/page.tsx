"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { BusinessSelect, useBusinessPicker } from "../_components/BusinessPicker";

type Analytics = {
  conversations: number;
  agentReplies: number;
  skillRuns: number;
  skillBreakdown: { skill: string; count: number }[];
  avgResponseMs: number | null;
  degradedRate: number | null;
  dailyVolume: { day: string; conversations: number }[];
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { businesses, businessId, choose } = useBusinessPicker();
  const [a, setA] = useState<Analytics | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    fetch(`/api/analytics?business_id=${businessId}&days=30`)
      .then((r) => r.json())
      .then(setA)
      .catch(() => {});
  }, [businessId]);

  useEffect(load, [load]);

  const maxDay = Math.max(1, ...(a?.dailyVolume.map((d) => d.conversations) ?? [1]));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <NavBar />
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Analytics</h1>
            <p className="text-sm text-zinc-500">Last 30 days.</p>
          </div>
          <BusinessSelect businesses={businesses} businessId={businessId} onChange={choose} />
        </div>

        {!a ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Stat label="Conversations" value={a.conversations} />
              <Stat label="Agent replies" value={a.agentReplies} />
              <Stat label="Skill runs" value={a.skillRuns} />
              <Stat label="Avg response" value={a.avgResponseMs ? `${a.avgResponseMs}ms` : "—"} />
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-6">
              <h2 className="text-sm font-medium mb-3">Daily conversations</h2>
              <div className="flex items-end gap-1 h-32">
                {a.dailyVolume.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.conversations}`}>
                    <div
                      className="w-full bg-blue-500/80 rounded-t"
                      style={{ height: `${(d.conversations / maxDay) * 100}%` }}
                    />
                  </div>
                ))}
                {a.dailyVolume.length === 0 && <p className="text-xs text-zinc-500">No data yet.</p>}
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
              <h2 className="text-sm font-medium mb-3">Skill usage</h2>
              {a.skillBreakdown.length === 0 ? (
                <p className="text-xs text-zinc-500">No skills used yet.</p>
              ) : (
                <div className="space-y-2">
                  {a.skillBreakdown.map((s) => (
                    <div key={s.skill} className="flex items-center gap-3 text-sm">
                      <code className="w-44 shrink-0">{s.skill}</code>
                      <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded h-4">
                        <div
                          className="bg-blue-500 h-4 rounded"
                          style={{ width: `${(s.count / a.skillRuns) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 w-8 text-right">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
              {a.degradedRate != null && (
                <p className="text-xs text-zinc-500 mt-3">
                  Degraded replies: {(a.degradedRate * 100).toFixed(1)}%
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
