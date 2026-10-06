import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { isAdministrator, verifiedUser } from '../lib/admin.mts';
import { jsonResponse, limitedBody, sameOrigin } from '../lib/http.mts';

type InquiryStatus = 'new' | 'in_progress' | 'closed';

async function updateStatus(id: string, status: InquiryStatus) {
  const database = getDatabase();
  try {
    const updated = await database.sql`
      UPDATE problem_submissions SET status = ${status}
      WHERE id = ${id} AND form_name = 'contact' RETURNING id
    `;
    return updated.length > 0;
  } finally {
    await database.pool.end();
  }
}

export function createStatusHandler(verify: () => Promise<{ roles?: string[] } | null> = verifiedUser, update = updateStatus) {
  return async (request: Request) => {
    if (request.method !== 'PATCH') return jsonResponse({ error: 'Method not allowed' }, 405);
    const user = await verify();
    if (!user) return jsonResponse({ error: 'Sign in required' }, 401);
    if (!isAdministrator(user)) return jsonResponse({ error: 'Administrator access required' }, 403);
    if (!sameOrigin(request)) return jsonResponse({ error: 'Origin not allowed' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      return jsonResponse({ error: 'JSON required' }, 415);
    }
    let payload: { id?: unknown; status?: unknown };
    try {
      payload = JSON.parse(Buffer.from(await limitedBody(request, 2048)).toString('utf8'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid payload');
    } catch {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }
    if (typeof payload.id !== 'string' || !payload.id.trim() || payload.id.length > 160 ||
        typeof payload.status !== 'string' || !['new', 'in_progress', 'closed'].includes(payload.status)) {
      return jsonResponse({ error: 'Invalid inquiry or status' }, 400);
    }
    try {
      const updated = await update(payload.id, payload.status as InquiryStatus);
      if (!updated) return jsonResponse({ error: 'Inquiry not found' }, 404);
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ error: 'Couldn’t save status. Try again.' }, 503);
    }
  };
}

export default createStatusHandler();
export const config: Config = { path: '/api/admin-status' };
