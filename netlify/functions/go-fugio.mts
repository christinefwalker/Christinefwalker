import type { Config } from '@netlify/functions';
import { referralDestination } from '../lib/config.mts';
import { attribution } from '../lib/attribution.mts';
import { bestEffortTracking, recordEvent, type SiteEvent } from '../lib/database.mts';
import { jsonResponse, privateHeaders } from '../lib/http.mts';

export function createReferralHandler(writeEvent: (event: SiteEvent) => Promise<void> = recordEvent) {
  return async (request: Request) => {
    if (!['GET', 'HEAD'].includes(request.method)) return jsonResponse({ error: 'Method not allowed' }, 405);
    const destination = referralDestination();
    const metadata = attribution(new URL(request.url).searchParams, request);
    if (request.method === 'GET') {
      await bestEffortTracking(() => writeEvent({
        id: crypto.randomUUID(), event_type: 'referral_click', ...metadata,
        page: '/go/fugio', problem_slug: 'cash-flow', solution_slug: 'fugio', destination,
      }));
    }
    return new Response(null, {
      status: 302,
      headers: {
        ...privateHeaders,
        'Netlify-CDN-Cache-Control': 'no-store',
        Location: destination,
        'Referrer-Policy': 'no-referrer',
        'Set-Cookie': `cfw_session=${metadata.session_id}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  };
}

export default createReferralHandler();
export const config: Config = { path: '/go/fugio' };
