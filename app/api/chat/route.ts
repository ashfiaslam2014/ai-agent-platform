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

        // Step 3: Build message history for Groq
        type GroqMessage = { role: "system" | "user" | "assistant"; content: string };
        let groqMessages: GroqMessage[] = [];

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
                groqMessages = history as GroqMessage[];
            }
        }

        // Append current user message (already saved above)
        groqMessages.push({ role: "user", content: message });

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

        // Step 5: Call Groq with full history (system prompt always first)
        const completion = await groq.chat.completions.create({
            messages: [{ role: "system", content: systemPrompt }, ...groqMessages],
            model: "llama-3.3-70b-versatile",
        });

        const response = completion.choices[0]?.message?.content || "";

        // Step 6: Save assistant message
        if (conversation_id) {
            const { error } = await supabase
                .from("messages")
                .insert({ conversation_id, role: "assistant", content: response });

            if (error) console.error("Failed to save assistant message:", error);
        }

        // Step 7: Return response + conversation_id
        return NextResponse.json({ response, conversation_id });

    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Something went wrong" },
            { status: 500 }
        );
    }
}