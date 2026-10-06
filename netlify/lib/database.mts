import { getDatabase } from '@netlify/database';

export interface SiteEvent {
  id: string;
  event_type: 'page_view' | 'solution_view' | 'problem_submitted' | 'referral_click';
  session_id: string | null;
  source: string | null;
  utm: Record<string, string>;
  landing_page: string | null;
  page: string | null;
  problem_slug: string | null;
  solution_slug: string | null;
  placement: string | null;
  destination?: string | null;
}

export async function recordEvent(event: SiteEvent) {
  const database = getDatabase();
  try {
    await database.sql`
      INSERT INTO events (id, event_type, session_id, source, utm, landing_page, page, problem_slug, solution_slug, placement, destination)
      VALUES (${event.id}, ${event.event_type}, ${event.session_id}, ${event.source}, ${JSON.stringify(event.utm)}::jsonb,
        ${event.landing_page}, ${event.page}, ${event.problem_slug}, ${event.solution_slug}, ${event.placement}, ${event.destination ?? null})
      ON CONFLICT (id) DO NOTHING
    `;
  } finally {
    await database.pool.end();
  }
}

export async function bestEffortTracking(operation: () => Promise<void>, timeoutMs = 1200) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Tracking timeout')), timeoutMs); }),
    ]);
  } catch {
    console.warn('First-party tracking unavailable');
  } finally {
    clearTimeout(timeout);
  }
}
