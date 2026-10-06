CREATE TABLE IF NOT EXISTS "meta_oauth_states" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "Provider" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meta_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "meta_oauth_states_stateHash_key" ON "meta_oauth_states"("stateHash");
CREATE INDEX IF NOT EXISTS "meta_oauth_states_userId_expiresAt_idx" ON "meta_oauth_states"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "meta_oauth_states_expiresAt_idx" ON "meta_oauth_states"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "meta_oauth_states" ADD CONSTRAINT "meta_oauth_states_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
