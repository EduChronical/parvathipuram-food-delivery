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
