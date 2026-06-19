"use client";

import { useState, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar";

type Business = {
  id: string;
  name: string;
  system_prompt: string;
  created_at: string;
};

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Default state
  const [isSettingDefault, setIsSettingDefault] = useState<string | null>(null);

  // Add business state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const fetchBusinesses = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/businesses");
      if (res.ok) {
        const data: Business[] = await res.json();
        setBusinesses(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  const defaultId = businesses[0]?.id ?? null;

  const handleExpand = (biz: Business) => {
    if (expandedId === biz.id) {
      setExpandedId(null);
    } else {
      setExpandedId(biz.id);
      setEditName(biz.name);
      setEditPrompt(biz.system_prompt ?? "");
      setSaveMessage(null);
    }
  };

  const handleSave = async (id: string) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/businesses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, system_prompt: editPrompt }),
      });
      if (res.ok) {
        setSaveMessage({ id, text: "Saved successfully", ok: true });
        await fetchBusinesses();
        // Keep expanded so user can see the saved state
      } else {
        setSaveMessage({ id, text: "Failed to save", ok: false });
      }
    } catch {
      setSaveMessage({ id, text: "Error saving", ok: false });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    setIsSettingDefault(id);
    try {
      const res = await fetch(`/api/businesses/${id}`, { method: "PATCH" });
      if (res.ok) {
        await fetchBusinesses();
      }
    } finally {
      setIsSettingDefault(null);
    }
  };

  const handleAddBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_SECRET_KEY ?? ""}`,
        },
        body: JSON.stringify({ name: newName.trim(), system_prompt: newPrompt.trim() }),
      });
      if (res.ok) {
        setNewName("");
        setNewPrompt("");
        setShowAdd(false);
        await fetchBusinesses();
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100">
      <NavBar />
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">

        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Business Personas
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Manage AI personas for each business. The default persona is used for new WhatsApp conversations.
            </p>
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            {showAdd ? "Cancel" : "+ Add Business"}
          </button>
        </header>

        {/* Add Business Form */}
        {showAdd && (
          <section className="mb-8 bg-white dark:bg-zinc-900 p-6 rounded-xl border border-blue-200 dark:border-blue-900 shadow-sm">
            <h2 className="text-base font-medium mb-4 text-zinc-900 dark:text-zinc-100">New Business</h2>
            <form onSubmit={handleAddBusiness} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Al Noor Auto Repair"
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  System Prompt
                </label>
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="You are a helpful assistant for..."
                  rows={5}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono resize-y"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isAdding || !newName.trim()}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {isAdding ? "Adding..." : "Add Business"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Business List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <p>Loading businesses...</p>
          </div>
        ) : businesses.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-zinc-400 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <p>No businesses found. Add one above.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {businesses.map((biz) => {
              const isDefault = biz.id === defaultId;
              const isExpanded = expandedId === biz.id;

              return (
                <div
                  key={biz.id}
                  className={`bg-white dark:bg-zinc-900 rounded-xl border shadow-sm transition-all ${
                    isDefault
                      ? "border-blue-300 dark:border-blue-700"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleExpand(biz)}
                        className="text-left"
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {biz.name}
                        </span>
                      </button>
                      {isDefault && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full">
                          WhatsApp Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isDefault && (
                        <button
                          onClick={() => handleSetDefault(biz.id)}
                          disabled={isSettingDefault === biz.id}
                          className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-50"
                        >
                          {isSettingDefault === biz.id ? "Setting..." : "Set as Default"}
                        </button>
                      )}
                      <button
                        onClick={() => handleExpand(biz)}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors"
                      >
                        {isExpanded ? "Close" : "Edit Persona"}
                      </button>
                    </div>
                  </div>

                  {/* Prompt preview (collapsed) */}
                  {!isExpanded && biz.system_prompt && (
                    <div className="px-5 pb-4">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 font-mono bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 rounded-md">
                        {biz.system_prompt}
                      </p>
                    </div>
                  )}

                  {/* Edit panel (expanded) */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-800 pt-4 flex flex-col gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          Business Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          disabled={isSaving}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          System Prompt
                          <span className="ml-2 text-xs text-zinc-400 font-normal">
                            (defines the AI persona for this business)
                          </span>
                        </label>
                        <textarea
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          rows={10}
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono resize-y"
                          disabled={isSaving}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        {saveMessage?.id === biz.id ? (
                          <span
                            className={`text-sm ${
                              saveMessage.ok ? "text-green-600 dark:text-green-400" : "text-red-500"
                            }`}
                          >
                            {saveMessage.text}
                          </span>
                        ) : (
                          <span />
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setExpandedId(null)}
                            disabled={isSaving}
                            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSave(biz.id)}
                            disabled={isSaving || !editName.trim()}
                            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
                          >
                            {isSaving ? "Saving..." : "Save Changes"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
