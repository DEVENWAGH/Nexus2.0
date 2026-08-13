# Nexus — Agent instructions

Cursor reads this file automatically (project root `AGENTS.md`). Skills live in `.agents/skills/` (also loaded by Cursor). Prefer skills for multi-step workflows; keep this file for always-on project context.

## Always apply

- Follow **DESIGN.md** for UI/visual language (colors, type, layout mood).
- Use these project skills when the task matches:
  - `nextjs` — App Router, Server Components, routes, data fetching, proxy
  - `tailwind-4-docs` — Tailwind CSS v4
  - `web-design-guidelines` — UI/UX and accessibility review
  - `framer-motion-animator` — motion / micro-interactions (`motion` package)
  - `gsap-framer-scroll-animation` — scroll-driven animation
  - `tanstack-query-best-practices` — React Query / server state

## Stack notes

- Monorepo: `apps/web` (Next.js 16), `apps/node-api`, `apps/signaling-server`, `packages/*`
- Web auth uses session cookie `__session` via `proxy.ts` / Hono JWT auth (Clerk auth has been removed).
- Voice & Video conferencing uses native WebRTC P2P mesh via signaling server (LiveKit has been removed).
- File storage uses Pinata IPFS & ephemeral P2P DataChannels (UploadThing has been removed).
- Database uses OrbitDB at runtime via Prisma HTTP proxy in `packages/db/src/prisma.ts` (PostgreSQL is only used for schema structure definitions, NOT as a direct database engine).
- Design source of truth: `DESIGN.md` (not `DESION.md`)
