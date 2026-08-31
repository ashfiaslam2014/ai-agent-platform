import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { runAgentForBusiness } from '@/lib/harness/server'

const WHATSAPP_API_VERSION = 'v25.0'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const change = body?.entry?.[0]?.changes?.[0]?.value
    const messageObj = change?.messages?.[0]
    if (!messageObj) return NextResponse.json({ status: 'ok' }, { status: 200 })

    const from: string | undefined = messageObj.from
    const text: string | undefined = messageObj.text?.body
    const phoneNumberId: string | undefined = change?.metadata?.phone_number_id
    if (!from || !text) return NextResponse.json({ status: 'ok' }, { status: 200 })

    const supabase = getSupabaseAdmin()

    // --- Multi-tenancy: match the inbound number to a business ---
    const businessId = await resolveBusinessId(supabase, phoneNumberId)
    if (!businessId) {
      console.error('[whatsapp] no business for phone_number_id', phoneNumberId)
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }

    // --- Conversation continuity: reuse the last convo for this contact within 24h ---
    const conversationId = await getOrCreateConversation(supabase, businessId, from)

    await supabase.from('messages').insert({ conversation_id: conversationId, role: 'user', content: text })

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(40)

    const priorTurns = ((history ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(0, -1)

    const output = await runAgentForBusiness({
      channel: 'whatsapp',
      text,
      businessId,
      conversationId,
      history: priorTurns,
      contact: { handle: from, name: change?.contacts?.[0]?.profile?.name ?? null },
    })

    await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: output.reply })

    await sendWhatsAppReply(from, output.reply)
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
  }
  // Always 200 — Meta retries otherwise.
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}

async function resolveBusinessId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  phoneNumberId: string | undefined,
): Promise<string | null> {
  if (phoneNumberId) {
    const { data } = await supabase
      .from('businesses')
      .select('id')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle()
    if (data?.id) return data.id as string
  }
  // Fallbacks: explicit env override, then the default business.
  if (process.env.ACTIVE_BUSINESS_ID) return process.env.ACTIVE_BUSINESS_ID
  const { data: def } = await supabase
    .from('businesses')
    .select('id')
    .eq('is_default', true)
    .maybeSingle()
  return (def?.id as string) ?? null
}

async function getOrCreateConversation(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  businessId: string,
  handle: string,
): Promise<string> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('business_id', businessId)
    .eq('contact_handle', handle)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data } = await supabase
    .from('conversations')
    .insert({ business_id: businessId, channel: 'whatsapp', contact_handle: handle })
    .select('id')
    .single()
  return data!.id as string
}

async function sendWhatsAppReply(to: string, body: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) {
    console.error('[whatsapp] missing send credentials')
    return
  }
  const res = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  })
  if (!res.ok) console.error('[whatsapp] send failed:', await res.text())
}
