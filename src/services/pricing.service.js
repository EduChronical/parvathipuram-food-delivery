import { HttpError } from '../http/errors.js';

export function haversineKm(aLat, aLng, bLat, bLng) {
  const values = [aLat, aLng, bLat, bLng].map(Number);
  if (values.some(v => !Number.isFinite(v))) throw new HttpError(422, 'LOCATION_REQUIRED', 'Valid restaurant and delivery coordinates are required.');
  const [lat1, lon1, lat2, lon2] = values;
  const r = 6371.0088;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export async function loadPricingConfig(client) {
  const keys = ['delivery_rate_per_km_paise','minimum_delivery_fee_paise','service_zone_center','service_zone_radius_km'];
  const { rows } = await client.query(`SELECT key,value FROM app_config WHERE key = ANY($1::text[])`, [keys]);
  const map = new Map(rows.map(r => [r.key, r.value]));
  const rate = Number(map.get('delivery_rate_per_km_paise'));
  const minimum = Number(map.get('minimum_delivery_fee_paise'));
  const radius = Number(map.get('service_zone_radius_km'));
  const center = map.get('service_zone_center');
  if (!Number.isSafeInteger(rate) || rate < 0 || !Number.isSafeInteger(minimum) || minimum < 0 || !Number.isFinite(radius) || radius <= 0 || !center) {
    throw new HttpError(500, 'CONFIG_ERROR', 'Delivery pricing/service-zone configuration is invalid.');
  }
  return { ratePerKmPaise: rate, minimumFeePaise: minimum, serviceZoneRadiusKm: radius, center: { lat: Number(center.lat), lng: Number(center.lng) } };
}

export function calculateDeliveryFee(distanceKm, ratePerKmPaise, minimumFeePaise) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new HttpError(422, 'INVALID_DISTANCE', 'Invalid delivery distance.');
  return Math.max(minimumFeePaise, Math.ceil(distanceKm * ratePerKmPaise));
}

export function assertInsideZone(lat, lng, config) {
  const km = haversineKm(config.center.lat, config.center.lng, lat, lng);
  if (km > config.serviceZoneRadiusKm) throw new HttpError(422, 'OUTSIDE_SERVICE_ZONE', `Location is outside the ${config.serviceZoneRadiusKm} km service zone.`);
  return km;
}
