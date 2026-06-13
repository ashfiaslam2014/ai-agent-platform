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

    const messageObj = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

    if (!messageObj) {
      // Status update or non-message event — nothing to process
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }

    const from: string | undefined = messageObj.from
    const text: string | undefined = messageObj.text?.body

    if (!from || !text) {
      // Non-text message (image, audio, etc.) or missing sender — skip
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }

    console.log('Incoming WhatsApp message:', { from, text })

    // Call the internal chat endpoint
    const baseUrl = new URL(req.url).origin
    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
      },
      body: JSON.stringify({ message: text }),
    })

    const chatData = await chatRes.json()
    const aiReply: string | undefined = chatData?.response

    if (!aiReply) {
      console.error('Chat endpoint returned no response:', chatData)
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }

    // Send the AI reply back to the sender via the Meta Graph API
    const metaRes = await fetch(
      `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body: aiReply },
        }),
      }
    )

    if (!metaRes.ok) {
      console.error('Meta send message failed:', await metaRes.text())
    }
  } catch (error) {
    console.error('WhatsApp webhook error:', error)
  }

  // Always return 200 — Meta retries on anything else
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
