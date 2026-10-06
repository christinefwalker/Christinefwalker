import type { Config } from '@netlify/functions';
import { attribution, safePath } from '../lib/attribution.mts';
import { bestEffortTracking, recordEvent } from '../lib/database.mts';
import { jsonResponse, limitedBody, sameOrigin } from '../lib/http.mts';

export default async (request: Request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return jsonResponse({ error: 'Not allowed' }, 403);
  try {
    const body = JSON.parse(Buffer.from(await limitedBody(request, 4096)).toString('utf8'));
    if (body.consent !== true || !['page_view', 'solution_view'].includes(body.event_type)) return jsonResponse({ error: 'Invalid event' }, 400);
    const page = safePath(body.page);
    if (!['/', '/cash-flow', '/contact', '/privacy', '/privacy/disclosures'].includes(page || '')) return jsonResponse({ error: 'Invalid page' }, 400);
    const parameters = new URLSearchParams();
    for (const key of ['session_id', 'source', 'landing_page', 'placement', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      if (typeof body[key] === 'string') parameters.set(key, body[key]);
    }
    await bestEffortTracking(() => recordEvent({
      id: crypto.randomUUID(), event_type: body.event_type, ...attribution(parameters, request), page,
      problem_slug: page === '/cash-flow' ? 'cash-flow' : null,
      solution_slug: body.event_type === 'solution_view' && page === '/cash-flow' ? 'fugio' : null,
    }));
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: 'Invalid event' }, 400);
  }
};

export const config: Config = { path: '/api/events', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
