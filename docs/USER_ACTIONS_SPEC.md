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

### 4.1 Link the WhatsApp number
**Why:** inbound webhooks are routed to a business by `phone_number_id`.
```sql
update businesses
set phone_number_id = '<the WhatsApp phone_number_id from Meta>'
where id = '<business id>';
```
(You can also `PATCH /api/businesses/<id>` with `{"phone_number_id":"..."}` — the
API now accepts it; a form field on the Businesses page is a fast-follow.)

**Check:**
```sql
select name, phone_number_id from businesses where phone_number_id is not null;
```

### 4.2 Set opening hours
**Why:** `get_business_hours` and booking slot generation read this. Day keys are
lowercase; `"closed"` for closed days; times are `HH:MM` 24h in the business's timezone.
```sql
update businesses set
  timezone = 'Asia/Dubai',
  hours = '{
    "monday":    {"open":"09:00","close":"23:00"},
    "tuesday":   {"open":"09:00","close":"23:00"},
    "wednesday": {"open":"09:00","close":"23:00"},
    "thursday":  {"open":"09:00","close":"23:00"},
    "friday":    {"open":"13:00","close":"23:59"},
    "saturday":  {"open":"09:00","close":"23:00"},
    "sunday":    {"open":"09:00","close":"23:00"}
  }'::jsonb
where id = '<business id>';
```

**Check:** ask the test chat "what time do you open Friday?" → answer matches.

### 4.3 Enable skills — `/dashboard/skills`
**Why:** action skills (`create_booking`, `capture_lead`, `generate_quote`) are
**off by default** for a new business. Read-only ones are on.

1. Pick the business in the top-right selector.
2. Toggle on the skills this business should have. Rule from the plan: *only
   what they actually need.* A café: `get_business_hours`, `search_knowledge`,
   `create_booking`. A contractor: add `capture_lead`, `generate_quote`.
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

## 6. 🔵 Google Calendar sync for bookings

**Why:** writes each confirmed booking into a Google Calendar.

1. console.cloud.google.com → new project → enable **Google Calendar API**.
2. **APIs & Services → Credentials → Create credentials → Service account.**
   Create a JSON key, download it.
3. Google Calendar (web) → the calendar's **Settings → Share with specific
   people** → add the service account email (`...@...iam.gserviceaccount.com`),
   permission **Make changes to events**.
4. Calendar **Settings → Integrate calendar → Calendar ID** (looks like
   `...@group.calendar.google.com`).
5. `/dashboard/skills` → `create_booking` → **Edit config**:
   ```json
   {
     "defaultDurationMinutes": 60,
     "googleCalendarId": "xxxx@group.calendar.google.com",
     "googleServiceAccountJson": "{ ...the entire JSON key file, as one string... }"
   }
   ```
   (JSON-inside-JSON: escape the inner quotes, or paste the key file's content as
   a single-line string.)

**Check:** make a test booking → event appears in the calendar within a few seconds.
If not, the booking still succeeds (sync is best-effort) — check Vercel logs for `[calendar]`.

---

## 7. 🔵 PDF invoices

**Why:** `generate_quote` stores print-ready **HTML** today (open
`/documents/<id>`, print to PDF from the browser). For an actual PDF file:

1. Stand up an HTML→PDF service. Cheapest paths:
   - **Gotenberg** on a free host (Docker), or
   - a hosted API (api2pdf, PDFShift free tier).
2. It must accept `POST { "html": "..." }` and return the PDF bytes.
3. Set `DOCUMENT_PDF_ENDPOINT` to its URL (step 2).

**Check:** after wiring, `renderPdf()` returns bytes (add a `/documents/<id>/pdf`
route to serve them — small follow-up, not built).

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

## 9. Known gaps (decide if any block you)

| Gap | Impact | Workaround now |
|-----|--------|----------------|
| No UI to edit `phone_number_id` / `hours` / `public_key` | must use SQL Editor | SQL snippets above |
| Dashboard API routes have no auth check | anyone with the URL can read/write config | keep the deploy URL private; add `requireRole()` (see MODULE_STATUS.md) before onboarding a real paying client |
| Notifications only fire on booking confirmation | no automatic reminders/follow-ups | send manually, or build the reminder job next session |
| No CRM dashboard page | leads only visible in Supabase | `select * from leads order by created_at desc;` |
| PDF not auto-generated | HTML only | browser "print to PDF" |

---

## 10. Fast-follow build list (for the next sessions, in priority order)

1. Businesses page: add `phone_number_id`, `hours` (day grid), `timezone` fields + show `public_key`.
2. `requireRole()` auth on all dashboard API routes.
3. CRM dashboard page (leads pipeline) + Bookings page.
4. Agent-initiated notifications (reminder cron: bookings in next 24h).
5. Voice notes (Groq Whisper STT — no new vendor).
6. Image messages (vision model — no new vendor).
7. Long-term contact memory (`contact_memory` + `remember_fact` skill).
8. MCP endpoint exposing the skills.
