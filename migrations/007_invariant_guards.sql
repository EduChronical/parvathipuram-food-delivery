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
