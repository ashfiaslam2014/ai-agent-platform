import type { GoogleWorkspaceConfig, SkillContext } from '@/lib/skills/types'

/**
 * Resolve the Google credential for a skill: the business-wide
 * `google_workspace` config, with per-skill `business_skills.config` keys
 * (googleServiceAccountJson / googleCalendarId / googleDriveFolderId) as an
 * override so the older create_booking setup keeps working.
 */
export function resolveGoogleConfig(ctx: SkillContext): GoogleWorkspaceConfig {
  const c = ctx.config ?? {}
  return {
    serviceAccountJson:
      (c.googleServiceAccountJson as string) || ctx.google?.serviceAccountJson || undefined,
    calendarId: (c.googleCalendarId as string) || ctx.google?.calendarId || undefined,
    driveFolderId: (c.googleDriveFolderId as string) || ctx.google?.driveFolderId || undefined,
  }
}
