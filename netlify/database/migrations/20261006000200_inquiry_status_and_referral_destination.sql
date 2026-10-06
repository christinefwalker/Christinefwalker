ALTER TABLE problem_submissions
  ADD COLUMN status text NOT NULL DEFAULT 'new'
  CHECK (status IN ('new', 'in_progress', 'closed'));

ALTER TABLE events ADD COLUMN destination text;
