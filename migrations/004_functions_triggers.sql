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
