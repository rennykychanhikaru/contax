# Repository Guidelines
ALWAYS EXPLAIN WHAT YOU ARE GOING TO DO, THEN ASK FOR PERMISSIONS, THEN DO IT.

## Project Structure & Module Organization
- Root: Nx monorepo with shared config (`nx.json`, `tsconfig.base.json`, `.eslintrc.json`, `.prettierrc`).
- Packages: source lives under `packages/`.
  - `packages/data-loader/supabase/{core,nextjs,remix}`: Data Loader SDKs.
  - `packages/qstash`: QStash task queue utilities.
  - `packages/test-utils`: shared testing helpers.
- Local services: `supabase/` for local dev and type generation.

## Build, Test, and Development Commands
- `npm run build`: Nx build for all packages.
- `npm run test`: Run all unit tests across packages.
- `npm run lint`: Lint all packages.
- `npm run typecheck`: TypeScript checks across the monorepo.
- `npm run format`: Apply Prettier formatting.
- `npm run healthcheck`: Run typecheck, lint, and tests.
- Supabase: `npm run supabase:start | stop | reset`, and `npm run typegen` to regenerate `supabase/database.types.ts`.
- Nx targeting: `npx nx run <project>:<target>` (e.g., `npx nx run qstash:test`).

## Coding Style & Naming Conventions
- Language: TypeScript, 2-space indentation, semicolons enabled.
- Formatting: Prettier (imports sorted via `prettier-plugin-sort-imports`).
- Linting: ESLint with TypeScript and React plugins; fix with `npm run lint -- --fix`.
- Naming: packages use kebab-case; files use kebab-case; React components and types use PascalCase; variables/functions use camelCase.

## Testing Guidelines
- Frameworks: Vitest (`vitest`, `@testing-library/react`), Playwright for browser/e2e where applicable.
- Location: co-locate unit tests as `*.spec.ts`/`*.test.tsx` near sources; e2e tests live in each package or a dedicated folder.
- Run: `npm test` or `npx nx test <project>`. Aim for meaningful coverage on core logic.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits (e.g., `feat: add qstash retry policy`, `fix(data-loader): handle 401 errors`).
- PRs: include a clear description, linked issues, and screenshots for UI changes. Note breaking changes in the PR body.
- Quality gates: ensure `npm run healthcheck` passes and code is formatted before requesting review.

## Security & Configuration Tips
- Do not commit secrets. Use `.env` for local only.
- For schema changes, run Supabase locally and update types with `npm run typegen`.
