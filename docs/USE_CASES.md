# Use cases — how to actually use this agent

Once `USER_ACTIONS_SPEC.md` is done, here's what the product does and how to
drive it. Use these to (a) demo, (b) write eval cases, (c) find what to improve.

---

## A. Café / restaurant (Al Waha, Sunset Beach)

**Enable:** `get_business_hours`, `search_knowledge`, `create_booking`
**Docs to upload:** menu, set-menu prices, location/parking, policies (kids, pets, dress code)
**Hours:** set `businesses.hours` accurately — booking slots come from it.

Customer messages that should just work:
- "What time do you close tonight?" → `get_business_hours`
- "Do you have vegetarian mains?" → `search_knowledge` over the menu
- "Table for 4 on Friday around 8?" → `create_booking` lists Friday slots near 20:00, customer picks one, agent confirms + sends a WhatsApp confirmation
- "Actually make it 6 people" → agent re-checks availability before changing
- "Do you do birthday cakes?" → not in docs → agent says it'll check and follow up (does **not** invent a yes)

What to watch in `/dashboard/traces`: did it call the skill or answer from memory?
Did booking check availability *before* confirming?

---

## B. Home services / contractor (AC repair, cleaning, handyman)

**Enable:** `search_knowledge`, `capture_lead`, `generate_quote`, `create_booking` (if they schedule visits)
**Docs:** service list with typical prices, coverage areas, call-out fee, guarantee terms

- "My AC isn't cooling, area is JVC" → agent asks 1–2 qualifying questions, then
  `capture_lead` with a summary + the customer's number → shows in `leads`
- "How much to service 3 split units?" → `generate_quote` (type `quote`, 3 line
  items) → returns a link the customer can open
- "Can someone come tomorrow morning?" → `create_booking` availability → confirm
- Owner opens Supabase `leads` (or the future CRM page) each morning and works the list

Sales angle: the "before" is *missed WhatsApp messages after hours*. Capture the
metric — leads captured outside 9–6 — that's the case-study number.

---

## C. Clinic / salon / spa (appointment-first)

**Enable:** `get_business_hours`, `search_knowledge`, `create_booking` (+ Google Calendar)
**Config `create_booking`:** `defaultDurationMinutes` per service norm; add the
Google Calendar keys so the front desk sees bookings in their existing calendar.

- "Do you have a slot for a haircut Thursday after 5?" → slots → confirm → calendar event appears
- "What's included in the deluxe facial?" → `search_knowledge`
- "I need to cancel my 3pm" → not automated yet — agent takes the message; add a
  `cancel_booking` skill next (the function already exists in `lib/actions/booking.ts`)

---

## D. Retail / trading (FIL's trading business)

**Enable:** `search_knowledge`, `capture_lead`, `generate_quote`
**Docs:** product catalogue, MOQ, delivery terms, payment terms

- "Do you stock 50mm galvanised pipe?" → `search_knowledge` over the catalogue
- "Quote for 200 units + delivery to Sharjah" → `generate_quote` (invoice/quote,
  line items incl. a delivery line, `tax_rate_pct: 5`) → link
- "Send me your catalogue" → agent shares whatever doc/link is in the knowledge base

---

## E. Your own freelance ops agent (Track 4 preview)

Point a business record at *your* freelance work:
- Upload your services + rates as documents
- Enable `capture_lead` + `generate_quote`
- Put the widget on your portfolio site
- Inbound "can you build me a WhatsApp bot?" → qualified → lead + a rough quote,
  while you're at the day job

---

## Turning use into improvement (the loop Ashfaque asked for)

1. **Run it.** Real messages, or paste realistic ones into `/chat`.
2. **Read traces.** `/dashboard/traces` — every wrong answer has a visible cause:
   missed skill call, bad args, weak retrieval, prompt gap.
3. **Fix the cheapest thing first:**
   - wrong/no skill called → tighten the skill `description` or the system prompt
   - bad retrieval → better/more documents, or raise `match_count`
   - hallucinated facts → strengthen the "don't invent" rule, check the doc actually exists
   - too slow → check which layer in the trace ate the time (usually the LLM call)
4. **Lock it in.** Add the failing message to `eval/dataset.json`, re-run
   `scripts/eval.ts`, keep the scorecard at 100%.
5. **Then** consider a better model (swap `GROQ_MODEL_NAME`), or move retrieval to
   a tool call, or add the next skill.

Model-swap note: `lib/harness/llm.ts` already falls back Groq → Gemini on one
failure. To trial a different primary, change `GROQ_MODEL_NAME` and re-run the eval
— the scorecard tells you if it regressed.
