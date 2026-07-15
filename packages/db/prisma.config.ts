import { defineConfig } from "prisma/config";

// Schema is used only for Prisma Client type generation.
// Runtime data access goes through the OrbitDB HTTP API (see src/prisma.ts).
export default defineConfig({
    schema: "./prisma/schema.prisma",
    datasource: {
        url: "postgresql://unused@localhost:5432/unused",
    },
});
