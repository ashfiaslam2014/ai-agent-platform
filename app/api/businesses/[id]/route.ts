import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// PUT — update business name and/or system_prompt
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { name, system_prompt } = await request.json();

    const updates: Record<string, string> = {};
    if (name !== undefined) updates.name = name.trim();
    if (system_prompt !== undefined) updates.system_prompt = system_prompt;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("businesses")
        .update(updates)
        .eq("id", id)
        .select("id, name, system_prompt, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// PATCH — set this business as the WhatsApp default
// Sets its created_at to the earliest possible, pushes all others later
export async function PATCH(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // Set target business to epoch (guaranteed first)
    const { error: targetError } = await supabase
        .from("businesses")
        .update({ created_at: "2000-01-01T00:00:00.000Z" })
        .eq("id", id);

    if (targetError) {
        return NextResponse.json({ error: targetError.message }, { status: 500 });
    }

    // Push all other businesses to a later fixed date so ordering is stable
    const { error: othersError } = await supabase
        .from("businesses")
        .update({ created_at: "2001-01-01T00:00:00.000Z" })
        .neq("id", id);

    if (othersError) {
        return NextResponse.json({ error: othersError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
