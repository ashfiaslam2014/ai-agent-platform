"use client";

import { useEffect, useState } from "react";

export type Business = { id: string; name: string };

/** Shared business selector for the module dashboards. Persists the choice. */
export function useBusinessPicker() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState<string>("");

  useEffect(() => {
    fetch("/api/businesses")
      .then((r) => r.json())
      .then((data: Business[]) => {
        setBusinesses(data);
        const saved = typeof window !== "undefined" ? localStorage.getItem("aap_dash_business") : null;
        const next = saved && data.some((b) => b.id === saved) ? saved : data[0]?.id ?? "";
        setBusinessId(next);
      })
      .catch(() => {});
  }, []);

  function choose(id: string) {
    setBusinessId(id);
    try {
      localStorage.setItem("aap_dash_business", id);
    } catch {}
  }

  return { businesses, businessId, choose };
}

export function BusinessSelect({
  businesses,
  businessId,
  onChange,
}: {
  businesses: Business[];
  businessId: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={businessId}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
    >
      {businesses.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
