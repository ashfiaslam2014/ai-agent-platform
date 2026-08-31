import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { runAgentForBusiness } from '@/lib/harness/server'

/**
 * Public, unauthenticated chat for the embeddable web widget.
 * Auth is the per-business `public_key`; abuse is bounded by a coarse
 * in-memory rate limiter (per key + session). Same-origin from /embed.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// key => timestamps within the window. Resets on cold start; good enough.
const hits = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 15

function rateLimited(bucket: string): boolean {
  const now = Date.now()
  const arr = (hits.get(bucket) ?? []).filter((t) => now - t < WINDOW_MS)
  arr.push(now)
  hits.set(bucket, arr)
  return arr.length > MAX_PER_WINDOW
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  try {
    const { message, session_id, public_key } = await req.json()
    if (!message || !public_key) {
      return NextResponse.json({ error: 'message and public_key are required' }, { status: 400, headers: CORS })
    }

    const sessionId: string = session_id || crypto.randomUUID()
    if (rateLimited(`${public_key}:${sessionId}`)) {
      return NextResponse.json({ error: 'Too many messages, slow down a moment.' }, { status: 429, headers: CORS })
    }

    const supabase = getSupabaseAdmin()
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('public_key', public_key)
      .maybeSingle()
    if (!biz?.id) {
      return NextResponse.json({ error: 'Unknown site key' }, { status: 404, headers: CORS })
    }
    const businessId = biz.id as string

    // Reuse a conversation for this widget session (24h window).
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('business_id', businessId)
      .eq('contact_handle', `web:${sessionId}`)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let conversationId = existing?.id as string | undefined
    if (!conversationId) {
      const { data } = await supabase
        .from('conversations')
        .insert({ business_id: businessId, channel: 'web', contact_handle: `web:${sessionId}` })
        .select('id')
        .single()
      conversationId = data!.id as string
    }

    await supabase.from('messages').insert({ conversation_id: conversationId, role: 'user', content: message })

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(30)

    const priorTurns = ((history ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(0, -1)

    const output = await runAgentForBusiness({
      channel: 'web',
      text: message,
      businessId,
      conversationId,
      history: priorTurns,
      contact: { handle: `web:${sessionId}`, name: null },
    })

    await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: output.reply })

    return NextResponse.json({ reply: output.reply, session_id: sessionId }, { headers: CORS })
  } catch (err) {
    console.error('[public/chat]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500, headers: CORS })
  }
}
