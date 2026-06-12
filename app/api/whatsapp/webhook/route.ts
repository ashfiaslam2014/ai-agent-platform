import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new NextResponse(challenge, { status: 200 })
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch (error) {
    console.error('WhatsApp webhook verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('WhatsApp webhook payload:', JSON.stringify(body, null, 2))

    // Extract and log individual messages for visibility
    const entries = body?.entry ?? []
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const messages = change?.value?.messages ?? []
        for (const message of messages) {
          console.log('Incoming WhatsApp message:', {
            from: message.from,
            id: message.id,
            type: message.type,
            timestamp: message.timestamp,
            text: message.text?.body ?? null,
          })
        }
      }
    }

    // Meta requires a 200 response immediately
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
