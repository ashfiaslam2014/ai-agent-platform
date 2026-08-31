"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { BusinessSelect, useBusinessPicker } from "../_components/BusinessPicker";

type Version = { id: string; version: number; note: string | null; is_active: boolean; created_at: string };

export default function PromptsPage() {
  const { businesses, businessId, choose } = useBusinessPicker();
  const [versions, setVersions] = useState<Version[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!businessId) return;
    fetch(`/api/businesses/${businessId}/prompts`)
      .then((r) => r.json())
      .then((d) => {
        setVersions(d.versions ?? []);
        setActive(d.active ?? null);
        setDraft(d.active ?? "");
      })
      .catch(() => {});
  }, [businessId]);

  useEffect(load, [load]);

  async function saveNew() {
    if (!draft.trim()) return;
    setSaving(true);
    await fetch(`/api/businesses/${businessId}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft, note, activate: true }),
    });
    setNote("");
    setSaving(false);
    load();
  }

  async function activate(version: number) {
    await fetch(`/api/businesses/${businessId}/prompts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    load();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <NavBar />
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">System prompt</h1>
            <p className="text-sm text-zinc-500">
              Every save is a new version. Roll back anytime — run the eval after changing it.
            </p>
          </div>
          <BusinessSelect businesses={businesses} businessId={businessId} onChange={choose} />
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
          placeholder={active ? "" : "No active prompt — the businesses.system_prompt fallback is in use."}
          className="w-full p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono"
        />
        <div className="flex items-center gap-2 mt-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What changed? (optional)"
            className="flex-1 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
          <button
            onClick={saveNew}
            disabled={saving || !draft.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save new version"}
          </button>
        </div>

        <h2 className="text-sm font-medium mt-8 mb-2">History</h2>
        <div className="flex flex-col gap-2">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-sm"
            >
              <div>
                <span className="font-medium">v{v.version}</span>
                {v.is_active && <span className="ml-2 text-xs text-green-600">active</span>}
                {v.note && <span className="ml-2 text-zinc-500">— {v.note}</span>}
              </div>
              {!v.is_active && (
                <button onClick={() => activate(v.version)} className="text-xs text-blue-600 dark:text-blue-400">
                  Activate
                </button>
              )}
            </div>
          ))}
          {versions.length === 0 && <p className="text-sm text-zinc-500">No versions saved yet.</p>}
        </div>
      </div>
    </div>
  );
}
