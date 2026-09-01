-- ============================================================================
-- 007_google_workspace.sql
-- One service-account credential per business, shared by every Google skill
-- (Calendar sync + availability, Drive upload/list/ingest, Docs create/read).
--
-- Shape of businesses.google_workspace:
--   {
--     "serviceAccountJson": "<the entire service-account key file, as a string>",
--     "calendarId":  "xxxx@group.calendar.google.com",   -- optional
--     "driveFolderId": "1AbC...",                          -- optional
--   }
--
-- Nothing here is required; a business with a null column simply has the
-- Google skills disabled. Idempotent.
-- ============================================================================

alter table businesses add column if not exists google_workspace jsonb;
