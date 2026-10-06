import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { attribution } from '../netlify/lib/attribution.mts';
import { connector, referralDestination } from '../netlify/lib/config.mts';
import { bestEffortTracking, type SiteEvent } from '../netlify/lib/database.mts';
import { validSignature } from '../netlify/lib/fugio.mts';
import { limitedBody } from '../netlify/lib/http.mts';
import { normalizeInquiry } from '../netlify/lib/submissions.mts';
import { createReferralHandler } from '../netlify/functions/go-fugio.mts';
import { createWebhookHandler } from '../netlify/functions/fugio-webhook.mts';
import adminHandler, { isAdministrator } from '../netlify/functions/admin-data.mts';
import eventHandler from '../netlify/functions/events.mts';
import identityGuard from '../netlify/functions/identity-guard.mts';
import { createStatusHandler } from '../netlify/functions/admin-status.mts';
import type { UserSignupEvent } from '@netlify/functions';

const signingSecret = randomBytes(32).toString('hex');
const productionEvent = {
  version: 4, event: 'affiliate.lead_status_changed', event_id: 'event_example',
  occurred_at: '2026-10-06T00:00:00Z',
  partner: { id: connector.solutions.fugio.partnerId, slug: connector.solutions.fugio.partnerSlug },
  submission_id: 'submission_example', lead_status: 'Accepted', deal_stage: 'SubmittedToLenders', deal_status: 'Active',
};

function webhookRequest(payload: unknown, signatureOverride?: string) {
  const body = JSON.stringify(payload);
  const signature = signatureOverride ?? createHmac('sha256', signingSecret).update(body).digest('hex');
  return new Request('https://christinefwalker.com/.netlify/functions/fugio-webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fugio-Signature': signature }, body,
  });
}

test('only cash-flow and Fugio are configured', () => {
  assert.deepEqual(Object.keys(connector.problems), ['cash-flow']);
  assert.deepEqual(Object.keys(connector.solutions), ['fugio']);
  assert.equal(referralDestination(), 'https://www.fugiofundingnetwork.com/?ref=st-pete-christine');
});

test('referral records a click with attribution and an uncached allowlisted 302', async () => {
  const recorded: SiteEvent[] = [];
  const session = crypto.randomUUID();
  const request = new Request(`https://christinefwalker.com/go/fugio?session_id=${session}&landing_page=/&utm_source=community&utm_campaign=meetup&placement=cash-flow-cta&url=https://example.com`, {
    headers: { referer: 'https://christinefwalker.com/cash-flow?personal=do-not-store' },
  });
  const response = await createReferralHandler(async event => { recorded.push(event); })(request);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), referralDestination());
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('netlify-cdn-cache-control'), 'no-store');
  assert.equal(recorded[0].event_type, 'referral_click');
  assert.equal(recorded[0].session_id, session);
  assert.equal(recorded[0].landing_page, '/');
  assert.equal(recorded[0].source, 'website');
  assert.deepEqual(recorded[0].utm, { utm_source: 'community', utm_campaign: 'meetup' });
  assert.equal(recorded[0].problem_slug, 'cash-flow');
  assert.equal(recorded[0].destination, referralDestination());
  assert.equal(recorded[0].placement, 'cash-flow-cta');
  assert.match(recorded[0].id, /^[0-9a-f-]{36}$/);
});

test('database failure does not block the referral redirect', async () => {
  const response = await createReferralHandler(async () => { throw new Error('Database unavailable'); })(new Request('https://christinefwalker.com/go/fugio'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), referralDestination());
});

test('slow tracking is bounded', async () => {
  const started = Date.now();
  await bestEffortTracking(() => new Promise(() => {}), 15);
  assert.ok(Date.now() - started < 500);
});

test('HEAD redirects without counting and POST is rejected', async () => {
  let calls = 0;
  const handler = createReferralHandler(async () => { calls++; });
  assert.equal((await handler(new Request('https://christinefwalker.com/go/fugio', { method: 'HEAD' }))).status, 302);
  assert.equal((await handler(new Request('https://christinefwalker.com/go/fugio', { method: 'POST' }))).status, 405);
  assert.equal(calls, 0);
});

test('attribution removes query strings, email-like values, and invalid sessions', () => {
  const request = new Request('https://christinefwalker.com/go/fugio', { headers: { referer: 'https://example.org/story?email=private' } });
  const record = attribution(new URLSearchParams('utm_campaign=person@example.com&session_id=not-a-uuid&landing_page=//evil.org'), request);
  assert.equal(record.source, 'example.org');
  assert.deepEqual(record.utm, {});
  assert.equal(record.landing_page, '/cash-flow');
  assert.match(record.session_id, /^[0-9a-f-]{36}$/);
});

test('HMAC is calculated against exact body bytes', () => {
  const rawBody = Buffer.from('{ "test": true }\n');
  const signature = createHmac('sha256', signingSecret).update(rawBody).digest('hex');
  assert.equal(validSignature(rawBody, signature, signingSecret), true);
  assert.equal(validSignature(Buffer.from('{"test":true}'), signature, signingSecret), false);
  assert.equal(validSignature(rawBody, 'abc', signingSecret), false);
  assert.equal(validSignature(rawBody, signature, ''), false);
});

test('signed sample referral.created is acknowledged without storage', async () => {
  let writes = 0;
  const response = await createWebhookHandler(async () => { writes++; }, () => signingSecret)(webhookRequest({ event: 'referral.created', test: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, test: true });
  assert.equal(writes, 0);
});

test('webhook is unavailable without a configured secret', async () => {
  const response = await createWebhookHandler(async () => {}, () => undefined)(webhookRequest(productionEvent));
  assert.equal(response.status, 503);
});

test('bad signatures are rejected before storage', async () => {
  let writes = 0;
  const response = await createWebhookHandler(async () => { writes++; }, () => signingSecret)(webhookRequest(productionEvent, '0'.repeat(64)));
  assert.equal(response.status, 401);
  assert.equal(writes, 0);
});

test('supported production events are minimal, with stable duplicate identifiers', async () => {
  const received: unknown[] = [];
  const handler = createWebhookHandler(async event => { received.push(event); }, () => signingSecret);
  assert.equal((await handler(webhookRequest({ ...productionEvent, client: { email: 'ignored@example.test' } }))).status, 200);
  assert.equal((await handler(webhookRequest(productionEvent))).status, 200);
  assert.deepEqual(received[0], received[1]);
  assert.equal(JSON.stringify(received).includes('ignored@example.test'), false);
  assert.equal((await handler(webhookRequest({ ...productionEvent, event: 'affiliate.commission_earned' }))).status, 200);
});

test('unknown event versions, event names, and partners fail closed', async () => {
  let writes = 0;
  const handler = createWebhookHandler(async () => { writes++; }, () => signingSecret);
  for (const payload of [
    { ...productionEvent, version: 2 },
    { ...productionEvent, event: 'referral.created' },
    { ...productionEvent, partner: { ...productionEvent.partner, slug: 'someone-else' } },
  ]) assert.equal((await handler(webhookRequest(payload))).status, 400);
  assert.equal(writes, 0);
});

test('failed webhook persistence returns a retryable error, not a false acknowledgement', async () => {
  const response = await createWebhookHandler(async () => { throw new Error('Database unavailable'); }, () => signingSecret)(webhookRequest(productionEvent));
  assert.equal(response.status, 503);
});

test('oversized webhook bodies are rejected', async () => {
  const response = await createWebhookHandler(async () => {}, () => signingSecret)(new Request('https://christinefwalker.com/.netlify/functions/fugio-webhook', { method: 'POST', body: 'a'.repeat(20000) }));
  assert.equal(response.status, 413);
  await assert.rejects(limitedBody(new Request('https://example.test', { method: 'POST', body: 'a'.repeat(20) }), 10));
});

test('contact normalization requires a problem and permission; spam is ignored', () => {
  const data = { source_form: 'contact', intake_version: '2', name: 'Example Visitor', email: 'visitor@example.test', phone: '+15551234567', problem: 'A broken workflow.', follow_up_consent: 'yes', submission_id: crypto.randomUUID() };
  const inquiry = normalizeInquiry(data);
  assert.ok(inquiry);
  assert.equal(inquiry.consent, true);
  assert.equal(normalizeInquiry(data)?.id, inquiry.id);
  assert.equal(normalizeInquiry({ ...data, follow_up_consent: '' }), null);
  assert.equal(normalizeInquiry({ ...data, problem: '' }), null);
  assert.equal(normalizeInquiry({ ...data, phone: '' }), null);
  assert.equal(normalizeInquiry({ ...data, phone: '   ' }), null);
  assert.ok(normalizeInquiry({ ...data, intake_version: '', phone: '' }));
  assert.equal(normalizeInquiry({ ...data, 'bot-field': 'robot' }), null);
  assert.equal(normalizeInquiry({ ...data, source_form: 'future-offer' }), null);
});

test('legacy form labels and message fields remain accepted', () => {
  const inquiry = normalizeInquiry({ 'form-label': 'New Lead — General Contact', name: 'Example Visitor', email: 'visitor@example.test', message: 'A legacy conversation.' });
  assert.equal(inquiry?.formName, 'contact');
  assert.equal(inquiry?.problem, 'A legacy conversation.');
  const pdf = normalizeInquiry({ source_form: 'pdf-download', name: 'Example Visitor', email: 'visitor@example.test' });
  assert.equal(pdf?.formName, 'pdf-download');
});

test('administrator role is required; user-editable metadata does not grant access', () => {
  assert.equal(isAdministrator(null), false);
  assert.equal(isAdministrator({ roles: ['member'] }), false);
  assert.equal(isAdministrator({ roles: ['admin'] }), true);
  const forged = { roles: [], userMetadata: { roles: ['admin'] } };
  assert.equal(isAdministrator(forged), false);
});

test('forged admin cookies fail server verification without reading data', async () => {
  const previousRuntime = globalThis.Netlify;
  globalThis.Netlify = {
    context: { url: new URL('https://christinefwalker.com'), cookies: { get: () => 'forged-token' } },
  } as unknown as typeof globalThis.Netlify;
  const network = mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  try {
    assert.equal((await adminHandler(new Request('https://christinefwalker.com/api/admin-data'))).status, 401);
    assert.equal(network.mock.callCount(), 1);
  } finally {
    network.mock.restore();
    globalThis.Netlify = previousRuntime;
  }
});

test('public signup is denied while invited accounts may continue', () => {
  let denied = false;
  identityGuard.userSignup({ user: { id: 'example' }, deny: () => { denied = true; return undefined; } } as UserSignupEvent);
  assert.equal(denied, true);
  denied = false;
  identityGuard.userSignup({ user: { id: 'example', invitedAt: '2026-10-06T00:00:00Z' }, deny: () => { denied = true; return undefined; } } as UserSignupEvent);
  assert.equal(denied, false);
});

test('status updates require a verified administrator and same-origin JSON', async () => {
  let writes = 0;
  const update = async () => { writes++; return true; };
  const request = (origin = 'https://christinefwalker.com', body: unknown = { id: 'contact:example', status: 'in_progress' }, method = 'PATCH') =>
    new Request('https://christinefwalker.com/api/admin-status', {
      method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  assert.equal((await createStatusHandler(async () => null, update)(request())).status, 401);
  assert.equal((await createStatusHandler(async () => ({ roles: ['member'] }), update)(request())).status, 403);
  const handler = createStatusHandler(async () => ({ roles: ['admin'] }), update);
  assert.equal((await handler(request('https://other.test'))).status, 403);
  assert.equal((await handler(request('', { id: 'contact:example', status: 'closed' }))).status, 403);
  for (const body of [null, [], { id: '', status: 'new' }, { id: 'contact:example', status: 'sent' }, { id: 'contact:example', status: ['new'] }]) {
    assert.equal((await handler(request('https://christinefwalker.com', body))).status, 400);
  }
  assert.equal(writes, 0);
  const saved = await handler(request());
  assert.equal(saved.status, 200);
  assert.match(saved.headers.get('cache-control') || '', /no-store/);
  assert.equal(writes, 1);
});

test('status changes validate inputs, report missing inquiries and database failure', async () => {
  const verified = async () => ({ roles: ['admin'] });
  const request = (type = 'application/json', body = '{"id":"contact:example","status":"closed"}') =>
    new Request('https://christinefwalker.com/api/admin-status', {
      method: 'PATCH', headers: { Origin: 'https://christinefwalker.com', 'Content-Type': type }, body,
    });
  const missing = createStatusHandler(verified, async () => false);
  assert.equal((await missing(request())).status, 404);
  assert.equal((await missing(request('text/plain'))).status, 415);
  assert.equal((await missing(request('application/json', 'a'.repeat(3000)))).status, 400);
  assert.equal((await missing(new Request('https://christinefwalker.com/api/admin-status'))).status, 405);
  const unavailable = createStatusHandler(verified, async () => { throw new Error('Database unavailable'); });
  assert.equal((await unavailable(request())).status, 503);
});

test('admin projections expose only requested fields and filter Fugio counts', async () => {
  const source = await readFile('netlify/functions/admin-data.mts', 'utf8');
  assert.match(source, /SELECT id, created_at, name, problem, status/);
  assert.match(source, /SELECT id AS click_id, created_at, source, problem_slug, destination/);
  assert.equal([...source.matchAll(/event_type = 'referral_click' AND solution_slug = 'fugio'/g)].length, 2);
  assert.doesNotMatch(source, /\bemail\b|\bphone\b|\bbusiness_name\b|\bsession_id\b|\butm\b/);
});

test('analytics rejects cross-origin requests and unconsented events', async () => {
  const request = (origin: string, consent: boolean) => new Request('https://christinefwalker.com/api/events', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'page_view', consent, page: '/' }),
  });
  assert.equal((await eventHandler(request('https://example.org', true))).status, 403);
  assert.equal((await eventHandler(request('https://christinefwalker.com', false))).status, 400);
});

test('schema has only the three MVP tables and duplicate-safe storage', async () => {
  const migration = await readFile('netlify/database/migrations/20261006000100_create_connector_mvp.sql', 'utf8');
  assert.deepEqual([...migration.matchAll(/CREATE TABLE (\w+)/g)].map(match => match[1]), ['problem_submissions', 'events', 'partner_conversions']);
  assert.match(migration, /event_id text PRIMARY KEY/);
  const submissions = await readFile('netlify/lib/submissions.mts', 'utf8');
  assert.match(submissions, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(submissions, /crm_claimed_at IS NULL RETURNING id/);
  const revision = await readFile('netlify/database/migrations/20261006000200_inquiry_status_and_referral_destination.sql', 'utf8');
  assert.match(revision, /ADD COLUMN status text NOT NULL DEFAULT 'new'/);
  assert.match(revision, /CHECK \(status IN \('new', 'in_progress', 'closed'\)\)/);
  assert.match(revision, /ALTER TABLE events ADD COLUMN destination text/);
  assert.doesNotMatch(revision, /CREATE TABLE|INSERT INTO/);
});
