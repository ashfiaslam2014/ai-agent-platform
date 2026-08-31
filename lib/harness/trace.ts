import type { AgentInput, AgentTrace, TraceStep } from './types'

/**
 * Layer 5 — observability. Accumulates one step per harness stage. Every trace
 * is persisted (see persistTrace dep); these rows are also the fine-tuning
 * dataset the plan calls for, so the shape is stable and self-contained.
 */
export class TraceBuilder {
  private steps: TraceStep[] = []
  private readonly start = Date.now()
  private readonly startedAt = new Date().toISOString()

  constructor(private readonly input: AgentInput) {}

  add(step: TraceStep): void {
    this.steps.push(step)
  }

  /** Wrap an async stage, timing it and recording an error step on throw. */
  async stage<T>(where: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (err) {
      this.add({ layer: 'error', ok: false, detail: { message: (err as Error).message, where } })
      return undefined
    }
  }

  finish(finalOutput: string): AgentTrace {
    return {
      input: this.input.text,
      channel: this.input.channel,
      businessId: this.input.businessId,
      conversationId: this.input.conversationId,
      steps: this.steps,
      usedSkills: this.usedSkills,
      finalOutput,
      startedAt: this.startedAt,
      ms: Date.now() - this.start,
    }
  }

  get usedSkills(): string[] {
    return [
      ...new Set(
        this.steps
          .filter((s): s is Extract<TraceStep, { layer: 'tool' }> => s.layer === 'tool' && s.ok)
          .map((s) => s.detail.name),
      ),
    ]
  }
}
