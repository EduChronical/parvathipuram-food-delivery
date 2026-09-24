function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function intEnv(name, fallback, min = 0) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) throw new Error(`Invalid integer env ${name}`);
  return value;
}

function corsOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? process.env.RENDER_EXTERNAL_URL ?? '';
  return Object.freeze(raw.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) throw new Error('CORS_ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths or wildcards');
    return value;
  }));
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: intEnv('PORT', 8080, 1),
  databaseUrl: required('DATABASE_URL'),
  corsAllowedOrigins: corsOrigins(),
  dbPoolMax: intEnv('DB_POOL_MAX', 20, 1),
  jwtSecret: required('JWT_HS256_SECRET'),
  jwtIssuer: process.env.JWT_ISSUER ?? 'parvathipuram-bites',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'parvathipuram-bites-api',
  systemActorUserId: required('SYSTEM_ACTOR_USER_ID'),
  paymentWebhookSecret: required('PAYMENT_WEBHOOK_SECRET'),
  paymentAllowedProviders: Object.freeze((process.env.PAYMENT_ALLOWED_PROVIDERS ?? '').split(',').map(value => value.trim()).filter(Boolean)),
  smsProviderUrl: process.env.SMS_PROVIDER_URL ?? '',
  smsProviderApiKey: process.env.SMS_PROVIDER_API_KEY ?? '',
  smsSenderId: process.env.SMS_SENDER_ID ?? 'PVBITES',
  riderOfferTtlSeconds: intEnv('RIDER_OFFER_TTL_SECONDS', 30, 5),
  riderOnlineGraceSeconds: intEnv('RIDER_ONLINE_GRACE_SECONDS', 90, 15),
  assignmentPollMs: intEnv('ASSIGNMENT_POLL_MS', 3000, 500),
  unassignedPollMs: intEnv('UNASSIGNED_POLL_MS', 10000, 1000),
  notificationPollMs: intEnv('NOTIFICATION_POLL_MS', 1000, 250),
  notificationMaxAttempts: intEnv('NOTIFICATION_MAX_ATTEMPTS', 6, 1),
  notificationLeaseSeconds: intEnv('NOTIFICATION_LEASE_SECONDS', 60, 10),
  workerBatchSize: intEnv('WORKER_BATCH_SIZE', 50, 1)
});
