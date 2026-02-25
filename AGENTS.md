# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Codex, Gemini CLI, GitHub Copilot, etc.) when working with code in this repository.

## Project Overview

Gitea Mirror is a self-hosted web application that mirrors repositories from GitHub to Gitea instances. Built with Astro (SSR), React, Bun runtime, and SQLite.

Key capabilities: mirror public/private/starred repos, metadata mirroring (issues, PRs as issues, labels, milestones, releases, wiki), Git LFS support, multiple auth methods (email/password, OIDC/SSO, header auth), scheduled syncing, auto-discovery of new repos.

## Quick Reference

| Task                      | Command                                                    |
|---------------------------|------------------------------------------------------------|
| Setup                     | `bun run setup`                                            |
| Dev server                | `bun run dev`                                              |
| Build                     | `bun run build`                                            |
| Start production          | `bun run start`                                            |
| Run all tests             | `bun test`                                                 |
| Run single test file      | `bun test src/lib/utils/encryption.test.ts`                |
| Run tests matching name   | `bun test --test-name-pattern "pattern"`                   |
| Test with coverage        | `bun test:coverage`                                        |
| DB migrations             | `bun run db:generate` then `bun run db:migrate`            |
| DB GUI                    | `bun run db:studio`                                        |
| Clean start               | `bun run dev:clean`                                        |
| Reset user password       | `bun run reset-password -- --email=user@example.com --new-password='pass'` |

## Tech Stack

| Layer          | Technology                                              |
|----------------|---------------------------------------------------------|
| Frontend       | Astro v5 (SSR) + React v19 + Shadcn UI + Tailwind CSS v4 |
| Backend        | Astro API routes (Node adapter, standalone)             |
| Runtime        | Bun (>=1.2.9)                                           |
| Database       | SQLite via Drizzle ORM                                  |
| Authentication | Better Auth (session-based)                             |
| APIs           | GitHub (Octokit + throttling), Gitea REST API           |

## Directory Structure

```
src/
├── components/     # React components (PascalCase .tsx)
│   └── ui/         # Shadcn UI components
├── pages/          # Astro pages and API routes
│   └── api/        # REST endpoints (auth, github, gitea, sync, job)
├── lib/            # Core business logic (kebab-case .ts)
│   ├── db/         # Drizzle ORM schema, migrations, adapter
│   ├── github.ts   # GitHub API client (Octokit)
│   ├── gitea.ts    # Gitea API client
│   ├── gitea-enhanced.ts  # Metadata mirroring (issues, PRs, releases)
│   ├── scheduler-service.ts  # Automatic mirroring scheduler
│   └── utils/      # Encryption, duration parsing, concurrency
├── types/          # TypeScript definitions
└── tests/          # Test utilities and setup
scripts/            # DB management, recovery scripts
```

## Architecture Patterns

### Token Encryption
All GitHub/Gitea tokens encrypted at rest (AES-256-GCM). Always use helpers:
```typescript
import { getDecryptedGitHubToken, getDecryptedGiteaToken } from '@/lib/utils/config-encryption';
```

### Mirror Job Flow
1. User triggers mirror via API → `createMirrorJob()` in `src/lib/helpers.ts`
2. Job status: "pending" → "mirroring" → "success"/"failed"
3. Real-time updates via SSE (`/api/sse`)

### Mirror Strategies
- `preserve` - Maintain GitHub org structure
- `single-org` - All repos into one Gitea org
- `flat-user` - All repos under user account
- `mixed` - Personal repos in one org, org repos preserve structure

### Metadata Mirroring
- Issues/PRs processed sequentially to maintain order (`src/lib/gitea-enhanced.ts`)
- PRs converted to issues (Gitea API limitation) with `[PR #number] [STATUS]` prefix
- Releases mirrored with assets

### Database Schema
Location: `src/lib/db/schema.ts` (Drizzle ORM + Zod validation)
Key tables: `configs`, `repositories`, `organizations`, `mirrorJobs`, `activities`

## Coding Conventions

### Naming
- Components: PascalCase `.tsx` in `src/components/`
- Modules/utils: kebab-case in `src/lib/`
- Variables/functions: camelCase

### Imports
Always use `@/` path alias:
```typescript
import { db } from '@/lib/db';
```

### Style
- 2 spaces indentation
- Follow existing semicolon/quote style
- Do not introduce new lint/format configs

### Commits
Short, imperative, scoped: `lib: fix token parsing`, `ui: align buttons`, `feat: add metadata option`

## Testing

- Runner: Bun's built-in test runner (configured in `bunfig.toml`)
- Setup: `src/tests/setup.bun.ts` (auto-loaded)
- Pattern: Tests colocated as `*.test.ts` alongside source
- Mock utilities: `src/tests/mock-fetch.ts`

## Development Workflows

### Adding a mirror option
1. Update Zod schema in `src/lib/db/schema.ts`
2. Update types in `src/types/config.ts`
3. Add UI control in settings component
4. Update API handler in `src/pages/api/config/`
5. Implement logic in `src/lib/gitea.ts` or `src/lib/gitea-enhanced.ts`

### Database changes
1. Update schema in `src/lib/db/schema.ts`
2. Generate: `bun run db:generate`
3. Review SQL in `drizzle/`
4. Apply: `bun run db:migrate` (or `db:push` for dev)

### Debugging mirror failures
1. Check jobs: `bun run db:studio` → `mirrorJobs` table
2. Review activity logs in Dashboard
3. Run diagnostics: `bun run test-recovery`

## Important Notes

- Respect rate limits (GitHub: 5000 req/hr authenticated)
- Duration parsing: Use `parseInterval()` from `src/lib/utils/duration-parser.ts` (supports "30m", "8h", "7d", cron)
- Graceful shutdown: Services implement cleanup handlers (`src/lib/shutdown-manager.ts`)
- Recovery: `src/lib/recovery.ts` handles interrupted jobs
