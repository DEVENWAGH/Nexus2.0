import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// Load monorepo root .env before reading environment variables.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const ORBITDB_API_URL = process.env.ORBITDB_API_URL || "http://localhost:3005";

function createPrismaProxy() {
  const handler = {
    get(target: any, prop: string) {
      if (prop === '$transaction') {
        return async (arg: any) => {
          if (typeof arg === 'function') {
            return await arg(prisma);
          }
          const results = [];
          for (const p of arg) {
            results.push(await p);
          }
          return results;
        };
      }
      
      if (prop.startsWith('$')) {
        return () => Promise.resolve();
      }

      // Return a model-specific proxy (e.g. for prisma.profile)
      return new Proxy({}, {
        get(modelTarget: any, action: string) {
          return async (args: any) => {
            const res = await fetch(`${ORBITDB_API_URL}/query`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: prop, action, args })
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`OrbitDB error: ${text}`);
            }
            const payload = await res.json();
            return payload.data;
          };
        }
      });
    }
  };

  return new Proxy({}, handler);
}

export const prisma = createPrismaProxy() as unknown as PrismaClient;
