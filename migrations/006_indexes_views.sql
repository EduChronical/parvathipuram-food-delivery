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
