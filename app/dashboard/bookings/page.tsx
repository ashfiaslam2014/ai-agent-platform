"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { BusinessSelect, useBusinessPicker } from "../_components/BusinessPicker";
import { authedFetch } from "../_components/api";

type Booking = {
  id: string;
  service_name: string;
  starts_at: string;
  customer_name: string;
  customer_phone: string | null;
  status: string;
  notes: string | null;
};

export default function BookingsPage() {
  const { businesses, businessId, choose } = useBusinessPicker();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [when, setWhen] = useState<"upcoming" | "all">("upcoming");

  const load = useCallback(() => {
    if (!businessId) return;
    fetch(`/api/bookings?business_id=${businessId}&when=${when}`)
      .then((r) => r.json())
      .then((d) => setBookings(d.bookings ?? []))
      .catch(() => {});
  }, [businessId, when]);

  useEffect(load, [load]);

  async function cancel(id: string) {
    await authedFetch(`/api/bookings`, {
      method: "PATCH",
      body: JSON.stringify({ business_id: businessId, booking_id: id }),
    });
    load();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <NavBar />
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Bookings</h1>
            <p className="text-sm text-zinc-500">Appointments the agent confirmed.</p>
          </div>
          <div className="flex gap-2">
            <select
              value={when}
              onChange={(e) => setWhen(e.target.value as "upcoming" | "all")}
              className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              <option value="upcoming">Upcoming</option>
              <option value="all">All</option>
            </select>
            <BusinessSelect businesses={businesses} businessId={businessId} onChange={choose} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3 flex items-center justify-between text-sm"
            >
              <div>
                <div className="font-medium">
                  {b.service_name} — {b.customer_name}
                  {b.status === "cancelled" && <span className="ml-2 text-xs text-red-500">cancelled</span>}
                </div>
                <div className="text-xs text-zinc-500">
                  {new Date(b.starts_at).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}
                  {b.customer_phone ? ` · ${b.customer_phone}` : ""}
                </div>
              </div>
              {b.status === "confirmed" && (
                <button
                  onClick={() => cancel(b.id)}
                  className="text-xs text-red-600 dark:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  Cancel
                </button>
              )}
            </div>
          ))}
          {bookings.length === 0 && <p className="text-sm text-zinc-500">No bookings.</p>}
        </div>
      </div>
    </div>
  );
}
