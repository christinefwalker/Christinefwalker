import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

interface FormPayload {
  form_name: string;
  data: Record<string, string>;
  created_at: string;
  ordered_human_fields: { name: string; value: string }[];
}

export default async (req: Request, context: Context) => {
  const { payload } = (await req.json()) as { payload: FormPayload };

  const store = getStore("leads");

  const formLabel = payload.data["form-label"] || payload.form_name;
  const timestamp = payload.created_at || new Date().toISOString();
  const key = `${timestamp}_${crypto.randomUUID()}`;

  const lead = {
    formName: payload.form_name,
    formLabel,
    submittedAt: timestamp,
    name: payload.data.name || "",
    email: payload.data.email || "",
    fields: Object.fromEntries(
      Object.entries(payload.data).filter(
        ([k]) => !["form-name", "form-label", "bot-field"].includes(k)
      )
    ),
  };

  await store.setJSON(key, lead);

  return new Response("OK", { status: 200 });
};
