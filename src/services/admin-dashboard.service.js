import { config } from '../config.js';
import { HttpError } from '../http/errors.js';
import { rowsToCsv } from './csv.service.js';
import { withPhase4ActorTx } from './phase4-db.service.js';

function indiaTodayParts() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const map=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return { y:Number(map.year),m:Number(map.month),d:Number(map.day) };
}

function parseYmd(input) {
  if (input === undefined || input === null || input === '') return indiaTodayParts();
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input));
  if (!match) throw new HttpError(400,'INVALID_DATE','date must be YYYY-MM-DD.');
  const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
  const check=new Date(Date.UTC(y,m-1,d));
  if (check.getUTCFullYear()!==y || check.getUTCMonth()!==m-1 || check.getUTCDate()!==d) {
    throw new HttpError(400,'INVALID_DATE','date must be a valid calendar date.');
  }
  return {y,m,d};
}

function shiftYmd(parts, days) {
  const dt=new Date(Date.UTC(parts.y,parts.m-1,parts.d+days));
  return { y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:dt.getUTCDate() };
}

function startOfMonth(parts, offset=0) {
  const dt=new Date(Date.UTC(parts.y,parts.m-1+offset,1));
  return { y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:1 };
}

function ymdOffset(parts) {
  return `${parts.y}-${String(parts.m).padStart(2,'0')}-${String(parts.d).padStart(2,'0')}T00:00:00+05:30`;
}

function parsePeriodRange(period, anchorDate) {
  const anchor=parseYmd(anchorDate);
  let start,end;
  if (period === 'daily') {
    start=anchor; end=shiftYmd(anchor,1);
  } else if (period === 'weekly') {
    const weekday=new Date(Date.UTC(anchor.y,anchor.m-1,anchor.d)).getUTCDay();
    const mondayOffset=weekday===0?-6:1-weekday;
    start=shiftYmd(anchor,mondayOffset); end=shiftYmd(start,7);
  } else if (period === 'monthly') {
    start=startOfMonth(anchor,0); end=startOfMonth(anchor,1);
  } else {
    throw new HttpError(400,'INVALID_PERIOD','period must be daily, weekly, or monthly.');
  }
  return { start:ymdOffset(start),end:ymdOffset(end) };
}

export async function getAdminLiveDashboard(actorUserId, requestId) {
  return withPhase4ActorTx(actorUserId,'super_admin',requestId,async client => {
    const summary = (await client.query(`SELECT
      (SELECT count(*)::int FROM restaurants WHERE is_active) AS active_restaurants,
      (SELECT count(*)::int FROM orders WHERE status IN ('placed','accepted','assigned','picked_up','unassigned')) AS live_orders`)).rows[0];
    const riders = (await client.query(
      `SELECT d.id,d.user_id,u.full_name AS display_name,d.phone AS phone_e164,d.vehicle_type,u.status,d.is_approved AS approved,d.is_online,
              (d.is_online AND d.is_approved AND u.status='active' AND COALESCE(d.last_seen_at >= now()-($1::text || ' seconds')::interval,false)) AS effective_online,
              d.latitude AS current_latitude,d.longitude AS current_longitude,d.last_seen_at,
              EXISTS(SELECT 1 FROM public.orders o WHERE o.delivery_agent_id=d.id AND o.status IN ('assigned','picked_up')) AS has_active_delivery
         FROM public.delivery_agents d JOIN public.app_users u ON u.id=d.user_id
        ORDER BY effective_online DESC,d.is_online DESC,d.last_seen_at DESC NULLS LAST,u.full_name LIMIT 500`,
      [config.riderOnlineGraceSeconds]
    )).rows;
    summary.active_riders = riders.filter(r => r.effective_online).length;
    summary.stale_online_riders = riders.filter(r => r.is_online && !r.effective_online).length;
    const restaurants = (await client.query(
      `SELECT r.id,r.shop_name,r.owner_name,r.phone AS phone_e164,r.is_active,r.is_open AS is_accepting_orders,r.avg_rating AS average_rating,r.rating_count,r.eta_minutes AS default_eta_minutes,
              count(o.id) FILTER (WHERE o.status IN ('placed','accepted','assigned','picked_up','unassigned'))::int AS live_order_count
         FROM public.restaurants r
         LEFT JOIN public.orders o ON o.restaurant_id=r.id
        WHERE r.is_active
        GROUP BY r.id ORDER BY r.is_open DESC,live_order_count DESC,r.shop_name LIMIT 500`
    )).rows;
    const orders = (await client.query(
      `SELECT o.id,o.id AS order_number,o.status::text AS status,o.payment_status::text AS payment_status,o.total_paise AS grand_total_paise,o.created_at,
              o.restaurant_id,r.shop_name,o.delivery_agent_id,u.full_name AS rider_name
         FROM public.orders o
         JOIN public.restaurants r ON r.id=o.restaurant_id
         LEFT JOIN public.delivery_agents d ON d.id=o.delivery_agent_id
         LEFT JOIN public.app_users u ON u.id=d.user_id
        WHERE o.status IN ('placed','accepted','assigned','picked_up','unassigned')
        ORDER BY o.created_at DESC LIMIT 250`
    )).rows;
    return { summary,riders,restaurants,orders };
  });
}

export async function listOperationalLogs(actorUserId, requestId, { type = 'all', limit = 150 } = {}) {
  return withPhase4ActorTx(actorUserId,'super_admin',requestId,async client => {
    const result = { cancelled:[],rejected:[],unassigned:[] };
    if (type === 'all' || type === 'cancelled') result.cancelled = (await client.query(
      `SELECT c.id,c.order_id,o.id AS order_number,c.reason_code,c.reason_text,c.created_at,u.full_name AS actor_name,r.shop_name
         FROM public.order_cancellations c JOIN public.orders o ON o.id=c.order_id
         JOIN public.app_users u ON u.id=c.cancelled_by_user_id JOIN public.restaurants r ON r.id=o.restaurant_id
        ORDER BY c.created_at DESC LIMIT $1`,[limit])).rows;
    if (type === 'all' || type === 'rejected') result.rejected = (await client.query(
      `SELECT x.id,x.order_id,o.id AS order_number,x.reason_code,x.reason_text,x.created_at,u.full_name AS actor_name,r.shop_name
         FROM public.order_rejections x JOIN public.orders o ON o.id=x.order_id
         JOIN public.app_users u ON u.id=x.rejected_by_user_id JOIN public.restaurants r ON r.id=x.restaurant_id
        ORDER BY x.created_at DESC LIMIT $1`,[limit])).rows;
    if (type === 'all' || type === 'unassigned') result.unassigned = (await client.query(
      `SELECT e.id,e.order_id,o.id AS order_number,e.reason_code,e.reason_text,e.timeout_seconds,e.available_agents,e.created_at,r.shop_name
         FROM public.unassigned_order_logs e JOIN public.orders o ON o.id=e.order_id JOIN public.restaurants r ON r.id=o.restaurant_id
        ORDER BY e.created_at DESC LIMIT $1`,[limit])).rows;
    return result;
  });
}

export async function exportOrdersCsv(actorUserId, requestId, period, anchorDate) {
  return withPhase4ActorTx(actorUserId,'super_admin',requestId,async client => {
    const { start,end } = parsePeriodRange(period,anchorDate);
    const { rows } = await client.query(
      `SELECT o.id AS order_number,o.created_at,o.status::text AS status,o.payment_method::text AS payment_method,o.payment_status::text AS payment_status,
              r.shop_name,o.food_total_paise,o.delivery_fee_paise,o.tip_paise,o.platform_fee_paise,o.total_paise AS grand_total_paise,
              o.distance_km*1000 AS distance_meters,r.eta_minutes AS estimated_delivery_minutes,o.delivered_at,o.cancelled_at,o.rejected_at,o.unassigned_at
         FROM public.orders o JOIN public.restaurants r ON r.id=o.restaurant_id
        WHERE o.created_at >= $1::timestamptz AND o.created_at < $2::timestamptz
        ORDER BY o.created_at ASC`,
      [start,end]
    );
    const csv = rowsToCsv(rows,[
      {key:'order_number',label:'Order Number'},{key:'created_at',label:'Created At'},{key:'status',label:'Status'},
      {key:'payment_method',label:'Payment Method'},{key:'payment_status',label:'Payment Status'},{key:'shop_name',label:'Restaurant'},
      {key:'food_total_paise',label:'Food Total Paise'},{key:'delivery_fee_paise',label:'Delivery Fee Paise'},{key:'tip_paise',label:'Tip Paise'},
      {key:'platform_fee_paise',label:'Platform Fee Paise'},{key:'grand_total_paise',label:'Grand Total Paise'},
      {key:'distance_meters',label:'Distance Meters'},{key:'estimated_delivery_minutes',label:'ETA Minutes'},
      {key:'delivered_at',label:'Delivered At'},{key:'cancelled_at',label:'Cancelled At'},{key:'rejected_at',label:'Rejected At'},{key:'unassigned_at',label:'Unassigned At'}
    ]);
    return { csv,start,end,rowCount:rows.length };
  });
}
