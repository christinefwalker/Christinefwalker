import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { isAdministrator, verifiedUser } from '../lib/admin.mts';
import { jsonResponse } from '../lib/http.mts';

export { isAdministrator } from '../lib/admin.mts';

export default async (request: Request) => {
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
  const user = await verifiedUser();
  if (!user) return jsonResponse({ error: 'Sign in required' }, 401);
  if (!isAdministrator(user)) return jsonResponse({ error: 'Administrator access required' }, 403);
  try {
    const database = getDatabase();
    try {
      const [counts, inquiries, clicks] = await Promise.all([
        database.sql`SELECT (SELECT count(*)::integer FROM problem_submissions WHERE form_name = 'contact') AS inquiries,
          (SELECT count(*)::integer FROM events WHERE event_type = 'referral_click' AND solution_slug = 'fugio') AS referral_clicks`,
        database.sql`SELECT id, created_at, name, problem, status
          FROM problem_submissions WHERE form_name = 'contact' ORDER BY created_at DESC LIMIT 50`,
        database.sql`SELECT id AS click_id, created_at, source, problem_slug, destination
          FROM events WHERE event_type = 'referral_click' AND solution_slug = 'fugio' ORDER BY created_at DESC LIMIT 50`,
      ]);
      return jsonResponse({ counts: counts[0], inquiries, referral_clicks: clicks, conversion_data: 'Not connected' });
    } finally {
      await database.pool.end();
    }
  } catch {
    return jsonResponse({ error: 'Data is temporarily unavailable. Try again.' }, 503);
  }
};

export const config: Config = { path: '/api/admin-data' };
