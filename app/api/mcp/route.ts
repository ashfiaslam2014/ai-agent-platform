import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ensureSkillsRegistered, allSkills, getSkill } from '@/lib/skills'
import { validateArgs } from '@/lib/harness/validate'
import type { GoogleWorkspaceConfig, SkillContext } from '@/lib/skills/types'

/**
 * Minimal MCP-over-HTTP server exposing the platform's skills as MCP tools.
 * The skill contract is already MCP-shaped (name / description / JSON-Schema
 * parameters), so this is a thin JSON-RPC 2.0 dispatcher.
 *
 * Auth:  Authorization: Bearer <API_SECRET_KEY>
 * Scope: X-Business-Id: <businesses.id>   (all tool calls run against it)
 *
 * Supported methods: initialize, tools/list, tools/call.
 */

type RpcReq = { jsonrpc: '2.0'; id: string | number | null; method: string; params?: Record<string, unknown> }

function rpcResult(id: RpcReq['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result })
}
function rpcError(id: RpcReq['id'], code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token || token !== process.env.API_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = req.headers.get('x-business-id')
  if (!businessId) return NextResponse.json({ error: 'X-Business-Id header required' }, { status: 400 })

  ensureSkillsRegistered()

  let body: RpcReq
  try {
    body = await req.json()
  } catch {
    return rpcError(null, -32700, 'parse error')
  }

  switch (body.method) {
    case 'initialize':
      return rpcResult(body.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ai-agent-platform', version: '1.0.0' },
      })

    case 'tools/list':
      return rpcResult(body.id, {
        tools: allSkills().map((s) => ({
          name: s.name,
          description: s.description,
          inputSchema: s.parameters,
        })),
      })

    case 'tools/call': {
      const name = body.params?.name as string
      const args = (body.params?.arguments ?? {}) as Record<string, unknown>
      const skill = getSkill(name)
      if (!skill) return rpcError(body.id, -32602, `unknown tool "${name}"`)

      const check = validateArgs(skill.parameters, args)
      if (!check.valid) {
        return rpcResult(body.id, {
          isError: true,
          content: [{ type: 'text', text: `invalid arguments: ${check.errors.join('; ')}` }],
        })
      }

      const admin = getSupabaseAdmin()
      const { data: bizGoogle } = await admin
        .from('businesses')
        .select('google_workspace')
        .eq('id', businessId)
        .single()

      const ctx: SkillContext = {
        businessId,
        supabase: admin,
        config: {},
        contact: { channel: 'mcp', handle: null, name: null },
        log: () => {},
        google: (bizGoogle?.google_workspace as GoogleWorkspaceConfig) ?? null,
      }
      const result = await skill.run(check.value, ctx)
      return rpcResult(body.id, {
        isError: !result.ok,
        content: [
          {
            type: 'text',
            text: result.ok ? result.summary ?? JSON.stringify(result.data) : result.error,
          },
        ],
      })
    }

    default:
      return rpcError(body.id, -32601, `method not found: ${body.method}`)
  }
}
