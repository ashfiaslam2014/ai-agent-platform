import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

async function generateEmbedding(content: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: content }] },
        outputDimensionality: 768,
      }),
    }
  )
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini embedding failed: ${errText}`)
  }
  const data = await res.json()
  return data.embedding.values
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { content } = body

    if (!content) {
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 }
      )
    }

    let embedding: number[]
    try {
      embedding = await generateEmbedding(content)
    } catch (err) {
      console.error('Embedding error:', err)
      return NextResponse.json(
        { error: 'Failed to generate embedding' },
        { status: 502 }
      )
    }

    const { data, error } = await supabase
      .from('documents')
      .update({ content, embedding })
      .eq('id', id)
      .select('id')

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('PUT route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) {
      console.error('Supabase delete error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Delete route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
