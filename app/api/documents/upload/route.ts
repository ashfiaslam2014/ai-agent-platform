import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { business_id, content, title, metadata } = body

    if (!business_id || !content) {
      return NextResponse.json(
        { error: 'business_id and content are required' },
        { status: 400 }
      )
    }

    // Generate embedding via Gemini text-embedding-004
    const geminiRes = await fetch(
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

    if (!geminiRes.ok) {
      const geminiError = await geminiRes.text()
      console.error('Gemini embedding error:', geminiError)
      return NextResponse.json(
        { error: 'Failed to generate embedding' },
        { status: 502 }
      )
    }

    const geminiData = await geminiRes.json()
    const embedding: number[] = geminiData.embedding.values

    // Store document in Supabase
    const { data, error } = await supabase
      .from('documents')
      .insert({
          business_id,
          content,
          embedding,
          metadata: { ...(metadata ?? {}), ...(title ? { title } : {}) },
        })
      .select('id')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json(
        { error: 'Failed to store document' },
        { status: 500 }
      )
    }

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    console.error('Upload route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
