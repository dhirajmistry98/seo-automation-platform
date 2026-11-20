import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.05,
  debug: false,
  enabled: process.env.NODE_ENV === "production" && Boolean(process.env.SENTRY_DSN),
});
