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
