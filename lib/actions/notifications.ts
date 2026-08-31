import type { AppSupabaseClient as SupabaseClient } from '@/lib/supabase'

/**
 * Outbound notifications: WhatsApp (Meta Cloud API) and email (Resend).
 * Every send is written to notifications_log regardless of outcome so the
 * dashboard and analytics have a complete record.
 */

export type NotifyChannel = 'whatsapp' | 'email'

export type NotifyInput = {
  businessId: string
  channel: NotifyChannel
  to: string
  subject?: string | null
  body: string
  /** free-form tag: 'booking_confirmation', 'reminder', 'follow_up', ... */
  kind: string
}

const WHATSAPP_API_VERSION = 'v25.0'

export async function sendNotification(
  supabase: SupabaseClient,
  input: NotifyInput,
): Promise<{ ok: boolean; providerId?: string; error?: string }> {
  let result: { ok: boolean; providerId?: string; error?: string }

  if (input.channel === 'whatsapp') {
    result = await sendWhatsApp(input.to, input.body)
  } else {
    result = await sendEmail(input.to, input.subject ?? '(no subject)', input.body)
  }

  await supabase.from('notifications_log').insert({
    business_id: input.businessId,
    channel: input.channel,
    recipient: input.to,
    kind: input.kind,
    body: input.body,
    status: result.ok ? 'sent' : 'failed',
    provider_id: result.providerId ?? null,
    error: result.error ?? null,
  })

  return result
}

async function sendWhatsApp(to: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) return { ok: false, error: 'WhatsApp credentials not configured' }

  const res = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  })
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 300) }
  const data = await res.json()
  return { ok: true, providerId: data.messages?.[0]?.id }
}

async function sendEmail(to: string, subject: string, body: string) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.NOTIFY_EMAIL_FROM
  if (!key || !from) return { ok: false, error: 'Resend credentials not configured' }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: body,
    }),
  })
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 300) }
  const data = await res.json()
  return { ok: true, providerId: data.id }
}
