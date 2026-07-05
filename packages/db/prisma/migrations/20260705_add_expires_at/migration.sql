-- Migration: Add expiresAt for 24-hour self-destructing messages
-- Messages with expiresAt <= NOW() are candidates for server-side purge.

-- Message table
ALTER TABLE "Message" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "Message_expiresAt_idx" ON "Message"("expiresAt");

-- DirectMessage table
ALTER TABLE "DirectMessage" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "DirectMessage_expiresAt_idx" ON "DirectMessage"("expiresAt");
