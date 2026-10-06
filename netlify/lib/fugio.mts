import { createHmac, timingSafeEqual } from 'node:crypto';
import { connector } from './config.mts';

export function validSignature(rawBody: Uint8Array, signature: string | null, secret: string) {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function parsePartnerEvent(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid event');
  const body = value as Record<string, unknown>;
  if (body.test === true) return { test: true } as const;
  const partner = body.partner as Record<string, unknown> | undefined;
  if (!partner || partner.id !== connector.solutions.fugio.partnerId || partner.slug !== connector.solutions.fugio.partnerSlug) throw new Error('Unexpected partner');
  if (body.version !== 4 || !['affiliate.lead_status_changed', 'affiliate.commission_earned'].includes(String(body.event))) throw new Error('Unsupported event');
  const identifier = (field: unknown) => typeof field === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(field);
  if (!identifier(body.event_id) || !identifier(body.submission_id)) throw new Error('Missing identifier');
  if (typeof body.occurred_at !== 'string' || !Number.isFinite(Date.parse(body.occurred_at))) throw new Error('Invalid timestamp');
  const state = (field: unknown) => field == null ? null : typeof field === 'string' && /^[a-zA-Z0-9_ -]{1,80}$/.test(field) ? field : undefined;
  const leadStatus = state(body.lead_status);
  const dealStage = state(body.deal_stage);
  const dealStatus = state(body.deal_status);
  if ([leadStatus, dealStage, dealStatus].includes(undefined)) throw new Error('Invalid status');
  return {
    test: false,
    event_id: body.event_id as string,
    event_type: body.event as string,
    occurred_at: new Date(body.occurred_at).toISOString(),
    version: body.version,
    partner_slug: partner.slug as string,
    submission_id: body.submission_id as string,
    lead_status: leadStatus ?? null,
    deal_stage: dealStage ?? null,
    deal_status: dealStatus ?? null,
  };
}
