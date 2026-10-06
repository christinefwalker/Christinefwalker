import { getDatabase } from '@netlify/database';
import { parsePartnerEvent, validSignature } from '../lib/fugio.mts';
import { environment, jsonResponse, limitedBody } from '../lib/http.mts';

type PartnerEvent = Exclude<ReturnType<typeof parsePartnerEvent>, { test: true }>;

async function storePartnerEvent(event: PartnerEvent) {
  const database = getDatabase();
  try {
    await database.sql`
      INSERT INTO partner_conversions (event_id, occurred_at, event_type, envelope_version, partner_slug, submission_id, lead_status, deal_stage, deal_status)
      VALUES (${event.event_id}, ${event.occurred_at}, ${event.event_type}, ${event.version}, ${event.partner_slug},
        ${event.submission_id}, ${event.lead_status}, ${event.deal_stage}, ${event.deal_status})
      ON CONFLICT (event_id) DO NOTHING
    `;
  } finally {
    await database.pool.end();
  }
}

export function createWebhookHandler(store = storePartnerEvent, secretValue = () => environment('FUGIO_WEBHOOK_SECRET')) {
  return async (request: Request) => {
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
    const secret = secretValue();
    if (!secret) return jsonResponse({ error: 'Webhook not configured' }, 503);
    let rawBody: Uint8Array;
    try {
      rawBody = await limitedBody(request);
    } catch {
      return jsonResponse({ error: 'Payload too large' }, 413);
    }
    if (!validSignature(rawBody, request.headers.get('X-Fugio-Signature'), secret)) return jsonResponse({ error: 'Invalid signature' }, 401);
    let event: ReturnType<typeof parsePartnerEvent>;
    try {
      event = parsePartnerEvent(JSON.parse(Buffer.from(rawBody).toString('utf8')));
    } catch {
      return jsonResponse({ error: 'Invalid or unsupported event' }, 400);
    }
    if (event.test) return jsonResponse({ ok: true, test: true });
    try {
      await store(event);
      return jsonResponse({ ok: true });
    } catch {
      console.warn('Fugio event storage unavailable');
      return jsonResponse({ error: 'Please retry delivery' }, 503);
    }
  };
}

export default createWebhookHandler();
