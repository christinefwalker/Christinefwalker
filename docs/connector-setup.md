# Connector MVP

The site remains static HTML/CSS/JavaScript on Netlify. Christine is the brand. Cash flow is the only configured problem, and Fugio is the only configured solution. No funding application, automatic lead submission to Fugio, additional offers, or future problem pages are included.

## Deployment and storage

The homepage introduces Christine with “Hi, I’m Christine. What hurts?” and shows the problem-first connector model through a concise editorial hook, the principle “The problem comes before the product,” and a slim horizontal sequence on desktop and mobile. These precede the personal hello section, which shares one invitation to find a problem or connect. “Problems” is the existing navigation dropdown, whose only active problem is business cash flow. The primary hero CTA, “Does this hurt?”, opens its own native dropdown without opening or scrolling to the header navigation. Its single pain-named choice, “Making money. Still cash-strapped?”, leads to the existing cash-flow landing page. The smaller secondary CTA is “Tell me where it hurts.” Additional genuine problem links can be added to the existing static menu without a new discovery page or dropdown library. Choosing that problem leads to `/cash-flow`, where the four situations, funding explanation, and disclosed Fugio referral remain. “Tell me where it hurts” goes to `/contact`. A shared “Tell Christine where it hurts” sign-off appears before the footer on every page. About lives below the intake at `/contact#about`, linked from the footer; the legacy `/about` URL stays available. Current intake requires name, email, phone, problem, and follow-up permission, with optional business name. Its version marker applies required-phone validation to current submissions while preserving older queued forms that did not require phone. Contact inquiries never go to Fugio.

Admin shows only two totals (contact inquiries and Fugio referral clicks), inquiry date/name/problem/status, and click date/source/problem/destination/identifier. New / In progress / Closed follow-up status is separate from internal CRM delivery status. Status updates require a server-verified administrator, same-origin JSON PATCH, and a valid inquiry/status. Older clicks with no stored destination display “Not recorded” rather than invented historical data.

Netlify applies the SQL files in `netlify/database/migrations/` during deployment. The initial migration creates only `problem_submissions`, `events`, and `partner_conversions`. The second migration adds inquiry follow-up status and recorded referral destination without modifying the applied initial migration. Both must be applied before the revised admin can work. No production migration or deployment was run manually during implementation.

Forms and Identity activation markers are in `.netlify/features/`. Both activation scripts were run. Existing Netlify forms retain their names, honeypots, and submission behavior. The new contact form also registers the legacy `message` field; its visible required question is `problem`. With JavaScript disabled, native Netlify Forms submission still reaches `/thank-you`.

New submissions are saved in Postgres. Previously stored Netlify Forms submissions and Blobs archives are not deleted or bulk-imported. The PDF and project forms continue to archive their new submissions to the existing Blobs store as well. All legacy content and blog URLs remain accessible; blogs are no longer promoted in navigation.

## Existing CRM integration

Keep the existing Functions-scope configuration: `GHL_API_TOKEN` plus `GHL_LOCATION_ID`, or the fallback `GHL_WEBHOOK_URL`. No credential values belong in source files. If neither integration is configured, inquiries are retained and marked `not_configured` internally.

Only the verified `formSubmitted` event handler forwards submissions. The browser never calls the CRM directly. Every form has a submission identifier retained across a retry. A durable, atomic Postgres claim allows at most one forwarding attempt for each identifier, so duplicate event delivery does not produce duplicate forwarding. The claim precedes the external request: ambiguous failures or timeouts need manual CRM reconciliation, not blind retries. Exactly-once delivery across an external service cannot be guaranteed without its own idempotency protocol. API forwarding preserves the original contact upsert and tags; webhook forwarding also carries inquiry fields.

Without JavaScript, a deterministic submission fingerprint is used to deduplicate identical event data. Identical repeated submissions without identifiers may therefore be treated as the same inquiry, though the native Netlify Forms submission remains available.

## Invite-only admin

The admin sign-in page is `/admin/login`. In Netlify Identity, set registration to **Invite only**, invite the administrator, accept the invitation, then assign the server-controlled `admin` role. Sign in again after assigning the role so the new role is present in the session. The invitation link can land on the homepage: the shared script transfers its fragment directly to the sign-in page before any optional tracking.

There is no public signup UI. The Identity signup handler also denies accounts without an invitation. CDN role rules protect the admin HTML, and `/api/admin-data` independently verifies the user with `@netlify/identity` before reading Postgres. User-editable metadata does not grant access. The admin contains only inquiries, referral clicks, and their two totals, with the latest 50 records in each list.

Browser authentication uses locally served copies of the installed `@netlify/identity` package and its declared dependency, not a remote CDN. Keep those files in sync if the Identity dependency is upgraded.

## Fugio webhook

The signing secret shared in chat must be regenerated in Fugio. Store only the replacement in Netlify as `FUGIO_WEBHOOK_SECRET`, scoped to Functions and the appropriate deployment context. Do not reuse the exposed value or put the replacement in chat, source, logs, or this document.

After the receiver is deployed, configure Fugio's webhook URL as:

```
https://christinefwalker.com/.netlify/functions/fugio-webhook
```

Until then, leave the webhook URL blank and use email notifications. The homepage is not a webhook receiver.

The receiver checks the hex `X-Fugio-Signature` with HMAC-SHA256 over the exact raw body and a timing-safe comparison. Production events require the configured partner ID and slug, envelope version 4, an event identifier, and a submission identifier. Only `affiliate.lead_status_changed` and `affiliate.commission_earned` are stored. The event ID is the primary key, so redelivery does not duplicate a record. Payload size is bounded; raw payloads, client contact information, and commission amounts are not stored. Database failures return 503 rather than a false success. Fugio's retry policy still needs confirmation.

A correctly signed payload with `test: true` is acknowledged without storage, including the documented test button's `referral.created` sample. This confirms signature verification only, not production schema compatibility. Verify a real supported event after launch. Future envelope versions fail closed and need review rather than silently changing the schema.

No Fugio lead-submission API integration is included. A contact inquiry is not forwarded to Fugio, and Christine's follow-up consent is not Fugio SMS consent.

## Referral tracking

The only affiliate button uses `/go/fugio`. Its destination comes from `netlify/lib/config.mts` and is validated against the allowlisted HTTPS host. Request parameters cannot change the destination. Each GET records a random click identifier, database timestamp, session identifier, source, limited UTM labels, landing-page path, problem, placement, and actual configured destination. It returns a non-cached 302. Tracking errors or a 1.2-second tracking timeout still allow the redirect. HEAD redirects without counting.

Referral clicks are not inquiries, leads, or conversions. Fugio's documented payload has no click or session identifier, so its submission ID cannot currently be matched to a site click. Admin click-to-conversion attribution therefore remains **Not connected**, even if partner events are received.

Session storage retains the first landing path and campaign context for the visit. The redirect sets a first-party session cookie. Optional page views and visible solution impressions require the visitor's analytics permission, stored locally. They are not mixed into the referral count. No IP addresses, full referrer URLs, or contact details are stored in click records. Some preserved legacy pages retain their original GoHighLevel tracking script; the privacy page explicitly explains that distinction.

## Validation and stop point

After reviewing and publishing the Connector changes, set Fugio's delivery URL to `https://christinefwalker.com/.netlify/functions/fugio-webhook`, not the homepage. Rotate the signing secret previously exposed in the conversation, and set the replacement securely as `FUGIO_WEBHOOK_SECRET` in Netlify's Functions environment. Never paste it into source, chat, or a command log.

Confirm GET on that endpoint returns 405 JSON (not 200 HTML), then use Fugio's “Send test webhook.” A signed test must return 200 with `{"ok":true,"test":true}`; it deliberately does not insert a conversion. Check a genuine supported event separately: successful persistence returns 200, duplicate event IDs do not add rows, and database failure returns 503 so delivery can be retried. A passing test does not establish production storage, click-to-conversion attribution, or Fugio's retry policy. This work prepares the receiver for review; it does not publish production or certify live delivery.

Commands:

```
npm run typecheck
npm test
/opt/buildhome/node-deps/node_modules/.bin/netlify dev --port 8889 --dir . --offline
npm run test:browser
```

No build command is needed for these checks. Browser checks use desktop and mobile Chromium, and mock form submissions, outbound legacy tracking, and optional analytics so they do not create real inquiries. Admin rendering is exercised with a mocked protected response; anonymous route/data protection is tested against Netlify Dev. Unit checks cover signature verification, schema validation, spoofed sessions, invitation enforcement, spam/consent validation, tracking failures, and retry-safe storage contracts. They do not replace a live provider test or verify production database writes.

Before launch, confirm deployed migrations, one real Netlify Forms inquiry in Postgres, the configured CRM's single forwarding attempt, an invited administrator login, a signed Fugio test, a real supported partner event, and deployed 404/legacy routing. The production connection is not marked verified merely because local tests pass.

Human acceptance is still required: show the homepage for five seconds and ask what Christine does; after ten seconds, ask how to tell her about a problem and how to choose a problem. The expected answers are “she connects people with help,” “Tell me where it hurts,” and “Problems → choose my problem.” Cash flow is revealed in the menu, not promoted as a homepage offer. Automated copy and route checks are not a human usability pass. Stop at this MVP; new problems, offers, pages, reporting, or conversion attribution need explicit approval.
