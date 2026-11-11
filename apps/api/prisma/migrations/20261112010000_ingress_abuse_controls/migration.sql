BEGIN;
CREATE TABLE "AbuseBucket" (
  key TEXT PRIMARY KEY CHECK (key ~ '^(api|login|callback):[a-f0-9]{5}$' OR key = 'login:global'),
  hits INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "AbuseBucket_expiresAt_idx" ON "AbuseBucket" ("expiresAt");
CREATE TABLE "AbuseKey" (id TEXT PRIMARY KEY, secret TEXT NOT NULL);
INSERT INTO "AbuseKey" (id, secret) VALUES ('ingress', uuid_generate_v4()::text);
CREATE TABLE "OidcLoginFlow" (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "previousDigest" TEXT
);
CREATE INDEX "OidcLoginFlow_expiresAt_idx" ON "OidcLoginFlow" ("expiresAt");
COMMIT;
