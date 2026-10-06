CREATE TABLE problem_submissions (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  form_name text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  problem text NOT NULL,
  business_name text,
  phone text,
  follow_up_consent boolean NOT NULL DEFAULT false,
  problem_slug text CHECK (problem_slug IS NULL OR problem_slug = 'cash-flow'),
  crm_claimed_at timestamptz,
  crm_status text NOT NULL DEFAULT 'pending' CHECK (crm_status IN ('pending', 'claimed', 'sent', 'failed', 'not_configured'))
);

CREATE TABLE events (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'solution_view', 'problem_submitted', 'referral_click')),
  session_id uuid,
  source text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  landing_page text,
  page text,
  problem_slug text CHECK (problem_slug IS NULL OR problem_slug = 'cash-flow'),
  solution_slug text CHECK (solution_slug IS NULL OR solution_slug = 'fugio'),
  placement text,
  submission_id text REFERENCES problem_submissions(id)
);

CREATE TABLE partner_conversions (
  event_id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  occurred_at timestamptz NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('affiliate.lead_status_changed', 'affiliate.commission_earned')),
  envelope_version integer NOT NULL,
  partner_slug text NOT NULL,
  submission_id text NOT NULL,
  problem_slug text NOT NULL DEFAULT 'cash-flow' CHECK (problem_slug = 'cash-flow'),
  solution_slug text NOT NULL DEFAULT 'fugio' CHECK (solution_slug = 'fugio'),
  lead_status text,
  deal_stage text,
  deal_status text
);

CREATE INDEX problem_submissions_created_idx ON problem_submissions(created_at DESC);
CREATE INDEX events_type_created_idx ON events(event_type, created_at DESC);
CREATE INDEX partner_conversions_submission_idx ON partner_conversions(submission_id, occurred_at DESC);
