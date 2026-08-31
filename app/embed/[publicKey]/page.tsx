"use client";

import { use, useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Standalone chat surface loaded inside the widget iframe. Talks to
 * /api/public/chat same-origin using the publicKey from the path.
 */
export default function EmbedChat({ params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = use(params);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! How can I help?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const sessionRef = useRef<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionRef.current = localStorage.getItem("aap_widget_session") || crypto.randomUUID();
      localStorage.setItem("aap_widget_session", sessionRef.current);
    } catch {
      sessionRef.current = crypto.randomUUID();
    }
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionRef.current, public_key: publicKey }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? data.error ?? "Sorry, something went wrong." },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white text-zinc-900 font-sans">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={`inline-block px-3 py-2 rounded-2xl text-sm max-w-[85%] ${
                m.role === "user" ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-800"
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {sending && <div className="text-xs text-zinc-400 pl-1">typing…</div>}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-zinc-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
