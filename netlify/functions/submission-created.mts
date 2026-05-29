import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

interface FormPayload {
  form_name: string;
  data: Record<string, string>;
  created_at: string;
  ordered_human_fields: { name: string; value: string }[];
}

interface Lead {
  formName: string;
  formLabel: string;
  submittedAt: string;
  name: string;
  email: string;
  segment: string;
  fields: Record<string, string>;
}

export default async (req: Request, context: Context) => {
  const { payload } = (await req.json()) as { payload: FormPayload };

  const store = getStore("leads");

  const formLabel = payload.data["form-label"] || payload.form_name;
  const timestamp = payload.created_at || new Date().toISOString();
  const key = `${timestamp}_${crypto.randomUUID()}`;

  const lead: Lead = {
    formName: payload.form_name,
    formLabel,
    submittedAt: timestamp,
    name: payload.data.name || "",
    email: payload.data.email || "",
    // Segment tag from the self-assessment (Catalyst | Creator | Relocation).
    // Used downstream to route the contact into the matching CRM pipeline.
    segment: payload.data.segment || "",
    fields: Object.fromEntries(
      Object.entries(payload.data).filter(
        ([k]) => !["form-name", "form-label", "bot-field"].includes(k)
      )
    ),
  };

  await store.setJSON(key, lead);

  // Forward the lead into GoHighLevel (GHL) so every submission becomes a CRM
  // contact, tagged by segment (catalyst | creator | relocation). This is
  // best-effort: the lead is already saved above, so any GHL failure is logged
  // but never blocks the 200 response Netlify Forms expects.
  try {
    await forwardToGHL(lead);
  } catch (err) {
    console.error("GHL forwarding failed:", err);
  }

  return new Response("OK", { status: 200 });
};

/**
 * Send a lead to GoHighLevel.
 *
 * Two configurations are supported, checked in this order:
 *
 * 1. GHL API v2 (preferred) — set GHL_API_TOKEN (a Private Integration token)
 *    and GHL_LOCATION_ID. The contact is upserted and tags are applied directly
 *    from this code, so the segment maps to a tag with no extra GHL setup.
 *
 * 2. Inbound webhook (fallback) — set GHL_WEBHOOK_URL to a GHL workflow inbound
 *    webhook. The full lead plus a `tags` array is POSTed; map the fields and
 *    apply tags inside the GHL workflow.
 *
 * If none of these env vars are set, forwarding is skipped silently so the site
 * keeps working until credentials are added.
 */
async function forwardToGHL(lead: Lead): Promise<void> {
  // Only contacts with an email (or phone) can be created in GHL.
  if (!lead.email && !lead.fields.phone) return;

  // Tags GHL should apply. The assessment segment becomes a lowercase tag
  // (catalyst | creator | relocation) so segments line up with CRM pipelines.
  const tags: string[] = [];
  if (lead.segment) tags.push(lead.segment.toLowerCase());
  // A stable tag for every site lead, useful for source-based automations.
  tags.push("website-lead");

  const apiToken = process.env.GHL_API_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  const webhookUrl = process.env.GHL_WEBHOOK_URL;

  if (apiToken && locationId) {
    await upsertGHLContact(lead, tags, apiToken, locationId);
    return;
  }

  if (webhookUrl) {
    await postGHLWebhook(lead, tags, webhookUrl);
    return;
  }

  console.warn(
    "GHL not configured — set GHL_API_TOKEN + GHL_LOCATION_ID, or GHL_WEBHOOK_URL. Lead saved to Blobs only."
  );
}

async function upsertGHLContact(
  lead: Lead,
  tags: string[],
  apiToken: string,
  locationId: string
): Promise<void> {
  const res = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      locationId,
      firstName: lead.name,
      name: lead.name,
      email: lead.email || undefined,
      phone: lead.fields.phone || undefined,
      tags,
      source: lead.formLabel || lead.formName,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL upsert returned ${res.status}: ${body}`);
  }
}

async function postGHLWebhook(
  lead: Lead,
  tags: string[],
  webhookUrl: string
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: lead.name,
      name: lead.name,
      email: lead.email,
      phone: lead.fields.phone || "",
      segment: lead.segment,
      tags,
      source: lead.formLabel || lead.formName,
      submittedAt: lead.submittedAt,
      fields: lead.fields,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL webhook returned ${res.status}: ${body}`);
  }
}
