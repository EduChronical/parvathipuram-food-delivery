-- Apply as schema owner after the base migrations. Runtime login must be granted
-- pb_auth_service membership by the deployment administrator, never SUPERUSER.
-- Phone is an unverified login identifier; registration does not prove ownership.
BEGIN;
DO $$ BEGIN CREATE ROLE pb_auth_service NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS pb_auth;
REVOKE ALL ON SCHEMA pb_auth FROM PUBLIC, pb_authenticated, pb_worker;
GRANT USAGE ON SCHEMA pb_auth TO pb_auth_service;
CREATE TABLE IF NOT EXISTS pb_auth.credentials (
  user_id uuid PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  password_hash text NOT NULL CHECK (password_hash ~ '^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON pb_auth.credentials FROM PUBLIC, pb_auth_service, pb_authenticated, pb_worker;

CREATE OR REPLACE FUNCTION pb_auth.register_customer(p_name text, p_phone text, p_hash text)
RETURNS TABLE(id uuid, full_name text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_phone !~ '^\+91[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Invalid phone' USING ERRCODE='23514'; END IF;
  INSERT INTO public.app_users (full_name, phone, role, status)
    VALUES (p_name, p_phone, 'customer', 'active') RETURNING app_users.id INTO v_id;
  INSERT INTO pb_auth.credentials (user_id, password_hash) VALUES (v_id, p_hash);
  RETURN QUERY SELECT u.id, u.full_name, u.role::text FROM public.app_users u WHERE u.id=v_id;
END $$;

CREATE OR REPLACE FUNCTION pb_auth.credentials_for_phone(p_phone text)
RETURNS TABLE(id uuid, full_name text, role text, status text, password_hash text, restaurant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT u.id, u.full_name, u.role::text, u.status::text, c.password_hash,
    (SELECT r.id FROM public.restaurants r WHERE r.owner_user_id=u.id ORDER BY r.created_at, r.id LIMIT 1)
  FROM public.app_users u JOIN pb_auth.credentials c ON c.user_id=u.id WHERE u.phone::text=p_phone
$$;
CREATE OR REPLACE FUNCTION pb_auth.active_profile(p_id uuid)
RETURNS TABLE(id uuid, full_name text, role text, restaurant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT u.id, u.full_name, u.role::text,
    (SELECT r.id FROM public.restaurants r WHERE r.owner_user_id=u.id ORDER BY r.created_at, r.id LIMIT 1)
  FROM public.app_users u WHERE u.id=p_id AND u.status='active'
$$;
REVOKE ALL ON FUNCTION pb_auth.register_customer(text,text,text), pb_auth.credentials_for_phone(text), pb_auth.active_profile(uuid) FROM PUBLIC, pb_authenticated, pb_worker;
GRANT EXECUTE ON FUNCTION pb_auth.register_customer(text,text,text), pb_auth.credentials_for_phone(text), pb_auth.active_profile(uuid) TO pb_auth_service;
COMMIT;
