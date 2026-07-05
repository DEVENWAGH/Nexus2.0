import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Load monorepo root .env before reading DATABASE_URL. Static imports run before
// app-level dotenv, so "dotenv/config" alone misses ../../.env from node-api.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error(
        "DATABASE_URL is not set. Add it to strikes-community/.env.",
    );
}

const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
