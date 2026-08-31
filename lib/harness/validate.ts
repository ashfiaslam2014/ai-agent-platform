import type { JSONSchema, JSONSchemaProperty } from '@/lib/skills/types'

/**
 * Minimal, dependency-free JSON Schema validator.
 *
 * Scope on purpose: it enforces exactly what a tool-calling LLM can get wrong
 * — missing required keys, wrong primitive type, out-of-enum values, bad array
 * item types, one level of nested object. It is NOT a general JSON Schema
 * implementation (no $ref, oneOf, patternProperties, numeric bounds).
 *
 * The point of the harness thesis is "verifiable reasoning": we never hand raw
 * model output to a skill without checking it against the declared shape first.
 */

export type ValidationResult =
  | { valid: true; value: Record<string, unknown> }
  | { valid: false; errors: string[] }

export function validateArgs(schema: JSONSchema, raw: unknown): ValidationResult {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: ['arguments must be a JSON object'] }
  }
  const obj = raw as Record<string, unknown>

  for (const key of schema.required ?? []) {
    if (obj[key] === undefined || obj[key] === null) {
      errors.push(`missing required field "${key}"`)
    }
  }

  for (const [key, prop] of Object.entries(schema.properties)) {
    if (obj[key] === undefined || obj[key] === null) continue
    checkProp(`${key}`, prop, obj[key], errors)
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(obj)) {
      if (!(key in schema.properties)) errors.push(`unexpected field "${key}"`)
    }
  }

  if (errors.length > 0) return { valid: false, errors }

  // Coerce obvious string->number cases some models produce ("3" for integer).
  const value: Record<string, unknown> = { ...obj }
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (value[key] == null) continue
    if ((prop.type === 'number' || prop.type === 'integer') && typeof value[key] === 'string') {
      const n = Number(value[key])
      if (!Number.isNaN(n)) value[key] = n
    }
  }
  return { valid: true, value }
}

function checkProp(path: string, prop: JSONSchemaProperty, val: unknown, errors: string[]): void {
  switch (prop.type) {
    case 'string':
      if (typeof val !== 'string') { errors.push(`"${path}" must be a string`); return }
      break
    case 'number':
      if (typeof val !== 'number' && !numericString(val)) errors.push(`"${path}" must be a number`)
      break
    case 'integer':
      if (!Number.isInteger(typeof val === 'string' ? Number(val) : val)) errors.push(`"${path}" must be an integer`)
      break
    case 'boolean':
      if (typeof val !== 'boolean') errors.push(`"${path}" must be a boolean`)
      break
    case 'array':
      if (!Array.isArray(val)) { errors.push(`"${path}" must be an array`); return }
      if (prop.items) val.forEach((item, i) => checkProp(`${path}[${i}]`, prop.items!, item, errors))
      break
    case 'object':
      if (typeof val !== 'object' || val === null || Array.isArray(val)) {
        errors.push(`"${path}" must be an object`); return
      }
      if (prop.properties) {
        const nested = val as Record<string, unknown>
        for (const req of prop.required ?? []) {
          if (nested[req] === undefined) errors.push(`"${path}.${req}" is required`)
        }
        for (const [k, p] of Object.entries(prop.properties)) {
          if (nested[k] !== undefined) checkProp(`${path}.${k}`, p, nested[k], errors)
        }
      }
      break
  }

  if (prop.enum && !prop.enum.some((e) => e === val)) {
    errors.push(`"${path}" must be one of: ${prop.enum.join(', ')}`)
  }
}

function numericString(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))
}
