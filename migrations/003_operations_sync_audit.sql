BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  template_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  status notification_status NOT NULL DEFAULT 'queued',
  provider_reference text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  status complaint_status NOT NULL DEFAULT 'open',
  assigned_admin_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS fraud_flags (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 1000),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_job_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT true,
  interval_seconds integer NOT NULL DEFAULT 604800 CHECK (interval_seconds >= 3600),
  max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 20),
  retry_backoff_seconds integer NOT NULL DEFAULT 60 CHECK (retry_backoff_seconds >= 0),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  triggered_by text NOT NULL CHECK (triggered_by IN ('schedule','manual','retry')),
  triggered_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  status sync_job_status NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  attempt_number integer NOT NULL DEFAULT 0 CHECK (attempt_number >= 0),
  fetched_count integer NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  inserted_count integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  skipped_locked_count integer NOT NULL DEFAULT 0 CHECK (skipped_locked_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_job_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_job_id uuid NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('debug','info','warning','error')),
  event_code text NOT NULL,
  message text NOT NULL,
  entity_type sync_entity_type,
  entity_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_field_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_job_id uuid NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  entity_type sync_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  field_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('inserted','updated','skipped_owner_lock','unchanged','failed')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'qa',
  severity bug_severity NOT NULL,
  status bug_status NOT NULL DEFAULT 'open',
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  description text NOT NULL,
  affected_component text,
  reproduction_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reproduction_steps)='array'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  root_cause text,
  patch_reference text,
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status backup_status NOT NULL DEFAULT 'started',
  storage_provider text,
  object_key text,
  checksum_sha256 text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_message text
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid,
  actor_role app_user_role,
  action text NOT NULL,
  table_name text NOT NULL,
  row_id text,
  old_data jsonb,
  new_data jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
