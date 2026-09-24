BEGIN;

-- NULLS NOT DISTINCT made every manually-created restaurant/menu item collide
-- because each has NULL external IDs. Keep uniqueness for supplied external IDs.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass AS table_name
    FROM pg_constraint
    WHERE contype = 'u'
      AND conrelid IN ('public.restaurants'::regclass, 'public.menu_items'::regclass)
      AND pg_get_constraintdef(oid) LIKE 'UNIQUE NULLS NOT DISTINCT%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.table_name, c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_external_source_identity
  ON public.restaurants(external_source, external_source_key)
  WHERE external_source IS NOT NULL AND external_source_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_external_source_identity
  ON public.menu_items(restaurant_id, external_source, external_source_key)
  WHERE external_source IS NOT NULL AND external_source_key IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE delivery_agent_id IS NOT NULL AND status IN ('assigned','picked_up')
    GROUP BY delivery_agent_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existing riders have multiple active orders; resolve before applying rider-capacity index';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_order_per_delivery_agent
  ON public.orders(delivery_agent_id)
  WHERE delivery_agent_id IS NOT NULL AND status IN ('assigned','picked_up');

COMMIT;
