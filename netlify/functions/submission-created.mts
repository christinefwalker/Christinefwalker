import { getStore } from '@netlify/blobs';
import type { FormSubmittedEvent } from '@netlify/functions';
import { forwardInquiry, markCRM, normalizeInquiry, saveInquiry } from '../lib/submissions.mts';

export default {
  async formSubmitted(event: FormSubmittedEvent) {
    const inquiry = normalizeInquiry(event.data);
    if (!inquiry) return;
    const shouldForward = await saveInquiry(inquiry);
    if (inquiry.formName !== 'contact') {
      try {
        await getStore('leads').setJSON(inquiry.id, {
          formName: inquiry.formName, formLabel: inquiry.formLabel,
          submittedAt: event.data.submitted_at || new Date().toISOString(),
          name: inquiry.name, email: inquiry.email, segment: inquiry.segment, fields: inquiry.fields,
        });
      } catch {
        console.warn('Legacy lead archive unavailable; inquiry saved in Postgres');
      }
    }
    if (!shouldForward) return;
    try {
      await forwardInquiry(inquiry);
      await markCRM(inquiry, 'sent');
    } catch {
      console.warn('CRM forwarding needs reconciliation; inquiry saved in Postgres');
      await markCRM(inquiry, 'failed');
    }
  },
};
