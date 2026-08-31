"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { BusinessSelect, useBusinessPicker } from "../_components/BusinessPicker";

type SkillRow = {
  name: string;
  description: string;
  tier: string;
  mutates: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
};

export default function SkillsPage() {
  const { businesses, businessId, choose } = useBusinessPicker();
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState("");

  const load = useCallback(() => {
    if (!businessId) return;
    fetch(`/api/businesses/${businessId}/skills`)
      .then((r) => r.json())
      .then((d) => setSkills(d.skills ?? []))
      .catch(() => {});
  }, [businessId]);

  useEffect(load, [load]);

  async function save(name: string, patch: Partial<SkillRow>) {
    setSavingName(name);
    const row = skills.find((s) => s.name === name)!;
    await fetch(`/api/businesses/${businessId}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skill_name: name,
        enabled: patch.enabled ?? row.enabled,
        config: patch.config ?? row.config,
      }),
    });
    setSavingName(null);
    setEditingConfig(null);
    load();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <NavBar />
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Skills</h1>
            <p className="text-sm text-zinc-500">What the agent is allowed to do for this business.</p>
          </div>
          <BusinessSelect businesses={businesses} businessId={businessId} onChange={choose} />
        </div>

        <div className="flex flex-col gap-3">
          {skills.map((s) => (
            <div
              key={s.name}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-semibold">{s.name}</code>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      {s.tier}
                    </span>
                    {s.mutates && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        writes data
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500 mt-1">{s.description}</p>
                </div>
                <label className="flex items-center gap-2 shrink-0">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    disabled={savingName === s.name}
                    onChange={(e) => save(s.name, { enabled: e.target.checked })}
                  />
                  <span className="text-sm">{s.enabled ? "On" : "Off"}</span>
                </label>
              </div>

              <div className="mt-3">
                {editingConfig === s.name ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={configDraft}
                      onChange={(e) => setConfigDraft(e.target.value)}
                      rows={4}
                      className="w-full text-xs font-mono p-2 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          try {
                            save(s.name, { config: JSON.parse(configDraft || "{}") });
                          } catch {
                            alert("Config must be valid JSON");
                          }
                        }}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded"
                      >
                        Save config
                      </button>
                      <button
                        onClick={() => setEditingConfig(null)}
                        className="px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingConfig(s.name);
                      setConfigDraft(JSON.stringify(s.config, null, 2));
                    }}
                    className="text-xs text-blue-600 dark:text-blue-400"
                  >
                    {Object.keys(s.config).length ? "Edit config" : "Add config"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {skills.length === 0 && <p className="text-sm text-zinc-500">No business selected.</p>}
        </div>
      </div>
    </div>
  );
}
