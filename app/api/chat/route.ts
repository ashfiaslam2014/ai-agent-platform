import { NextRequest, NextResponse } from "next/server";
import { supabase, getSupabaseAdmin } from "@/lib/supabase";
import { runAgentForBusiness } from "@/lib/harness/server";

/**
 * Dashboard chat endpoint (Supabase-authenticated tester). Owns the
 * conversation + message rows; delegates reasoning to the harness.
 * The WhatsApp webhook and the public widget call the harness directly.
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

        const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token ?? "");
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = user.id;

        const { message, conversation_id: incomingConversationId, business_id: requestedBusinessId } = await request.json();
        if (!message) {
            return NextResponse.json({ error: "No message provided" }, { status: 400 });
        }

        // Resolve conversation + business
        let conversation_id: string | null = incomingConversationId ?? null;
        let business_id: string | null = null;

        if (!conversation_id) {
            if (!requestedBusinessId) {
                return NextResponse.json({ error: "business_id is required" }, { status: 400 });
            }
            const { data: membership } = await getSupabaseAdmin()
                .from("user_businesses")
                .select("business_id")
                .eq("user_id", userId)
                .eq("business_id", requestedBusinessId)
                .single();
            if (!membership) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            business_id = requestedBusinessId;

            const { data, error } = await supabase
                .from("conversations")
                .insert({ business_id, channel: "web" })
                .select("id")
                .single();
            if (error) {
                console.error("Failed to create conversation:", error);
                return NextResponse.json({ error: "Failed to save message. Please try again." }, { status: 500 });
            }
            conversation_id = data.id;
        } else {
            const { data: convo } = await supabase
                .from("conversations")
                .select("business_id")
                .eq("id", conversation_id)
                .single();
            business_id = convo?.business_id ?? null;
        }

        if (!business_id || !conversation_id) {
            return NextResponse.json({ error: "Could not resolve business for this conversation" }, { status: 400 });
        }

        // Save the user message
        {
            const { error } = await supabase
                .from("messages")
                .insert({ conversation_id, role: "user", content: message });
            if (error) {
                console.error("Failed to save user message:", error);
                return NextResponse.json({ error: "Failed to save message. Please try again." }, { status: 500 });
            }
        }

        // Prior turns (exclude the message we just inserted)
        const { data: history } = await supabase
            .from("messages")
            .select("role, content")
            .eq("conversation_id", conversation_id)
            .order("created_at", { ascending: true })
            .limit(50);

        const priorTurns = ((history ?? []) as { role: "user" | "assistant"; content: string }[])
            .filter((_, i, arr) => i < arr.length - 1);

        // Reasoning + tools + trace
        const output = await runAgentForBusiness({
            channel: "web",
            text: message,
            businessId: business_id,
            conversationId: conversation_id,
            history: priorTurns,
            contact: { name: user.email ?? null, handle: null },
        });

        // Save the assistant message
        {
            const { error } = await supabase
                .from("messages")
                .insert({ conversation_id, role: "assistant", content: output.reply });
            if (error) {
                console.error("Failed to save assistant message:", error);
            }
        }

        return NextResponse.json({
            response: output.reply,
            conversation_id,
            used_skills: output.usedSkills,
            degraded: output.degraded ?? false,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
}
