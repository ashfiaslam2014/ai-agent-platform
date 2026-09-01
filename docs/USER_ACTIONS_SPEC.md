# USER ACTIONS SPEC — what only you can do

Follow this top to bottom. Each step says **why**, the **exact action**, and a
**check** to confirm it worked. Nothing here needs code from you — it's accounts,
keys, config, and testing.

Symbols: 🟢 required to go live · 🔵 optional (a feature stays off without it)

---

## 0. Prereqs (one-time, already partly done)

| # | Item | Status |
|---|------|--------|
| 0.1 | Supabase project `ai-agent-platform` (`qxhtiooitwvesnmnoeos`) is **active** | ✅ you re-enabled it |
| 0.2 | Migrations `002`–`005` applied to that project | ✅ applied via MCP this session |
| 0.3 | Vercel project connected to the GitHub repo | ✅ pre-existing |

> ⚠️ Supabase free tier **auto-pauses after ~1 week idle**. If the agent goes
> silent, check the Supabase dashboard first and click *Restore*.

---

## 1. 🟢 Merge and deploy the branch

**Why:** all the new code is on `worktree-core-agent-build`, not `main`.

1. Review the branch:
   ```
   cd ~/Projects/freelance/ai-agent-platform
   git fetch && git log --oneline main..worktree-core-agent-build
   git diff main..worktree-core-agent-build
   ```
2. Merge to `main` (no force, no rebase):
   ```
   git checkout main
   git merge worktree-core-agent-build
   ```
3. Push so Vercel deploys:
   ```
   git push origin main
   ```

**Check:** Vercel shows a new deployment that builds green. Open the deploy URL,
`/dashboard/skills` loads.

> **Sep 2026 update:** the core build is already merged. The Google Workspace
> connectors are on branch `feat/google-workspace-connectors` — merge that the
> same way (`git checkout main && git merge feat/google-workspace-connectors &&
> git push origin main`).

---

## 1a. 🟢 Apply pending migrations

**Why:** the Google connectors need one new column.

Supabase → SQL Editor, run each un-applied file in `supabase/migrations/` in
order. Currently pending: **`007_google_workspace.sql`**

```sql
alter table businesses add column if not exists google_workspace jsonb;
```

**Check:** `select google_workspace from businesses limit 1;` runs without error.

---

## 2. 🟢 Environment variables (Vercel **and** `.env.local`)

**Why:** the harness, notifications, and document links read these. Per the
project rule, set them in **both** places and redeploy after any `NEXT_PUBLIC_` change.

### Already set (Phase 0 — leave as-is)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`GROQ_MODEL_NAME`, `API_SECRET_KEY`, `NEXT_PUBLIC_API_SECRET_KEY`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`

### Add now
| Var | 🟢/🔵 | Value | Used by |
|-----|------|-------|---------|
| `NEXT_PUBLIC_APP_URL` | 🟢 | your deploy URL, e.g. `https://ai-agent-platform-ashen.vercel.app` | document links in `generate_quote` |
| `RESEND_API_KEY` | 🔵 | from resend.com | email notifications |
| `NOTIFY_EMAIL_FROM` | 🔵 | e.g. `bookings@yourdomain.com` (must be a verified Resend domain) | email notifications |
| `DOCUMENT_PDF_ENDPOINT` | 🔵 | URL of an HTML→PDF service (see step 7) | PDF invoices |
| `ACTIVE_BUSINESS_ID` | 🔵 | a `businesses.id` | webhook fallback if `phone_number_id` isn't matched and no default is set |
| `CRON_SECRET` | 🔵 | any random string | lets you manually hit `/api/cron/booking-reminders` with `Authorization: Bearer <it>`; Vercel Cron doesn't need it |

**Check:** `vercel env ls` (or the dashboard) shows the new vars; redeploy done.

---

## 3. 🟢 Confirm Phase 0 data (or create a test business)

**Why:** this session found the `public` schema empty on first read (it later
resolved — Phase 0 tables were there). Confirm your real businesses exist.

Supabase → SQL Editor:
```sql
select id, name, phone_number_id, is_default, public_key from businesses;
```
- If you see **Sunset Beach Café / Al Waha Restaurant** → good.
- If empty → create one in the dashboard (`/dashboard/businesses` → **+ Add
  Business**) or:
  ```sql
  insert into businesses (name, system_prompt, is_default)
  values ('Al Waha Restaurant', 'You are the assistant for Al Waha Restaurant...', true)
  returning id, public_key;
  ```

**Check:** at least one row, one with `is_default = true`.

---

## 4. 🟢 Per-business setup (repeat for each business)

### 4.1 + 4.2 Link the number and set hours — `/dashboard/businesses`
Expand a business, then in the edit panel:
- **WhatsApp phone_number_id** — from Meta. Routes inbound WhatsApp to this business.
- **Timezone** — e.g. `Asia/Dubai`.
- **Opening hours (JSON)** — day keys lowercase, `"closed"` for closed days,
  `HH:MM` 24h. The panel shows the format. Example:
  ```json
  {
    "monday":    {"open":"09:00","close":"23:00"},
    "friday":    {"open":"13:00","close":"23:59"},
    "sunday":    {"open":"09:00","close":"23:00"}
  }
  ```
- The panel also shows the **web widget key** (`public_key`) for step 8.

Save. `get_business_hours` and booking slot generation read `hours`; the webhook
routes on `phone_number_id`.

**Check:** ask the test chat "what time do you open Friday?" → answer matches.

### 4.3 Enable skills — `/dashboard/skills`
**Why:** action skills (`create_booking`, `capture_lead`, `generate_quote`) are
**off by default** for a new business. Read-only ones are on.

1. Pick the business in the top-right selector.
2. Toggle on the skills this business should have. Rule from the plan: *only
   what they actually need.* A café: `get_business_hours`, `search_knowledge`,
   `create_booking`, `cancel_booking`. A contractor: add `capture_lead`,
   `generate_quote`. Owner-facing extras: `remember_fact` (agent learns
   customer preferences), `ingest_url` (pull a web page into the knowledge base).
3. For `create_booking`, click **Add config**:
   ```json
   { "defaultDurationMinutes": 60 }
   ```
   (add Google Calendar keys here later — step 6)

**Check:** `/dashboard/skills` shows the right skills "On".

### 4.4 Set the system prompt — `/dashboard/prompts`
**Why:** a versioned prompt here overrides `businesses.system_prompt` and can be
rolled back.

1. Paste the business's prompt, add a note, **Save new version** (auto-activates).

**Check:** History shows `v1 · active`.

---

## 5. 🟢 Test the agent end-to-end

### 5.1 Dashboard tester
`/chat` → pick the business → try:
- "what are your hours today?" → uses `get_business_hours`
- "do you have vegan options?" → uses `search_knowledge` (needs docs uploaded)
- "can I book for 2 people tomorrow at 8pm?" → `create_booking` checks availability, then confirms

Then open `/dashboard/traces` — you should see each message with its steps.

### 5.2 WhatsApp
1. Meta sandbox token expires ~24h — regenerate on test day, update
   `WHATSAPP_ACCESS_TOKEN` in Vercel + `.env.local`, redeploy.
2. Message the business number. Reply should arrive within a few seconds.
3. `/dashboard/traces` shows a `whatsapp` channel trace.

### 5.3 Eval
```
cd ~/Projects/freelance/ai-agent-platform
set -a && source .env.local && set +a
npx tsx scripts/eval.ts <business id>
```
Edit `eval/dataset.example.json` (or copy to `eval/dataset.json`) with real
questions for your business. Re-run after any prompt change.

**Check:** scorecard prints `N/N passed`.

---

## 6. 🔵 Google Workspace — Calendar, Drive, Docs (one setup for all three)

**Why:** confirmed bookings written to a Google Calendar; the agent can check
calendar availability; generated invoices saved to Drive; the agent can create
Google Docs and pull Drive files into the knowledge base.

**Auth model:** one **service account** (server-to-server, no per-user Google
login). The key JSON is stored once per business in the dashboard, not in env.

### 6.1 Create the service account (once, ~5 min)

1. **console.cloud.google.com** → create a project (e.g. `ai-agent-platform`).
2. **APIs & Services → Library** → enable all three:
   **Google Calendar API**, **Google Drive API**, **Google Docs API**.
3. **APIs & Services → Credentials → Create credentials → Service account.**
   Name it, no roles needed, **Done**.
4. Open the service account → **Keys → Add key → Create new key → JSON** →
   download. Note its email: `...@<project>.iam.gserviceaccount.com`.

### 6.2 Share the resources with the service account

- **Calendar:** Google Calendar (web) → the calendar → **Settings and sharing →
  Share with specific people** → add the service-account email, permission
  **Make changes to events**. Copy the **Calendar ID** from
  *Integrate calendar* (looks like `...@group.calendar.google.com`; your
  primary calendar's ID is your Gmail address).
- **Drive:** create a folder (e.g. `<Business> — Agent`), right-click → **Share**
  → add the service-account email as **Editor**. Copy the folder id from its URL
  (`drive.google.com/drive/folders/<THIS>`).

### 6.3 Put it in the dashboard

Supabase → SQL Editor (until a dashboard field exists):

```sql
update businesses
set google_workspace = jsonb_build_object(
  'serviceAccountJson', $$ PASTE THE ENTIRE KEY FILE HERE, VERBATIM $$,
  'calendarId',   'xxxx@group.calendar.google.com',
  'driveFolderId','1AbC...'
)
where id = '<business id>';
```

`$$...$$` is Postgres dollar-quoting — it lets you paste the raw JSON key
(with its own quotes and newlines) without escaping anything.

> Requires migration `007_google_workspace.sql` (see §1a).

### 6.4 Enable the skills — `/dashboard/skills`

Per business, toggle on what it should have:
`check_calendar_availability` (answering), `save_document_to_drive` (action),
`create_google_doc` (ops), `ingest_drive_file` (ops). Booking→calendar sync
needs no skill — it runs inside `create_booking` when `google_workspace` is set.

**Check:**
- Booking test → event appears in the calendar in a few seconds (best-effort; a
  failed sync never blocks the booking — check Vercel logs for `[calendar]`).
- Ask the tester "are you free tomorrow afternoon?" → it reports busy blocks.
- `generate_quote` then `save_document_to_drive` with the returned id → a PDF
  lands in the Drive folder.

---

## 7. 🔵 PDF invoices — works out of the box

`generate_quote` gives a link to `/documents/<id>` (HTML). The same document as a
**PDF** is at `/documents/<id>/pdf`.

- **Default:** a bundled headless-Chromium renderer produces the PDF — nothing to
  configure. First request after a cold start is slow (~3–5 s).
- **Optional override:** set `DOCUMENT_PDF_ENDPOINT` to any HTML→PDF service that
  takes `POST { "html": "..." }` and returns PDF bytes (Gotenberg, api2pdf,
  PDFShift). When set, it's used instead of Chromium and is faster.

**Check:** open `/documents/<id>/pdf` for any generated document → a PDF renders.
A `502 { "error": "PDF rendering unavailable" }` means both paths failed — the
HTML at `/documents/<id>` still works.

---

## 8. 🔵 Web chat widget on a client's site

**Why:** the same agent as a website chat bubble.

1. Get the business's public key:
   ```sql
   select name, public_key from businesses;
   ```
2. On the client's site, before `</body>`:
   ```html
   <script src="https://YOUR-APP.vercel.app/widget.js" data-key="PUBLIC_KEY_HERE" async></script>
   ```

**Check:** a 💬 bubble appears bottom-right; clicking opens the chat; a reply
comes back; `/dashboard/traces` shows a `web` channel trace.

---

## 8b. 🔵 Booking reminders (Vercel Cron)

`vercel.json` declares one daily cron (`0 9 * * *`) hitting
`/api/cron/booking-reminders` — it WhatsApps a reminder for bookings 12–36h out.
On Vercel **Hobby** you get 2 crons at daily granularity, so this fits. It
activates automatically on deploy; nothing to configure. To test by hand:
`curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP/api/cron/booking-reminders`.

## 9. Known gaps (decide if any block you)

| Gap | Impact | Workaround now |
|-----|--------|----------------|
| Older routes (`/api/businesses` GET, `/api/businesses/[id]`) have no auth check | anyone with the URL can read/edit business name + prompt | keep the deploy URL private; add `requireBusinessAccess` to those two files before a paying client |
| No `audit_log` viewer in the dashboard | audit trail only in Supabase | `select * from audit_log order by created_at desc;` |
| Spoken (audio) replies not built | voice notes are understood, replies come back as text | fine for most cases; add a TTS key later |
| PDF not auto-generated | invoices are HTML | browser "print to PDF", or set `DOCUMENT_PDF_ENDPOINT` |
| Web-page ingest uses plain tag-strip | messy sites give messy chunks | use it for clean menu/price/policy pages; upload docs for the rest |

---

## 10. Fast-follow build list (remaining, priority order)

1. `requireBusinessAccess` on the two older routes (`/api/businesses` GET, `/api/businesses/[id]`).
2. Self-service onboarding wizard (`/onboard` → create business + `user_businesses` + seed `business_skills`).
3. Stripe: `create_payment_link` skill + `/api/stripe/webhook` (needs a Stripe account).
4. Spoken replies: TTS on the outbound WhatsApp path (needs a TTS key).
5. `DOCUMENT_PDF_ENDPOINT` wired + a `/documents/<id>/pdf` route.
6. Arabic dialect / transliteration handling beyond script detection.
7. `audit_log` viewer page.
8. Readability-grade extraction for `ingest_url` (swap the tag-strip).
