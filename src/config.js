import { resolve } from 'node:path';

function booleanFromEnv(value, fallback) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(overrides = {}) {
  const port = positiveInteger(overrides.port ?? process.env.PORT, 3000);
  const sessionTtlHours = positiveInteger(
    overrides.sessionTtlHours ?? process.env.SESSION_TTL_HOURS,
    24 * 7,
  );

  return {
    port,
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    databasePath: overrides.databasePath
      ?? process.env.DATABASE_PATH
      ?? resolve(process.cwd(), 'data', 'saldo-real.db'),
    appOrigin: overrides.appOrigin ?? process.env.APP_ORIGIN ?? `http://localhost:${port}`,
    sessionTtlHours,
    cookieSecure: overrides.cookieSecure
      ?? booleanFromEnv(process.env.COOKIE_SECURE, false),
    demoMode: overrides.demoMode ?? booleanFromEnv(process.env.DEMO_MODE, false),
    outboundDataEnabled: overrides.outboundDataEnabled
      ?? booleanFromEnv(process.env.OUTBOUND_DATA_ENABLED, true),
  };
}
