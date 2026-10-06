import { createHash } from 'node:crypto';
import { getDatabase } from '@netlify/database';
import { environment } from './http.mts';

export interface Inquiry {
  id: string;
  formName: string;
  name: string;
  email: string;
  problem: string;
  businessName: string;
  phone: string;
  consent: boolean;
  segment: string;
  formLabel: string;
  fields: Record<string, string>;
}

export function normalizeInquiry(data: Record<string, string>): Inquiry | null {
  if (data['bot-field']) return null;
  const legacyFormNames: Record<string, string> = {
    'New Lead — General Contact': 'contact',
    'New Lead — Start a Project': 'start-project',
    'New Lead — PDF Download': 'pdf-download',
  };
  const formName = data.source_form || data['form-name'] || legacyFormNames[data['form-label']];
  if (!['contact', 'start-project', 'pdf-download'].includes(formName)) return null;
  const trim = (value: string | undefined, limit: number) => (value || '').trim().slice(0, limit);
  const name = trim(data.name, 120);
  const email = trim(data.email, 254);
  const problem = trim(data.problem || data.message || data.project || data.notes || '', 3000);
  const consent = data.follow_up_consent === 'yes';
  const phone = trim(data.phone, 40);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (formName === 'contact' && !problem) return null;
  if (formName === 'contact' && data.source_form === 'contact' && !consent) return null;
  if (formName === 'contact' && data.intake_version === '2' && !phone) return null;
  const identifier = data.submission_id && /^[0-9a-f-]{36}$/i.test(data.submission_id)
    ? data.submission_id
    : createHash('sha256').update(JSON.stringify(Object.entries(data).sort())).digest('hex');
  return {
    id: `${formName}:${identifier}`, formName, name, email, problem,
    businessName: trim(data.business_name, 180), phone, consent,
    segment: trim(data.segment, 60), formLabel: trim(data['form-label'], 120),
    fields: Object.fromEntries(Object.entries(data).filter(([key]) => !['bot-field', 'submission_id', 'submitted_at', 'source_form'].includes(key))),
  };
}

export function crmConfigured() {
  return Boolean((environment('GHL_API_TOKEN') && environment('GHL_LOCATION_ID')) || environment('GHL_WEBHOOK_URL'));
}

export async function saveInquiry(inquiry: Inquiry) {
  const database = getDatabase();
  try {
    await database.sql`
      WITH inserted AS (
        INSERT INTO problem_submissions (id, form_name, name, email, problem, business_name, phone, follow_up_consent)
        VALUES (${inquiry.id}, ${inquiry.formName}, ${inquiry.name}, ${inquiry.email}, ${inquiry.problem},
          ${inquiry.businessName}, ${inquiry.phone}, ${inquiry.consent})
        ON CONFLICT (id) DO NOTHING RETURNING id
      )
      INSERT INTO events (id, event_type, submission_id, page, placement)
      SELECT ${crypto.randomUUID()}, 'problem_submitted', id, '/contact', 'tell-christine' FROM inserted
      WHERE ${inquiry.formName} = 'contact'
    `;
    if (!crmConfigured()) {
      await database.sql`UPDATE problem_submissions SET crm_status = 'not_configured' WHERE id = ${inquiry.id} AND crm_claimed_at IS NULL`;
      return false;
    }
    const claimed = await database.sql`
      UPDATE problem_submissions SET crm_claimed_at = now(), crm_status = 'claimed'
      WHERE id = ${inquiry.id} AND crm_claimed_at IS NULL RETURNING id
    `;
    return claimed.length > 0;
  } finally {
    await database.pool.end();
  }
}

export async function markCRM(inquiry: Inquiry, status: 'sent' | 'failed') {
  const database = getDatabase();
  try {
    await database.sql`UPDATE problem_submissions SET crm_status = ${status} WHERE id = ${inquiry.id}`;
  } finally {
    await database.pool.end();
  }
}

export async function forwardInquiry(inquiry: Inquiry) {
  const tags = ['website-lead'];
  if (inquiry.segment) tags.push(inquiry.segment.toLowerCase());
  if (inquiry.formName === 'contact') tags.push('tell-christine');
  const apiToken = environment('GHL_API_TOKEN');
  const locationId = environment('GHL_LOCATION_ID');
  const webhookUrl = environment('GHL_WEBHOOK_URL');
  const fields = { ...inquiry.fields, message: inquiry.problem || inquiry.fields.message || '' };
  let response: Response;
  if (apiToken && locationId) {
    response = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        locationId, firstName: inquiry.name, name: inquiry.name, email: inquiry.email,
        phone: inquiry.phone || undefined, tags, source: inquiry.formLabel || inquiry.formName,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } else if (webhookUrl) {
    response = await fetch(webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: inquiry.name, name: inquiry.name, email: inquiry.email, phone: inquiry.phone,
        businessName: inquiry.businessName, problem: inquiry.problem, followUpConsent: inquiry.consent,
        segment: inquiry.segment, tags, source: inquiry.formLabel || inquiry.formName,
        submittedAt: new Date().toISOString(), fields,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } else {
    return;
  }
  if (!response.ok) throw new Error('CRM forwarding failed');
}
