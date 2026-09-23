-- Parvathipuram Bites PHASE 1 PostgreSQL schema.
-- Apply the numbered files in migrations/ in ascending order.
-- This consolidated file concatenates migrations 000-007.


-- ============================================================
-- SOURCE: 000_extensions_roles_types.sql
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$ BEGIN
  CREATE ROLE pb_authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE pb_worker NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE pb_super_service NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE app_user_role AS ENUM ('customer','restaurant_owner','delivery_agent','super_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE account_status AS ENUM ('pending','active','suspended','disabled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE order_status AS ENUM ('placed','accepted','rejected','assigned','picked_up','delivered','cancelled','unassigned','payment_failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','cod_due','authorized','paid','failed','refunded','partially_refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_method AS ENUM ('cod','upi','card','netbanking','wallet','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_entry_type AS ENUM ('delivery_fee','tip','adjustment_credit','adjustment_debit','payout'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_entry_status AS ENUM ('pending','posted','reversed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE settlement_status AS ENUM ('pending','processing','paid','failed','reversed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_channel AS ENUM ('sms','in_app'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_status AS ENUM ('queued','sending','sent','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE complaint_status AS ENUM ('open','in_progress','resolved','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE sync_job_status AS ENUM ('queued','running','partial_success','succeeded','failed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE sync_entity_type AS ENUM ('restaurant','menu_item','restaurant_hours','restaurant_media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE bug_severity AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE bug_status AS ENUM ('open','investigating','patched','verified','closed','wont_fix'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE assignment_status AS ENUM ('offered','accepted','rejected','expired','cancelled','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tip_status AS ENUM ('pending_assignment','assigned','earned','paid','cancelled','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE delivery_fee_status AS ENUM ('pending_assignment','assigned','earned','paid','cancelled','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE backup_status AS ENUM ('started','succeeded','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;


-- ============================================================
-- SOURCE: 001_identity_catalog.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone citext NOT NULL UNIQUE,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
  role app_user_role NOT NULL,
  status account_status NOT NULL DEFAULT 'active',
  preferred_language text NOT NULL DEFAULT 'te' CHECK (preferred_language IN ('te','en')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  shop_name text NOT NULL CHECK (length(btrim(shop_name)) BETWEEN 1 AND 160),
  owner_name text NOT NULL CHECK (length(btrim(owner_name)) BETWEEN 1 AND 120),
  phone citext NOT NULL,
  location_text text NOT NULL CHECK (length(btrim(location_text)) BETWEEN 1 AND 500),
  latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  mandal text,
  category text,
  is_street_food boolean NOT NULL DEFAULT false,
  is_open boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  avg_rating numeric(3,2) NOT NULL DEFAULT 0 CHECK (avg_rating BETWEEN 0 AND 5),
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  eta_minutes integer NOT NULL DEFAULT 30 CHECK (eta_minutes BETWEEN 1 AND 240),
  external_source text,
  external_source_key text,
  source_meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_meta)='object'),
  owner_locked_fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(owner_locked_fields)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, shop_name),
  UNIQUE NULLS NOT DISTINCT (external_source, external_source_key)
);

CREATE TABLE IF NOT EXISTS restaurant_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time,
  closes_at time,
  is_closed boolean NOT NULL DEFAULT false,
  owner_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL)),
  UNIQUE (restaurant_id, weekday)
);

CREATE TABLE IF NOT EXISTS restaurant_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('cover','photo')),
  url text NOT NULL CHECK (length(url) <= 2048),
  sort_order integer NOT NULL DEFAULT 0,
  owner_locked boolean NOT NULL DEFAULT false,
  source_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description text,
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  is_veg boolean NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  category text,
  image_url text CHECK (image_url IS NULL OR length(image_url) <= 2048),
  external_source text,
  external_source_key text,
  source_meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_meta)='object'),
  owner_locked_fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(owner_locked_fields)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (restaurant_id, external_source, external_source_key)
);

CREATE TABLE IF NOT EXISTS saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  address_text text NOT NULL CHECK (length(btrim(address_text)) BETWEEN 1 AND 500),
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE RESTRICT,
  phone citext NOT NULL,
  vehicle_type text CHECK (vehicle_type IS NULL OR length(vehicle_type) <= 80),
  is_online boolean NOT NULL DEFAULT false,
  is_approved boolean NOT NULL DEFAULT true,
  latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS festival_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_te text NOT NULL,
  subtitle_te text,
  image_url text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

INSERT INTO app_config(key,value,description) VALUES
  ('delivery_rate_per_km_paise','1200'::jsonb,'Delivery fee per km in paise'),
  ('minimum_delivery_fee_paise','1000'::jsonb,'Minimum delivery fee in paise'),
  ('unassigned_timeout_seconds','180'::jsonb,'Seconds before unaccepted order becomes unassigned'),
  ('emergency_contact','"+91XXXXXXXXXX"'::jsonb,'Global emergency admin contact'),
  ('catalog_sync_enabled','true'::jsonb,'Authorized catalog synchronization master switch'),
  ('service_zone_center','{"lat":18.7830,"lng":83.4250}'::jsonb,'Configured operating-zone center'),
  ('service_zone_radius_km','20'::jsonb,'Operating-zone radius in kilometers')
ON CONFLICT (key) DO NOTHING;

COMMIT;


-- ============================================================
-- SOURCE: 002_orders_finance.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  delivery_agent_id uuid REFERENCES delivery_agents(id) ON DELETE SET NULL,
  address_id uuid NOT NULL REFERENCES saved_addresses(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'placed',
  payment_status payment_status NOT NULL DEFAULT 'cod_due',
  payment_method payment_method NOT NULL DEFAULT 'cod',
  food_total_paise integer NOT NULL CHECK (food_total_paise >= 0),
  delivery_fee_paise integer NOT NULL CHECK (delivery_fee_paise >= 0),
  tip_paise integer NOT NULL DEFAULT 0 CHECK (tip_paise >= 0),
  platform_fee_paise integer NOT NULL DEFAULT 0 CHECK (platform_fee_paise = 0),
  distance_km numeric(8,3) NOT NULL CHECK (distance_km >= 0 AND distance_km <= 250),
  total_paise integer GENERATED ALWAYS AS (food_total_paise + delivery_fee_paise + tip_paise) STORED,
  customer_note text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  accepted_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  rejected_at timestamptz,
  unassigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  unit_price_paise integer NOT NULL CHECK (unit_price_paise >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  line_total_paise integer GENERATED ALWAYS AS (unit_price_paise * quantity) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  from_status order_status,
  to_status order_status,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  cancelled_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (length(btrim(reason_code)) BETWEEN 1 AND 80),
  reason_text text NOT NULL CHECK (length(btrim(reason_text)) BETWEEN 1 AND 500),
  status_before order_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status_before = 'placed')
);

CREATE TABLE IF NOT EXISTS order_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  rejected_by_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (length(btrim(reason_code)) BETWEEN 1 AND 80),
  reason_text text NOT NULL CHECK (length(btrim(reason_text)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_agent_id uuid NOT NULL REFERENCES delivery_agents(id) ON DELETE RESTRICT,
  status assignment_status NOT NULL DEFAULT 'offered',
  offered_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, delivery_agent_id, offered_at)
);

CREATE TABLE IF NOT EXISTS unassigned_order_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reason_code text NOT NULL,
  reason_text text,
  timeout_seconds integer CHECK (timeout_seconds IS NULL OR timeout_seconds > 0),
  available_agents integer CHECK (available_agents IS NULL OR available_agents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN ('charge','refund')),
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  status payment_status NOT NULL,
  provider text,
  provider_reference text,
  failure_code text,
  failure_message text,
  raw_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_agent_id uuid NOT NULL UNIQUE REFERENCES delivery_agents(id) ON DELETE RESTRICT,
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency='INR'),
  available_balance_paise bigint NOT NULL DEFAULT 0,
  lifetime_earned_paise bigint NOT NULL DEFAULT 0 CHECK (lifetime_earned_paise >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  entry_type ledger_entry_type NOT NULL,
  status ledger_entry_status NOT NULL DEFAULT 'posted',
  amount_paise bigint NOT NULL CHECK (amount_paise <> 0),
  reference_key text NOT NULL UNIQUE,
  provider_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  delivery_agent_id uuid REFERENCES delivery_agents(id) ON DELETE SET NULL,
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  platform_deduction_paise integer NOT NULL DEFAULT 0 CHECK (platform_deduction_paise = 0),
  rider_net_paise integer GENERATED ALWAYS AS (amount_paise - platform_deduction_paise) STORED,
  status tip_status NOT NULL DEFAULT 'pending_assignment',
  wallet_ledger_id uuid UNIQUE REFERENCES wallet_ledger(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_fee_accounting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  delivery_agent_id uuid REFERENCES delivery_agents(id) ON DELETE SET NULL,
  distance_km numeric(8,3) NOT NULL CHECK (distance_km >= 0),
  rate_per_km_paise integer NOT NULL CHECK (rate_per_km_paise >= 0),
  gross_fee_paise integer NOT NULL CHECK (gross_fee_paise >= 0),
  platform_deduction_paise integer NOT NULL DEFAULT 0 CHECK (platform_deduction_paise = 0),
  rider_net_paise integer GENERATED ALWAYS AS (gross_fee_paise - platform_deduction_paise) STORED,
  status delivery_fee_status NOT NULL DEFAULT 'pending_assignment',
  wallet_ledger_id uuid UNIQUE REFERENCES wallet_ledger(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_settlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  food_amount_paise integer NOT NULL CHECK (food_amount_paise >= 0),
  platform_deduction_paise integer NOT NULL DEFAULT 0 CHECK (platform_deduction_paise = 0),
  restaurant_net_paise integer GENERATED ALWAYS AS (food_amount_paise - platform_deduction_paise) STORED,
  status settlement_status NOT NULL DEFAULT 'pending',
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text CHECK (body IS NULL OR length(body) <= 2000),
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;


-- ============================================================
-- SOURCE: 003_operations_sync_audit.sql
-- ============================================================

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


-- ============================================================
-- SOURCE: 004_functions_triggers.sql
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION current_request_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.request_id', true), '')
$$;

CREATE OR REPLACE FUNCTION current_app_role() RETURNS app_user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT u.role FROM app_users u WHERE u.id = current_app_user_id() AND u.status = 'active'
$$;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT current_app_role() = 'super_admin'::app_user_role $$;

CREATE OR REPLACE FUNCTION owns_restaurant(p_restaurant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM restaurants r
    WHERE r.id = p_restaurant_id AND r.owner_user_id = current_app_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION owns_delivery_agent(p_agent_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM delivery_agents d
    WHERE d.id = p_agent_id AND d.user_id = current_app_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION validate_restaurant_owner_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users u WHERE u.id=NEW.owner_user_id AND u.role='restaurant_owner' AND u.status='active') THEN
    RAISE EXCEPTION 'owner_user_id must reference an active restaurant_owner';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_delivery_agent_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_users u WHERE u.id=NEW.user_id AND u.role='delivery_agent' AND u.status='active') THEN
    RAISE EXCEPTION 'user_id must reference an active delivery_agent';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION ensure_single_default_address() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE saved_addresses SET is_default=false
    WHERE customer_id=NEW.customer_id AND id<>NEW.id AND is_default=true;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION create_agent_wallet() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO wallet_accounts(delivery_agent_id) VALUES (NEW.id)
  ON CONFLICT (delivery_agent_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_order_participants() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_role app_user_role; v_address_customer uuid;
BEGIN
  SELECT role INTO v_role FROM app_users WHERE id=NEW.customer_id AND status='active';
  IF v_role IS DISTINCT FROM 'customer'::app_user_role THEN
    RAISE EXCEPTION 'customer_id must reference an active customer';
  END IF;
  SELECT customer_id INTO v_address_customer FROM saved_addresses WHERE id=NEW.address_id;
  IF v_address_customer IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'address does not belong to customer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id=NEW.restaurant_id AND is_active=true) THEN
    RAISE EXCEPTION 'restaurant is not active';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_order_item_total() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_sum bigint; v_expected integer;
BEGIN
  SELECT COALESCE(SUM(line_total_paise),0) INTO v_sum FROM order_items WHERE order_id=COALESCE(NEW.order_id,OLD.order_id);
  SELECT food_total_paise INTO v_expected FROM orders WHERE id=COALESCE(NEW.order_id,OLD.order_id);
  -- Deferred consistency is verified explicitly by validate_order_financials(order_id).
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION order_status_transition_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE allowed boolean := false;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  allowed := CASE OLD.status
    WHEN 'placed' THEN NEW.status IN ('accepted','rejected','cancelled','payment_failed')
    WHEN 'accepted' THEN NEW.status IN ('assigned','unassigned','rejected','payment_failed')
    WHEN 'unassigned' THEN NEW.status IN ('assigned','cancelled')
    WHEN 'assigned' THEN NEW.status IN ('picked_up','unassigned')
    WHEN 'picked_up' THEN NEW.status IN ('delivered')
    ELSE false
  END;
  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid order status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status='accepted' THEN NEW.accepted_at:=COALESCE(NEW.accepted_at,now()); END IF;
  IF NEW.status='assigned' THEN
    IF NEW.delivery_agent_id IS NULL THEN RAISE EXCEPTION 'delivery_agent_id required for assigned status'; END IF;
    NEW.assigned_at:=COALESCE(NEW.assigned_at,now());
  END IF;
  IF NEW.status='picked_up' THEN NEW.picked_up_at:=COALESCE(NEW.picked_up_at,now()); END IF;
  IF NEW.status='delivered' THEN NEW.delivered_at:=COALESCE(NEW.delivered_at,now()); END IF;
  IF NEW.status='cancelled' THEN
    IF OLD.status <> 'placed' THEN RAISE EXCEPTION 'customer cancellation allowed only before restaurant acceptance'; END IF;
    NEW.cancelled_at:=COALESCE(NEW.cancelled_at,now());
  END IF;
  IF NEW.status='rejected' THEN NEW.rejected_at:=COALESCE(NEW.rejected_at,now()); END IF;
  IF NEW.status='unassigned' THEN NEW.unassigned_at:=COALESCE(NEW.unassigned_at,now()); END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION log_order_status_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO order_events(order_id,actor_user_id,event_type,to_status,detail)
    VALUES(NEW.id,current_app_user_id(),'order_created',NEW.status,'{}');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_events(order_id,actor_user_id,event_type,from_status,to_status,detail)
    VALUES(NEW.id,current_app_user_id(),'status_changed',OLD.status,NEW.status,'{}');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION seed_order_accounting() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_rate integer;
BEGIN
  SELECT COALESCE((value #>> '{}')::integer,0) INTO v_rate FROM app_config WHERE key='delivery_rate_per_km_paise';
  INSERT INTO order_tips(order_id,amount_paise,status)
  VALUES(NEW.id,NEW.tip_paise,'pending_assignment') ON CONFLICT(order_id) DO NOTHING;
  INSERT INTO delivery_fee_accounting(order_id,distance_km,rate_per_km_paise,gross_fee_paise,status)
  VALUES(NEW.id,NEW.distance_km,v_rate,NEW.delivery_fee_paise,'pending_assignment') ON CONFLICT(order_id) DO NOTHING;
  INSERT INTO restaurant_settlement_ledger(restaurant_id,order_id,food_amount_paise,status)
  VALUES(NEW.restaurant_id,NEW.id,NEW.food_total_paise,'pending') ON CONFLICT(order_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION sync_order_accounting_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.delivery_agent_id IS DISTINCT FROM OLD.delivery_agent_id AND NEW.delivery_agent_id IS NOT NULL THEN
    UPDATE order_tips SET delivery_agent_id=NEW.delivery_agent_id, status='assigned', updated_at=now()
    WHERE order_id=NEW.id AND status IN ('pending_assignment','assigned');
    UPDATE delivery_fee_accounting SET delivery_agent_id=NEW.delivery_agent_id, status='assigned', updated_at=now()
    WHERE order_id=NEW.id AND status IN ('pending_assignment','assigned');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION post_delivery_financials() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_wallet uuid; v_tip_id uuid; v_fee_id uuid;
BEGIN
  IF NEW.status='delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    IF NEW.delivery_agent_id IS NULL THEN RAISE EXCEPTION 'delivery agent required to post delivery financials'; END IF;
    SELECT id INTO v_wallet FROM wallet_accounts WHERE delivery_agent_id=NEW.delivery_agent_id;
    IF v_wallet IS NULL THEN RAISE EXCEPTION 'wallet missing for delivery agent'; END IF;

    INSERT INTO wallet_ledger(wallet_id,order_id,entry_type,amount_paise,reference_key)
      VALUES(v_wallet,NEW.id,'delivery_fee',NEW.delivery_fee_paise,'order:'||NEW.id||':delivery_fee')
      ON CONFLICT(reference_key) DO NOTHING RETURNING id INTO v_fee_id;
    IF v_fee_id IS NULL THEN SELECT id INTO v_fee_id FROM wallet_ledger WHERE reference_key='order:'||NEW.id||':delivery_fee'; END IF;

    IF NEW.tip_paise > 0 THEN
      INSERT INTO wallet_ledger(wallet_id,order_id,entry_type,amount_paise,reference_key)
        VALUES(v_wallet,NEW.id,'tip',NEW.tip_paise,'order:'||NEW.id||':tip')
        ON CONFLICT(reference_key) DO NOTHING RETURNING id INTO v_tip_id;
      IF v_tip_id IS NULL THEN SELECT id INTO v_tip_id FROM wallet_ledger WHERE reference_key='order:'||NEW.id||':tip'; END IF;
    END IF;

    UPDATE delivery_fee_accounting SET status='earned', wallet_ledger_id=v_fee_id, updated_at=now() WHERE order_id=NEW.id;
    UPDATE order_tips SET status=CASE WHEN amount_paise=0 THEN 'earned' ELSE 'earned' END, wallet_ledger_id=v_tip_id, updated_at=now() WHERE order_id=NEW.id;
    UPDATE restaurant_settlement_ledger SET status='processing', updated_at=now() WHERE order_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION apply_wallet_ledger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='posted' THEN
    UPDATE wallet_accounts
      SET available_balance_paise=available_balance_paise+NEW.amount_paise,
          lifetime_earned_paise=lifetime_earned_paise + CASE WHEN NEW.amount_paise>0 AND NEW.entry_type IN ('delivery_fee','tip','adjustment_credit') THEN NEW.amount_paise ELSE 0 END,
          updated_at=now()
    WHERE id=NEW.wallet_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION prevent_wallet_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger is append-only; create reversing entries instead';
END $$;

CREATE OR REPLACE FUNCTION protect_user_privilege_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT is_super_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status OR NEW.phone IS DISTINCT FROM OLD.phone THEN
      RAISE EXCEPTION 'role, status and phone changes require super_admin';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
SET row_security=off
AS $$
DECLARE v_old jsonb; v_new jsonb; v_id text;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  v_id := COALESCE(v_new->>'id',v_old->>'id');
  INSERT INTO audit_log(actor_user_id,actor_role,action,table_name,row_id,old_data,new_data,request_id)
  VALUES(current_app_user_id(),current_app_role(),TG_OP,TG_TABLE_NAME,v_id,v_old,v_new,current_request_id());
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION validate_order_financials(p_order_id uuid) RETURNS void
LANGUAGE plpgsql STABLE AS $$
DECLARE v_food bigint; v_order orders%ROWTYPE; v_tip order_tips%ROWTYPE; v_fee delivery_fee_accounting%ROWTYPE; v_settle restaurant_settlement_ledger%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT COALESCE(SUM(line_total_paise),0) INTO v_food FROM order_items WHERE order_id=p_order_id;
  IF v_food <> v_order.food_total_paise THEN RAISE EXCEPTION 'food total mismatch: items %, order %',v_food,v_order.food_total_paise; END IF;
  SELECT * INTO v_tip FROM order_tips WHERE order_id=p_order_id;
  IF v_tip.amount_paise <> v_order.tip_paise OR v_tip.platform_deduction_paise<>0 THEN RAISE EXCEPTION 'tip accounting mismatch'; END IF;
  SELECT * INTO v_fee FROM delivery_fee_accounting WHERE order_id=p_order_id;
  IF v_fee.gross_fee_paise <> v_order.delivery_fee_paise OR v_fee.platform_deduction_paise<>0 THEN RAISE EXCEPTION 'delivery fee accounting mismatch'; END IF;
  SELECT * INTO v_settle FROM restaurant_settlement_ledger WHERE order_id=p_order_id;
  IF v_settle.food_amount_paise <> v_order.food_total_paise OR v_settle.platform_deduction_paise<>0 THEN RAISE EXCEPTION 'restaurant settlement mismatch'; END IF;
  IF v_order.platform_fee_paise<>0 THEN RAISE EXCEPTION 'platform fee must remain zero'; END IF;
END $$;

CREATE TRIGGER trg_app_users_updated BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_app_users_protect BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION protect_user_privilege_fields();
CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_restaurants_owner BEFORE INSERT OR UPDATE OF owner_user_id ON restaurants FOR EACH ROW EXECUTE FUNCTION validate_restaurant_owner_role();
CREATE TRIGGER trg_restaurant_hours_updated BEFORE UPDATE ON restaurant_hours FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_addresses_updated BEFORE UPDATE ON saved_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_address_default AFTER INSERT OR UPDATE OF is_default ON saved_addresses FOR EACH ROW WHEN (NEW.is_default) EXECUTE FUNCTION ensure_single_default_address();
CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON delivery_agents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_agents_role BEFORE INSERT OR UPDATE OF user_id ON delivery_agents FOR EACH ROW EXECUTE FUNCTION validate_delivery_agent_role();
CREATE TRIGGER trg_agents_wallet AFTER INSERT ON delivery_agents FOR EACH ROW EXECUTE FUNCTION create_agent_wallet();
CREATE TRIGGER trg_app_config_updated BEFORE UPDATE ON app_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_banners_updated BEFORE UPDATE ON festival_banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_participants BEFORE INSERT OR UPDATE OF customer_id,restaurant_id,address_id ON orders FOR EACH ROW EXECUTE FUNCTION validate_order_participants();
CREATE TRIGGER trg_orders_transition BEFORE UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION order_status_transition_guard();
CREATE TRIGGER trg_orders_event AFTER INSERT OR UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION log_order_status_event();
CREATE TRIGGER trg_orders_seed_accounting AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION seed_order_accounting();
CREATE TRIGGER trg_orders_assignment AFTER UPDATE OF delivery_agent_id ON orders FOR EACH ROW EXECUTE FUNCTION sync_order_accounting_assignment();
CREATE TRIGGER trg_orders_delivery_financials AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION post_delivery_financials();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON wallet_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_wallet_ledger_apply AFTER INSERT ON wallet_ledger FOR EACH ROW EXECUTE FUNCTION apply_wallet_ledger();
CREATE TRIGGER trg_wallet_ledger_immutable BEFORE UPDATE OR DELETE ON wallet_ledger FOR EACH ROW EXECUTE FUNCTION prevent_wallet_ledger_mutation();
CREATE TRIGGER trg_tips_updated BEFORE UPDATE ON order_tips FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fee_updated BEFORE UPDATE ON delivery_fee_accounting FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_settlement_updated BEFORE UPDATE ON restaurant_settlement_ledger FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_complaints_updated BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_cfg_updated BEFORE UPDATE ON sync_job_configs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bug_logs_updated BEFORE UPDATE ON bug_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_order_cancellations AFTER INSERT OR UPDATE OR DELETE ON order_cancellations FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_order_rejections AFTER INSERT OR UPDATE OR DELETE ON order_rejections FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_wallet_ledger AFTER INSERT OR UPDATE OR DELETE ON wallet_ledger FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_restaurant_settlements AFTER INSERT OR UPDATE OR DELETE ON restaurant_settlement_ledger FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_app_config AFTER INSERT OR UPDATE OR DELETE ON app_config FOR EACH ROW EXECUTE FUNCTION audit_row_change();

COMMIT;


-- ============================================================
-- SOURCE: 005_rls_rbac.sql
-- ============================================================

BEGIN;

-- Runtime applications must connect as a NON-OWNER role granted pb_authenticated.
-- Background jobs use pb_worker. Highly privileged operational service uses pb_super_service.

GRANT USAGE ON SCHEMA public TO pb_authenticated, pb_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pb_authenticated, pb_worker;

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE unassigned_order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_fee_accounting ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_settlement_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_job_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_field_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- app_users
CREATE POLICY app_users_self_select ON app_users FOR SELECT TO pb_authenticated USING (id=current_app_user_id() OR is_super_admin());
CREATE POLICY app_users_self_update ON app_users FOR UPDATE TO pb_authenticated USING (id=current_app_user_id() OR is_super_admin()) WITH CHECK (id=current_app_user_id() OR is_super_admin());

-- catalog: authenticated users can browse active catalog; owners can manage their own rows; super-admin manages all.
CREATE POLICY restaurants_read ON restaurants FOR SELECT TO pb_authenticated USING (is_active OR owns_restaurant(id) OR is_super_admin());
CREATE POLICY restaurants_owner_update ON restaurants FOR UPDATE TO pb_authenticated USING (owns_restaurant(id) OR is_super_admin()) WITH CHECK (owns_restaurant(id) OR is_super_admin());
CREATE POLICY restaurants_admin_all ON restaurants FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY hours_read ON restaurant_hours FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM restaurants r WHERE r.id=restaurant_id AND (r.is_active OR owns_restaurant(r.id))) OR is_super_admin());
CREATE POLICY hours_owner_write ON restaurant_hours FOR ALL TO pb_authenticated USING (owns_restaurant(restaurant_id) OR is_super_admin()) WITH CHECK (owns_restaurant(restaurant_id) OR is_super_admin());
CREATE POLICY media_read ON restaurant_media FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM restaurants r WHERE r.id=restaurant_id AND (r.is_active OR owns_restaurant(r.id))) OR is_super_admin());
CREATE POLICY media_owner_write ON restaurant_media FOR ALL TO pb_authenticated USING (owns_restaurant(restaurant_id) OR is_super_admin()) WITH CHECK (owns_restaurant(restaurant_id) OR is_super_admin());
CREATE POLICY menu_read ON menu_items FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM restaurants r WHERE r.id=restaurant_id AND (r.is_active OR owns_restaurant(r.id))) OR is_super_admin());
CREATE POLICY menu_owner_write ON menu_items FOR ALL TO pb_authenticated USING (owns_restaurant(restaurant_id) OR is_super_admin()) WITH CHECK (owns_restaurant(restaurant_id) OR is_super_admin());

-- customer addresses
CREATE POLICY addresses_customer_all ON saved_addresses FOR ALL TO pb_authenticated USING ((current_app_role()='customer' AND customer_id=current_app_user_id()) OR is_super_admin()) WITH CHECK ((current_app_role()='customer' AND customer_id=current_app_user_id()) OR is_super_admin());

-- agents
CREATE POLICY agents_read_self_admin ON delivery_agents FOR SELECT TO pb_authenticated USING (owns_delivery_agent(id) OR is_super_admin());
CREATE POLICY agents_update_self_admin ON delivery_agents FOR UPDATE TO pb_authenticated USING (owns_delivery_agent(id) OR is_super_admin()) WITH CHECK (owns_delivery_agent(id) OR is_super_admin());

-- config/banner
CREATE POLICY config_read ON app_config FOR SELECT TO pb_authenticated USING (true);
CREATE POLICY config_admin_write ON app_config FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY banners_read ON festival_banners FOR SELECT TO pb_authenticated USING ((is_active AND now() BETWEEN starts_at AND ends_at) OR is_super_admin());
CREATE POLICY banners_admin_write ON festival_banners FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- orders
CREATE POLICY orders_customer_select ON orders FOR SELECT TO pb_authenticated USING (current_app_role()='customer' AND customer_id=current_app_user_id());
CREATE POLICY orders_restaurant_select ON orders FOR SELECT TO pb_authenticated USING (current_app_role()='restaurant_owner' AND owns_restaurant(restaurant_id));
CREATE POLICY orders_agent_select ON orders FOR SELECT TO pb_authenticated USING (current_app_role()='delivery_agent' AND delivery_agent_id IS NOT NULL AND owns_delivery_agent(delivery_agent_id));
CREATE POLICY orders_admin_select ON orders FOR SELECT TO pb_authenticated USING (is_super_admin());
CREATE POLICY orders_customer_insert ON orders FOR INSERT TO pb_authenticated WITH CHECK (current_app_role()='customer' AND customer_id=current_app_user_id() AND status='placed');
CREATE POLICY orders_customer_cancel ON orders FOR UPDATE TO pb_authenticated USING (current_app_role()='customer' AND customer_id=current_app_user_id() AND status='placed') WITH CHECK (current_app_role()='customer' AND customer_id=current_app_user_id());
CREATE POLICY orders_restaurant_update ON orders FOR UPDATE TO pb_authenticated USING (current_app_role()='restaurant_owner' AND owns_restaurant(restaurant_id)) WITH CHECK (current_app_role()='restaurant_owner' AND owns_restaurant(restaurant_id));
CREATE POLICY orders_agent_update ON orders FOR UPDATE TO pb_authenticated USING (current_app_role()='delivery_agent' AND delivery_agent_id IS NOT NULL AND owns_delivery_agent(delivery_agent_id)) WITH CHECK (current_app_role()='delivery_agent' AND delivery_agent_id IS NOT NULL AND owns_delivery_agent(delivery_agent_id));
CREATE POLICY orders_admin_all ON orders FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY order_items_visible ON order_items FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id));
CREATE POLICY order_items_customer_insert ON order_items FOR INSERT TO pb_authenticated WITH CHECK (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.customer_id=current_app_user_id() AND o.status='placed'));
CREATE POLICY order_items_admin_all ON order_items FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY order_events_visible ON order_events FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id));
CREATE POLICY order_events_admin_write ON order_events FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- cancellation/rejection records
CREATE POLICY cancel_visible ON order_cancellations FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id) OR is_super_admin());
CREATE POLICY cancel_customer_insert ON order_cancellations FOR INSERT TO pb_authenticated WITH CHECK (current_app_role()='customer' AND cancelled_by_user_id=current_app_user_id() AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.customer_id=current_app_user_id() AND o.status='placed'));
CREATE POLICY cancel_admin_all ON order_cancellations FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY reject_visible ON order_rejections FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id) OR is_super_admin());
CREATE POLICY reject_restaurant_insert ON order_rejections FOR INSERT TO pb_authenticated WITH CHECK (current_app_role()='restaurant_owner' AND owns_restaurant(restaurant_id) AND rejected_by_user_id=current_app_user_id());
CREATE POLICY reject_admin_all ON order_rejections FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- assignments/unassigned
CREATE POLICY assignment_restaurant_read ON delivery_assignments FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND owns_restaurant(o.restaurant_id)) OR owns_delivery_agent(delivery_agent_id) OR is_super_admin());
CREATE POLICY assignment_agent_update ON delivery_assignments FOR UPDATE TO pb_authenticated USING (owns_delivery_agent(delivery_agent_id) OR is_super_admin()) WITH CHECK (owns_delivery_agent(delivery_agent_id) OR is_super_admin());
CREATE POLICY assignment_admin_all ON delivery_assignments FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY unassigned_visible ON unassigned_order_logs FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id) OR is_super_admin());
CREATE POLICY unassigned_admin_all ON unassigned_order_logs FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- payment/finance: customer sees payment + tip/fee for own order; agent sees own earnings; restaurant sees own food settlement; super-admin sees all.
CREATE POLICY payments_visible ON payment_transactions FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.customer_id=current_app_user_id()) OR is_super_admin());
CREATE POLICY payments_admin_all ON payment_transactions FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY wallets_agent_select ON wallet_accounts FOR SELECT TO pb_authenticated USING (owns_delivery_agent(delivery_agent_id) OR is_super_admin());
CREATE POLICY wallets_admin_all ON wallet_accounts FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY wallet_ledger_agent_select ON wallet_ledger FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM wallet_accounts w WHERE w.id=wallet_id AND owns_delivery_agent(w.delivery_agent_id)) OR is_super_admin());
CREATE POLICY wallet_ledger_admin_insert ON wallet_ledger FOR INSERT TO pb_authenticated WITH CHECK (is_super_admin());
CREATE POLICY tips_visible ON order_tips FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.customer_id=current_app_user_id()) OR (delivery_agent_id IS NOT NULL AND owns_delivery_agent(delivery_agent_id)) OR is_super_admin());
CREATE POLICY fees_visible ON delivery_fee_accounting FOR SELECT TO pb_authenticated USING (EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.customer_id=current_app_user_id()) OR (delivery_agent_id IS NOT NULL AND owns_delivery_agent(delivery_agent_id)) OR is_super_admin());
CREATE POLICY settlements_restaurant_select ON restaurant_settlement_ledger FOR SELECT TO pb_authenticated USING (owns_restaurant(restaurant_id) OR is_super_admin());
CREATE POLICY settlements_admin_all ON restaurant_settlement_ledger FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- reviews
CREATE POLICY reviews_read ON reviews FOR SELECT TO pb_authenticated USING (is_visible OR customer_id=current_app_user_id() OR owns_restaurant(restaurant_id) OR is_super_admin());
CREATE POLICY reviews_customer_insert ON reviews FOR INSERT TO pb_authenticated WITH CHECK (current_app_role()='customer' AND customer_id=current_app_user_id() AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.customer_id=current_app_user_id() AND o.status='delivered' AND o.restaurant_id=restaurant_id));
CREATE POLICY reviews_customer_update ON reviews FOR UPDATE TO pb_authenticated USING (customer_id=current_app_user_id() OR is_super_admin()) WITH CHECK ((customer_id=current_app_user_id() AND EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.customer_id=current_app_user_id() AND o.status='delivered' AND o.restaurant_id=restaurant_id)) OR is_super_admin());

-- notifications/complaints
CREATE POLICY notifications_self_select ON notifications FOR SELECT TO pb_authenticated USING (user_id=current_app_user_id() OR is_super_admin());
CREATE POLICY notifications_admin_all ON notifications FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY complaints_customer_select ON complaints FOR SELECT TO pb_authenticated USING (customer_id=current_app_user_id() OR is_super_admin());
CREATE POLICY complaints_customer_insert ON complaints FOR INSERT TO pb_authenticated WITH CHECK (current_app_role()='customer' AND customer_id=current_app_user_id());
CREATE POLICY complaints_admin_all ON complaints FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- admin-only operational data
CREATE POLICY fraud_admin ON fraud_flags FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY sync_configs_admin ON sync_job_configs FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY sync_jobs_admin ON sync_jobs FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY sync_logs_admin ON sync_job_logs FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY sync_changes_admin ON sync_field_changes FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY bugs_admin ON bug_logs FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY backups_admin ON backup_runs FOR ALL TO pb_authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY audit_admin ON audit_log FOR SELECT TO pb_authenticated USING (is_super_admin());

-- Worker policies: restricted to operational queues/logs and accounting writes.
CREATE POLICY worker_notifications ON notifications FOR ALL TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_assignments ON delivery_assignments FOR ALL TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_unassigned ON unassigned_order_logs FOR ALL TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_sync_cfg ON sync_job_configs FOR SELECT TO pb_worker USING (true);
CREATE POLICY worker_sync_jobs ON sync_jobs FOR ALL TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_sync_logs ON sync_job_logs FOR ALL TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_sync_changes ON sync_field_changes FOR ALL TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_bugs ON bug_logs FOR ALL TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_backups ON backup_runs FOR ALL TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_wallet_ledger ON wallet_ledger FOR INSERT TO pb_worker WITH CHECK (true);
CREATE POLICY worker_tips ON order_tips FOR UPDATE TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_fees ON delivery_fee_accounting FOR UPDATE TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_settlements ON restaurant_settlement_ledger FOR UPDATE TO pb_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_orders_read ON orders FOR SELECT TO pb_worker USING (true);
CREATE POLICY worker_orders_update ON orders FOR UPDATE TO pb_worker USING (true) WITH CHECK (true);

-- Grants: RLS still applies to these permissions.
GRANT SELECT, INSERT, UPDATE, DELETE ON app_users, restaurants, restaurant_hours, restaurant_media, menu_items, saved_addresses, delivery_agents, app_config, festival_banners TO pb_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON orders, order_items, order_events, order_cancellations, order_rejections, delivery_assignments, unassigned_order_logs TO pb_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_transactions, wallet_accounts, wallet_ledger, order_tips, delivery_fee_accounting, restaurant_settlement_ledger, reviews TO pb_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications, complaints, fraud_flags, sync_job_configs, sync_jobs, sync_job_logs, sync_field_changes, bug_logs, backup_runs TO pb_authenticated;
GRANT SELECT ON audit_log TO pb_authenticated;

GRANT SELECT, INSERT, UPDATE ON notifications, delivery_assignments, unassigned_order_logs, sync_jobs, sync_job_logs, sync_field_changes, bug_logs, backup_runs TO pb_worker;
GRANT SELECT ON sync_job_configs, orders, wallet_accounts, order_tips, delivery_fee_accounting, restaurant_settlement_ledger, delivery_agents TO pb_worker;
GRANT UPDATE ON orders, order_tips, delivery_fee_accounting, restaurant_settlement_ledger TO pb_worker;
GRANT INSERT ON wallet_ledger TO pb_worker;

REVOKE UPDATE, DELETE ON wallet_ledger FROM pb_worker;

COMMIT;


-- ============================================================
-- SOURCE: 006_indexes_views.sql
-- ============================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_saved_addresses_one_default
  ON saved_addresses(customer_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS ix_users_role_status ON app_users(role,status);
CREATE INDEX IF NOT EXISTS ix_restaurants_active_mandal ON restaurants(is_active,mandal,is_open);
CREATE INDEX IF NOT EXISTS ix_restaurants_geo ON restaurants(latitude,longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_menu_restaurant_available ON menu_items(restaurant_id,is_available,category);
CREATE INDEX IF NOT EXISTS ix_menu_price ON menu_items(restaurant_id,price_paise) WHERE is_available;
CREATE INDEX IF NOT EXISTS ix_agents_online ON delivery_agents(is_online,is_approved,last_seen_at DESC) WHERE is_online AND is_approved;
CREATE INDEX IF NOT EXISTS ix_orders_customer_created ON orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_restaurant_status_created ON orders(restaurant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orders_agent_status_created ON orders(delivery_agent_id,status,created_at DESC) WHERE delivery_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_orders_unassigned ON orders(created_at) WHERE status IN ('accepted','unassigned') AND delivery_agent_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS ix_order_events_order_created ON order_events(order_id,created_at);
CREATE INDEX IF NOT EXISTS ix_assignments_agent_status ON delivery_assignments(delivery_agent_id,status,offered_at DESC);
CREATE INDEX IF NOT EXISTS ix_payments_order_created ON payment_transactions(order_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_wallet_ledger_wallet_created ON wallet_ledger(wallet_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_wallet_ledger_order ON wallet_ledger(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_reviews_restaurant_created ON reviews(restaurant_id,created_at DESC) WHERE is_visible;
CREATE INDEX IF NOT EXISTS ix_notifications_queue ON notifications(status,next_attempt_at,created_at) WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS ix_complaints_status_created ON complaints(status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_fraud_unreviewed ON fraud_flags(score DESC,created_at DESC) WHERE NOT is_reviewed;
CREATE INDEX IF NOT EXISTS ix_sync_jobs_provider_created ON sync_jobs(provider,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_sync_logs_job_created ON sync_job_logs(sync_job_id,created_at);
CREATE INDEX IF NOT EXISTS ix_sync_changes_entity ON sync_field_changes(entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_bugs_status_severity ON bug_logs(status,severity,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_table_row_created ON audit_log(table_name,row_id,created_at DESC);

CREATE OR REPLACE VIEW restaurant_daily_sales WITH (security_invoker=true) AS
SELECT
  o.restaurant_id,
  (o.delivered_at AT TIME ZONE 'Asia/Kolkata')::date AS sales_date,
  COUNT(*) AS delivered_orders,
  SUM(o.food_total_paise)::bigint AS food_sales_paise
FROM orders o
WHERE o.status='delivered'
GROUP BY o.restaurant_id,(o.delivered_at AT TIME ZONE 'Asia/Kolkata')::date;

CREATE OR REPLACE VIEW restaurant_top_selling_dishes WITH (security_invoker=true) AS
SELECT
  o.restaurant_id,
  oi.name_snapshot,
  SUM(oi.quantity)::bigint AS quantity_sold,
  SUM(oi.line_total_paise)::bigint AS sales_paise
FROM order_items oi
JOIN orders o ON o.id=oi.order_id
WHERE o.status='delivered'
GROUP BY o.restaurant_id,oi.name_snapshot;

CREATE OR REPLACE VIEW delivery_agent_wallet_summary WITH (security_invoker=true) AS
SELECT
  wa.delivery_agent_id,
  wa.available_balance_paise,
  wa.lifetime_earned_paise,
  COALESCE(SUM(wl.amount_paise) FILTER (WHERE wl.entry_type='delivery_fee' AND wl.status='posted'),0)::bigint AS delivery_fee_income_paise,
  COALESCE(SUM(wl.amount_paise) FILTER (WHERE wl.entry_type='tip' AND wl.status='posted'),0)::bigint AS tip_income_paise
FROM wallet_accounts wa
LEFT JOIN wallet_ledger wl ON wl.wallet_id=wa.id
GROUP BY wa.id,wa.delivery_agent_id,wa.available_balance_paise,wa.lifetime_earned_paise;

CREATE OR REPLACE VIEW platform_zero_commission_reconciliation WITH (security_invoker=true) AS
SELECT
  o.id AS order_id,
  o.status,
  o.food_total_paise,
  o.delivery_fee_paise,
  o.tip_paise,
  o.platform_fee_paise,
  rs.restaurant_net_paise,
  df.rider_net_paise AS delivery_rider_net_paise,
  t.rider_net_paise AS tip_rider_net_paise,
  (o.platform_fee_paise=0
   AND rs.platform_deduction_paise=0
   AND df.platform_deduction_paise=0
   AND t.platform_deduction_paise=0
   AND rs.restaurant_net_paise=o.food_total_paise
   AND df.rider_net_paise=o.delivery_fee_paise
   AND t.rider_net_paise=o.tip_paise) AS is_zero_commission_consistent
FROM orders o
JOIN restaurant_settlement_ledger rs ON rs.order_id=o.id
JOIN delivery_fee_accounting df ON df.order_id=o.id
JOIN order_tips t ON t.order_id=o.id;

GRANT SELECT ON restaurant_daily_sales, restaurant_top_selling_dishes, delivery_agent_wallet_summary, platform_zero_commission_reconciliation TO pb_authenticated;
GRANT SELECT ON restaurant_daily_sales, restaurant_top_selling_dishes, delivery_agent_wallet_summary, platform_zero_commission_reconciliation TO pb_worker;

COMMIT;


-- ============================================================
-- SOURCE: 007_invariant_guards.sql
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION enforce_cancellation_record_consistency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF NOT EXISTS (SELECT 1 FROM order_cancellations c WHERE c.order_id=NEW.id) THEN
      RAISE EXCEPTION 'order_cancellations record with mandatory reason must exist before cancelling order';
    END IF;
  END IF;
  IF NEW.status='rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    IF NOT EXISTS (SELECT 1 FROM order_rejections r WHERE r.order_id=NEW.id) THEN
      RAISE EXCEPTION 'order_rejections record with mandatory reason must exist before rejecting order';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_reason_records
BEFORE UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION enforce_cancellation_record_consistency();

CREATE OR REPLACE FUNCTION enforce_cancellation_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id=NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status <> 'placed' THEN RAISE EXCEPTION 'cancellation allowed only before restaurant acceptance'; END IF;
  IF v_order.customer_id <> NEW.cancelled_by_user_id AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'only the ordering customer or super_admin may cancel';
  END IF;
  NEW.status_before := v_order.status;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cancel_validate BEFORE INSERT ON order_cancellations FOR EACH ROW EXECUTE FUNCTION enforce_cancellation_insert();

CREATE OR REPLACE FUNCTION enforce_rejection_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id=NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.restaurant_id <> NEW.restaurant_id THEN RAISE EXCEPTION 'restaurant mismatch'; END IF;
  IF v_order.status NOT IN ('placed','accepted') THEN RAISE EXCEPTION 'order cannot be rejected from status %',v_order.status; END IF;
  IF NOT owns_restaurant(NEW.restaurant_id) AND NOT is_super_admin() THEN RAISE EXCEPTION 'restaurant ownership mismatch'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reject_validate BEFORE INSERT ON order_rejections FOR EACH ROW EXECUTE FUNCTION enforce_rejection_insert();

CREATE OR REPLACE FUNCTION prevent_order_financial_mutation_after_acceptance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'placed' AND (
      NEW.food_total_paise IS DISTINCT FROM OLD.food_total_paise OR
      NEW.delivery_fee_paise IS DISTINCT FROM OLD.delivery_fee_paise OR
      NEW.tip_paise IS DISTINCT FROM OLD.tip_paise OR
      NEW.distance_km IS DISTINCT FROM OLD.distance_km OR
      NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR
      NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
      NEW.address_id IS DISTINCT FROM OLD.address_id
  ) THEN
    RAISE EXCEPTION 'financial/order identity fields are immutable after placement stage';
  END IF;
  IF NEW.platform_fee_paise<>0 THEN RAISE EXCEPTION 'platform fee must always be zero'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_financial_immutability BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION prevent_order_financial_mutation_after_acceptance();

CREATE OR REPLACE FUNCTION prevent_accounting_amount_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT is_super_admin() AND (
    to_jsonb(NEW)->>'amount_paise' IS DISTINCT FROM to_jsonb(OLD)->>'amount_paise' OR
    to_jsonb(NEW)->>'gross_fee_paise' IS DISTINCT FROM to_jsonb(OLD)->>'gross_fee_paise' OR
    to_jsonb(NEW)->>'food_amount_paise' IS DISTINCT FROM to_jsonb(OLD)->>'food_amount_paise' OR
    to_jsonb(NEW)->>'platform_deduction_paise' IS DISTINCT FROM to_jsonb(OLD)->>'platform_deduction_paise'
  ) THEN
    RAISE EXCEPTION 'accounting monetary amounts require super_admin';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tips_amount_guard BEFORE UPDATE ON order_tips FOR EACH ROW EXECUTE FUNCTION prevent_accounting_amount_mutation();
CREATE TRIGGER trg_fee_amount_guard BEFORE UPDATE ON delivery_fee_accounting FOR EACH ROW EXECUTE FUNCTION prevent_accounting_amount_mutation();
CREATE TRIGGER trg_settlement_amount_guard BEFORE UPDATE ON restaurant_settlement_ledger FOR EACH ROW EXECUTE FUNCTION prevent_accounting_amount_mutation();


CREATE OR REPLACE FUNCTION enforce_restaurant_sensitive_updates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT is_super_admin() THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active OR
       NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR
       NEW.external_source IS DISTINCT FROM OLD.external_source OR
       NEW.external_source_key IS DISTINCT FROM OLD.external_source_key THEN
      RAISE EXCEPTION 'restaurant activation, ownership and external-source identity require super_admin';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_restaurants_sensitive_guard
BEFORE UPDATE ON restaurants
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_sensitive_updates();

CREATE OR REPLACE FUNCTION enforce_agent_sensitive_updates() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT is_super_admin() THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION 'delivery-agent identity and approval require super_admin';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_agents_sensitive_guard
BEFORE UPDATE ON delivery_agents
FOR EACH ROW EXECUTE FUNCTION enforce_agent_sensitive_updates();

CREATE OR REPLACE FUNCTION enforce_order_insert_permissions() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_role app_user_role := current_app_role();
BEGIN
  IF v_role='customer' THEN
    IF NEW.customer_id<>current_app_user_id() OR NEW.status<>'placed' OR NEW.delivery_agent_id IS NOT NULL OR
       NEW.accepted_at IS NOT NULL OR NEW.assigned_at IS NOT NULL OR NEW.picked_up_at IS NOT NULL OR
       NEW.delivered_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL OR NEW.rejected_at IS NOT NULL OR
       NEW.unassigned_at IS NOT NULL OR NEW.platform_fee_paise<>0 THEN
      RAISE EXCEPTION 'customer order insert contains privileged fields';
    END IF;
    IF NEW.payment_method='cod' AND NEW.payment_status<>'cod_due' THEN
      RAISE EXCEPTION 'COD order must start as cod_due';
    ELSIF NEW.payment_method<>'cod' AND NEW.payment_status NOT IN ('pending','authorized') THEN
      RAISE EXCEPTION 'online-payment order must start pending or authorized';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_insert_permissions
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION enforce_order_insert_permissions();

CREATE OR REPLACE FUNCTION enforce_order_update_permissions() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_role app_user_role := current_app_role();
DECLARE is_worker boolean := pg_has_role(current_user,'pb_worker','member');
BEGIN
  IF is_super_admin() THEN
    IF NEW.platform_fee_paise<>0 THEN RAISE EXCEPTION 'platform fee must always be zero'; END IF;
    RETURN NEW;
  END IF;

  -- Monetary and identity fields are never user-editable through status workflows.
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
     NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR
     NEW.address_id IS DISTINCT FROM OLD.address_id OR
     NEW.food_total_paise IS DISTINCT FROM OLD.food_total_paise OR
     NEW.delivery_fee_paise IS DISTINCT FROM OLD.delivery_fee_paise OR
     NEW.tip_paise IS DISTINCT FROM OLD.tip_paise OR
     NEW.platform_fee_paise IS DISTINCT FROM OLD.platform_fee_paise OR
     NEW.distance_km IS DISTINCT FROM OLD.distance_km OR
     NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'order identity and monetary fields are immutable';
  END IF;

  IF v_role='customer' THEN
    IF OLD.status<>'placed' OR NEW.status<>'cancelled' OR
       NEW.delivery_agent_id IS DISTINCT FROM OLD.delivery_agent_id OR
       NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      RAISE EXCEPTION 'customer may only cancel a placed order';
    END IF;
  ELSIF v_role='restaurant_owner' THEN
    IF NEW.delivery_agent_id IS DISTINCT FROM OLD.delivery_agent_id OR
       NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      RAISE EXCEPTION 'restaurant owner cannot mutate assignment or payment fields';
    END IF;
  ELSIF v_role='delivery_agent' THEN
    IF NEW.delivery_agent_id IS DISTINCT FROM OLD.delivery_agent_id OR
       NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      RAISE EXCEPTION 'delivery agent cannot mutate assignment or payment fields';
    END IF;
  ELSIF is_worker THEN
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      RAISE EXCEPTION 'worker cannot mutate payment method';
    END IF;
  ELSE
    RAISE EXCEPTION 'unauthorized order update';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_update_permissions
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION enforce_order_update_permissions();

CREATE OR REPLACE FUNCTION enforce_review_update_consistency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT is_super_admin() THEN
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
      RAISE EXCEPTION 'review ownership/order linkage is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reviews_link_guard
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION enforce_review_update_consistency();

COMMIT;
