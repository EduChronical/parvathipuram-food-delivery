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
