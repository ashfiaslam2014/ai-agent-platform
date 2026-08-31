import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireBusinessAccess, writeAudit } from "@/lib/auth";

// PUT — update business name and/or system_prompt
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const gate = await requireBusinessAccess(request, id);
    if (!gate.ok) return gate.response;

    const { name, system_prompt, phone_number_id, timezone, hours } = await request.json();

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (system_prompt !== undefined) updates.system_prompt = system_prompt;
    if (phone_number_id !== undefined) updates.phone_number_id = phone_number_id?.trim() || null;
    if (timezone !== undefined) updates.timezone = timezone?.trim() || null;
    if (hours !== undefined) updates.hours = hours; // expects an object or null

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("businesses")
        .update(updates)
        .eq("id", id)
        .select("id, name, system_prompt, phone_number_id, timezone, hours, public_key, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
        businessId: id,
        actor: gate.email,
        action: "business.update",
        target: id,
        meta: { fields: Object.keys(updates) },
    });

    return NextResponse.json(data);
}

// PATCH — set this business as the WhatsApp default
// Sets its created_at to the earliest possible, pushes all others later
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const gate = await requireBusinessAccess(request, id);
    if (!gate.ok) return gate.response;

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

    // Keep the is_default flag (used by the WhatsApp webhook to pick a business
    // when phone_number_id doesn't match) in sync with the UI's notion of default.
    await supabase.from("businesses").update({ is_default: false }).neq("id", id);
    await supabase.from("businesses").update({ is_default: true }).eq("id", id);

    await writeAudit({ businessId: id, actor: gate.email, action: "business.set_default", target: id });

    return NextResponse.json({ success: true });
}
