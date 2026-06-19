import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const FALLBACK_SYSTEM_PROMPT = "You are a helpful assistant.";

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

        if (!token || token !== process.env.API_SECRET_KEY) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { message, conversation_id: incomingConversationId } = await request.json();

        if (!message) {
            return NextResponse.json(
                { error: "No message provided" },
                { status: 400 }
            );
        }

        // Step 1: Resolve conversation_id and business_id
        let conversation_id: string = incomingConversationId ?? null;
        let business_id: string | null = null;

        if (!conversation_id) {
            // Default new conversations to the first business
            const { data: firstBusiness } = await supabase
                .from("businesses")
                .select("id")
                .order("created_at", { ascending: true })
                .limit(1)
                .single();

            business_id = firstBusiness?.id ?? null;

            const { data, error } = await supabase
                .from("conversations")
                .insert({ business_id })
                .select("id")
                .single();

            if (error) {
                console.error("Failed to create conversation:", error);
            } else {
                conversation_id = data.id;
            }
        } else {
            // Load business_id from existing conversation
            const { data: convo } = await supabase
                .from("conversations")
                .select("business_id")
                .eq("id", conversation_id)
                .single();

            business_id = convo?.business_id ?? null;
        }

        // Step 2: Save user message
        if (conversation_id) {
            const { error } = await supabase
                .from("messages")
                .insert({ conversation_id, role: "user", content: message });

            if (error) console.error("Failed to save user message:", error);
        }

        // Step 3: Build message history
        type ChatMessage = { role: "user" | "assistant"; content: string };
        let chatMessages: ChatMessage[] = [];

        if (conversation_id && incomingConversationId) {
            const { data: history, error } = await supabase
                .from("messages")
                .select("role, content")
                .eq("conversation_id", conversation_id)
                .order("created_at", { ascending: true })
                .limit(50);

            if (error) {
                console.error("Failed to fetch conversation history:", error);
            } else if (history) {
                chatMessages = history as ChatMessage[];
            }
        }

        // Append current user message (already saved above)
        chatMessages.push({ role: "user", content: message });

        // Step 4: Fetch system prompt from businesses table
        let systemPrompt = FALLBACK_SYSTEM_PROMPT;
        if (business_id) {
            const { data: business, error: businessError } = await supabase
                .from("businesses")
                .select("system_prompt")
                .eq("id", business_id)
                .single();

            if (businessError) {
                console.error("Failed to fetch business prompt:", businessError);
            } else if (business?.system_prompt) {
                systemPrompt = business.system_prompt;
            }
        }

        // Step 5: RAG — embed user message and retrieve relevant documents
        if (business_id) {
            try {
                const embedRes = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'models/gemini-embedding-001',
                            content: { parts: [{ text: message }] },
                            outputDimensionality: 768,
                        }),
                    }
                )

                if (embedRes.ok) {
                    const embedData = await embedRes.json()
                    const queryEmbedding: number[] = embedData.embedding.values

                    const { data: docs } = await supabase.rpc('match_documents', {
                        query_embedding: queryEmbedding,
                        match_count: 3,
                        match_business_id: business_id,
                    })

                    if (docs && docs.length > 0) {
                        const docBlock = docs
                            .map((d: { content: string }) => `---\n${d.content}`)
                            .join('\n')
                        systemPrompt =
                            `${systemPrompt}\n\nUse the following business information to answer the customer's question. If the information doesn't cover their question, say you'll check and get back to them.\n\n${docBlock}\n---`
                    }
                } else {
                    console.error('Gemini embedding failed during RAG:', await embedRes.text())
                }
            } catch (ragError) {
                console.error('RAG step failed, continuing without context:', ragError)
            }
        }

        // Step 6: Call Groq with full history
        const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt },
            ...chatMessages.map(m => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            })),
        ];

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: groqMessages,
        });

        const response = completion.choices[0]?.message?.content ?? "";

        // Step 7: Save assistant message
        if (conversation_id) {
            const { error } = await supabase
                .from("messages")
                .insert({ conversation_id, role: "assistant", content: response });

            if (error) console.error("Failed to save assistant message:", error);
        }

        // Step 8: Return response + conversation_id
        return NextResponse.json({ response, conversation_id });

    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Something went wrong" },
            { status: 500 }
        );
    }
}