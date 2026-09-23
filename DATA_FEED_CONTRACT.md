# Authorized catalog feed contract

Phase 5 deliberately accepts authorized data feeds only. It does not crawl restaurant marketplaces, parse HTML pages, solve CAPTCHAs, rotate IP addresses, or bypass access controls.

## CSV adapter

`catalog_sources.configuration`:

```json
{
  "adapter": "csv",
  "paused": false,
  "restaurant_feed": "https://feeds.example.com/restaurants.csv",
  "menu_feed": "https://feeds.example.com/menu.csv",
  "allowed_hosts": ["feeds.example.com"],
  "auth_env_key": "VENDOR_FEED_TOKEN",
  "auth_scheme": "bearer",
  "default_owner_user_id": "UUID"
}
```

The auth secret is read from the environment. Never store tokens in `catalog_sources.configuration`.

Restaurant CSV headers:
`external_restaurant_id,shop_name,owner_name,phone_e164,location_text,latitude,longitude,cuisine_tags,primary_category,street_food_or_tiffin,default_eta_minutes,cover_image_url`

`cuisine_tags` uses `|` as the separator.

Menu CSV headers:
`external_menu_item_id,external_restaurant_id,name_en,name_te,description_en,description_te,price_paise,is_veg,is_available,preparation_minutes,primary_image_url`

For new restaurants, `shop_name`, `owner_name`, `phone_e164`, and `location_text` are required. Because Phase-1 makes `primary_owner_user_id` non-null, new feed-created listings use the configured `default_owner_user_id` until an administrator transfers/claims ownership. New feed restaurants keep the Phase-1 default `pending_activation` state; the sync does not bypass compliance/activation controls.

For new menu items, `name_en`, `price_paise`, and `is_veg` are required.

## JSON adapter

Configuration:

```json
{
  "adapter": "json",
  "endpoint": "https://api.example.com/v1/parvathipuram/catalog",
  "allowed_hosts": ["api.example.com"],
  "auth_env_key": "VENDOR_FEED_TOKEN",
  "auth_scheme": "x-api-key",
  "default_owner_user_id": "UUID"
}
```

Response:

```json
{
  "restaurants": [ { "...": "same fields as restaurant CSV" } ],
  "menu_items": [ { "...": "same fields as menu CSV" } ]
}
```

## Owner-field locks

Before updating an existing `restaurants` or `menu_items` row, Phase 5 reads active `app.sync_field_locks`. A locked incoming field is never written. The attempted overwrite is written to `app.sync_entity_changes` with `action='skipped_locked'`.

The Phase-1 database trigger is a second enforcement layer. Phase 5 never sets `app.owner_lock_bypass=1`.

Missing records in a feed are not automatically deleted. That prevents a malformed/partial feed from deleting live owner catalog data.
