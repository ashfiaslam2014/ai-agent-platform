import Groq from 'groq-sdk'
import type { LLMClient, LLMMessage, LLMResponse, LLMTool } from './types'

/**
 * Groq-backed LLM client using native function calling.
 *
 * llama-3.3-70b-versatile supports the OpenAI-style `tools` param. We keep the
 * surface tiny (one method) so the harness can be unit-tested with a fake.
 *
 * Provider-switch rule (project CLAUDE.md): on ONE failure, fall through to
 * Gemini rather than retrying Groq. Gemini's OpenAI-compat endpoint is used so
 * the message/tool shape is identical.
 */
export function createGroqLLM(): LLMClient {
  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  const defaultModel = process.env.GROQ_MODEL_NAME ?? 'llama-3.3-70b-versatile'

  const groq = new Groq({ apiKey: groqKey })

  return {
    async complete({ messages, tools, model }): Promise<LLMResponse> {
      const useModel = model ?? defaultModel
      try {
        const res = await groq.chat.completions.create({
          model: useModel,
          messages: messages as unknown as Groq.Chat.ChatCompletionMessageParam[],
          tools: tools.length ? (tools as unknown as Groq.Chat.ChatCompletionTool[]) : undefined,
          tool_choice: tools.length ? 'auto' : undefined,
          temperature: 0.3,
        })
        return normalise(res, useModel)
      } catch (err) {
        console.warn('[harness] Groq call failed, falling back to Gemini:', (err as Error).message)
        if (!geminiKey) throw err
        return geminiFallback(messages, tools, geminiKey)
      }
    },
  }
}

function normalise(res: Groq.Chat.ChatCompletion, model: string): LLMResponse {
  const choice = res.choices[0]?.message
  return {
    content: choice?.content ?? null,
    toolCalls:
      choice?.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })) ?? [],
    model,
    promptTokens: res.usage?.prompt_tokens,
    completionTokens: res.usage?.completion_tokens,
  }
}

async function geminiFallback(
  messages: LLMMessage[],
  tools: LLMTool[],
  apiKey: string,
): Promise<LLMResponse> {
  const model = 'gemini-2.0-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? 'auto' : undefined,
        temperature: 0.3,
      }),
    },
  )
  if (!res.ok) throw new Error(`Gemini fallback failed: ${await res.text()}`)
  const data = await res.json()
  const msg = data.choices?.[0]?.message
  return {
    content: msg?.content ?? null,
    toolCalls:
      msg?.tool_calls?.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })) ?? [],
    model,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
  }
}
