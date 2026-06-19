import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET — list all businesses
export async function GET() {
    const { data, error } = await supabase
        .from("businesses")
        .select("id, name, system_prompt, created_at")
        .order("created_at", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST — create a new business
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token || token !== process.env.API_SECRET_KEY) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, system_prompt } = await request.json();

    if (!name?.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("businesses")
        .insert({ name: name.trim(), system_prompt: system_prompt?.trim() ?? "" })
        .select("id, name, system_prompt, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}
