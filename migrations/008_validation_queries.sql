-- Read-only post-migration validation queries. Run after applying migrations 000-007.

-- 1) All required tables should exist.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'app_users','restaurants','restaurant_hours','restaurant_media','menu_items','saved_addresses','delivery_agents','app_config','festival_banners',
    'orders','order_items','order_events','order_cancellations','order_rejections','delivery_assignments','unassigned_order_logs','payment_transactions',
    'wallet_accounts','wallet_ledger','order_tips','delivery_fee_accounting','restaurant_settlement_ledger','reviews','notifications','complaints','fraud_flags',
    'sync_job_configs','sync_jobs','sync_job_logs','sync_field_changes','bug_logs','backup_runs','audit_log'
  )
ORDER BY table_name;

-- 2) RLS must be enabled on protected tables.
SELECT schemaname,tablename,rowsecurity
FROM pg_tables
WHERE schemaname='public'
ORDER BY tablename;

-- 3) List policies for security review.
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename,policyname;

-- 4) Zero-commission violations must return zero rows.
SELECT * FROM platform_zero_commission_reconciliation
WHERE NOT is_zero_commission_consistent;

-- 5) Duplicate idempotency keys per customer must return zero rows.
SELECT customer_id,idempotency_key,COUNT(*)
FROM orders GROUP BY customer_id,idempotency_key HAVING COUNT(*)>1;

-- 6) More than one default address per customer must return zero rows.
SELECT customer_id,COUNT(*) FROM saved_addresses
WHERE is_default GROUP BY customer_id HAVING COUNT(*)>1;
