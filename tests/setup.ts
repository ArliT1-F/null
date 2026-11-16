/**
 * Test environment bootstrap.
 *
 * The env module validates configuration at import time, so tests get a
 * deterministic, clearly-fake configuration rather than depending on a local
 * .env file.
 */
// NODE_ENV is read-only in the type system but writable at runtime.
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://null:null@localhost:5432/null_test";
process.env.AUTH_SECRET ??= "test-auth-secret-value-that-is-long-enough-1234";
process.env.APP_ENCRYPTION_KEY ??= "dGVzdC1rZXktZm9yLXZpdGVzdC0zMi1ieXRlcw==";
process.env.MEDIA_ROOT ??= "/tmp/null-test-media";
process.env.MAIL_DRIVER ??= "console";
