"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import NavBar from "@/components/NavBar";

type Business = {
  id: string;
  name: string;
};

type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type Conversation = {
  id: string;
  created_at: string;
  messages: Message[];
};

type RawConversation = {
  id: string;
  created_at: string;
  messages: Message[] | null;
};

export default function ConversationHistoryPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch businesses on load
  useEffect(() => {
    const fetchBusinesses = async () => {
      setIsLoadingBusinesses(true);
      const { data, error } = await supabase.from("businesses").select("id, name");
      if (!error && data) {
        setBusinesses(data);
        if (data.length > 0) {
          setSelectedBusinessId(data[0].id);
        }
      } else {
        console.error("Failed to fetch businesses:", error);
      }
      setIsLoadingBusinesses(false);
    };
    fetchBusinesses();
  }, []);

  // Fetch conversations when selected business changes
  useEffect(() => {
    const fetchConversations = async () => {
      if (!selectedBusinessId) return;
      setIsLoadingConversations(true);
      
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id,
          created_at,
          messages (
            id,
            conversation_id,
            role,
            content,
            created_at
          )
        `)
        .eq("business_id", selectedBusinessId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        // Sort messages in each conversation chronologically
        const processedConversations = data.map((conv: RawConversation) => {
          const sortedMessages = [...(conv.messages || [])].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          return {
            ...conv,
            messages: sortedMessages,
          };
        });

        setConversations(processedConversations);
        
        // Auto-select first conversation if available, otherwise clear
        if (processedConversations.length > 0) {
          setSelectedConversationId(processedConversations[0].id);
        } else {
          setSelectedConversationId(null);
        }
      } else {
        console.error("Failed to fetch conversations:", error);
      }
      setIsLoadingConversations(false);
    };

    fetchConversations();
  }, [selectedBusinessId]);

  // Scroll to bottom of message thread when selected conversation changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversationId]);

  const handleBusinessChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBusinessId(e.target.value);
  };

  const selectedConversation = conversations.find(
    (c) => c.id === selectedConversationId
  );

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getFirstUserMessage = (messages: Message[]) => {
    const userMessage = messages.find((m) => m.role === "user");
    if (!userMessage) return "No customer message yet";
    return userMessage.content;
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100">
      <NavBar />
      
      <div className="flex-1 max-w-7xl mx-auto w-full p-6 flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 flex-none">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Conversation History
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Browse previous customer chats and assistant responses.
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <label
              htmlFor="businessSelect"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap"
            >
              Select Business:
            </label>
            <select
              id="businessSelect"
              value={selectedBusinessId || ""}
              onChange={handleBusinessChange}
              className="px-3 py-1.5 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px] text-zinc-900 dark:text-zinc-100"
              disabled={isLoadingBusinesses || businesses.length === 0}
            >
              {isLoadingBusinesses ? (
                <option value="">Loading...</option>
              ) : businesses.length === 0 ? (
                <option value="">No businesses found</option>
              ) : (
                businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </header>

        {/* Workspace split layout */}
        <div className="flex-1 flex flex-col md:flex-row border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm min-h-0 h-[calc(100vh-14rem)]">
          {/* Left panel: Conversations list */}
          <div className="w-full md:w-80 lg:w-96 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full bg-white dark:bg-zinc-900 flex-none">
            <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center flex-none">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Conversations
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                {conversations.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {isLoadingConversations ? (
                <div className="p-8 text-center text-zinc-400 text-sm">
                  Loading conversations...
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-zinc-400 text-sm">
                  No conversations found.
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === selectedConversationId;
                  const firstMsg = getFirstUserMessage(conv.messages);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversationId(conv.id)}
                      className={`w-full text-left p-4 transition-colors flex flex-col gap-1 focus:outline-none ${
                        isActive
                          ? "bg-blue-50/50 dark:bg-blue-950/20 border-l-4 border-blue-600 dark:border-blue-400 pl-3"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 truncate max-w-[150px]">
                          ID: {conv.id.substring(0, 8)}...
                        </span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          {formatDate(conv.created_at)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2 mt-1">
                        {firstMsg}
                      </p>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 self-end mt-1">
                        {conv.messages.length} message{conv.messages.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel: Chat messages thread */}
          <div className="flex-1 flex flex-col h-full bg-zinc-50/30 dark:bg-zinc-900/10 min-w-0">
            {!selectedConversationId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 p-8">
                <svg
                  className="w-12 h-12 mb-3 text-zinc-300 dark:text-zinc-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-sm">Select a conversation from the list to view the message thread.</p>
              </div>
            ) : selectedConversation ? (
              <>
                {/* Thread Header */}
                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex justify-between items-center flex-none">
                  <div>
                    <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      Message Thread
                    </h3>
                    <span className="text-xs text-zinc-500 font-mono">
                      ID: {selectedConversation.id}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Started: {formatDate(selectedConversation.created_at)}
                  </div>
                </div>

                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {selectedConversation.messages.length === 0 ? (
                    <div className="text-center text-zinc-400 text-sm py-12">
                      No messages in this conversation.
                    </div>
                  ) : (
                    selectedConversation.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          msg.role === "user" ? "items-end" : "items-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-5 py-3 ${
                            msg.role === "user"
                              ? "bg-blue-600 text-white rounded-br-sm shadow-sm"
                              : "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 rounded-bl-sm shadow-sm"
                          }`}
                        >
                          <div className="whitespace-pre-wrap text-sm leading-relaxed">
                            {msg.content}
                          </div>
                        </div>
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1 px-1">
                          {formatDate(msg.created_at)}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Read-only Footer Info */}
                <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex-none text-center text-xs text-zinc-500 dark:text-zinc-450 italic">
                  This thread is read-only. Responses were generated by the AI agent.
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
