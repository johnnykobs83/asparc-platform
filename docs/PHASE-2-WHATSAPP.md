# Phase 2 – WhatsApp: exactly what's required

## Already built (inactive)

- `lib/channels/whatsapp.ts`: Cloud API sender, form → website-link rendering, Meta signature verification, pseudonymous visitor IDs.
- `app/api/webhooks/whatsapp/route.ts`: webhook verification (GET) and inbound messages (POST) → the **same** ASPARC AI receptionist, knowledge base and guardrails as the website.
- Database: `conversations.channel = 'whatsapp'`, lead source `whatsapp`, integration logging.
- Both routes return **503** until `WHATSAPP_ENABLED=true` and the credentials are set, so nothing is live by accident.

## What you need to provide

1. **Meta Business account** (business.facebook.com) with **Business Verification** completed: legal name, ABN and address documents.
2. **A dedicated phone number** that is *not* currently registered on WhatsApp (a new mobile or a landline that can receive a verification call/SMS).
3. **Meta developer app** (developers.facebook.com → Create app → Business) with the WhatsApp product added. You'll need:
   - `WHATSAPP_PHONE_NUMBER_ID` – from WhatsApp → API Setup
   - `WHATSAPP_ACCESS_TOKEN` – a **permanent System User token** (Business Settings → System users) with `whatsapp_business_messaging` and `whatsapp_business_management`
   - `META_APP_SECRET` – App settings → Basic
   - `WHATSAPP_VERIFY_TOKEN` – any random string you choose
4. **WhatsApp display name** approval for "ASPARC" (Meta reviews it).
5. A payment method on the WhatsApp Business Account. Meta charges per message. Since 1 October 2026, replies inside the 24-hour customer-service window are also billable after 1,000 free service messages per month per number. Check the current Australian rates on Meta's pricing page.

## Steps to switch it on (about 1 hour after Meta approvals)

1. Add the five variables to Vercel and set `WHATSAPP_ENABLED=true` → redeploy.
2. Meta app → WhatsApp → Configuration → Webhook:
   - Callback URL `https://www.asparc.com.au/api/webhooks/whatsapp`
   - Verify token = `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the `messages` field
3. Test from your own phone: greeting/AI disclosure, Academy question, medical redirect, emergency → 000, complaint escalation. Confirm the conversation appears in **Conversations** with channel *WhatsApp*.
4. Only then add the number to the website and socials.

## Built since Phase 1 (still inactive until switched on)

- **Reply buttons:** quick replies are sent as WhatsApp reply buttons when they fit Meta's limits (at most 3 buttons, 20 characters each); otherwise as plain text. A tap on a button is read as a normal message.
- **Opt-out:** "STOP" (also "unsubscribe", "opt out") silences ASPARC AI for that person and is stored on the conversation. "START" turns replies back on.
- **Redelivery protection:** Meta resends webhooks; each message id is processed once.
- **Staff replies (hand-over):** in **Conversations**, staff can reply to a WhatsApp, Messenger or Instagram chat. Replying pauses ASPARC AI for that chat until staff click *Hand back to ASPARC AI*; emergency and self-harm messages still get the immediate 000 / Lifeline reply. Replies are only possible within 24 hours of the customer's last message and never after STOP. To make this possible the customer's messaging address (phone number or platform id) is kept on the conversation record.
- **Integrations page:** shows WhatsApp, Messenger/Instagram and Stripe as prepared, partially configured (listing what is missing) or connected.
- Shared inbound flow in `lib/channels/inbound.ts`, used by WhatsApp, Messenger and Instagram.

## Development work remaining for Phase 2

- Approved **template messages** if ASPARC ever needs to message first (follow-ups, reminders). These need Meta approval and explicit opt-in, and are deliberately not built.
- A live end-to-end test against Meta. Everything above is covered by automated tests with a mocked Meta API only.

## Phase 3 preview (Instagram & Messenger)

The same pattern applies: Meta app review for `pages_messaging` and `instagram_manage_messages`, a Facebook Page linked to an Instagram professional account, a `messenger` adapter next to `whatsapp.ts`, and one webhook route. Each platform's 24-hour messaging window rules apply.
