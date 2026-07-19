# Repository Guidelines

## Project Structure & Module Organization

Cadence is a Tauri 2 application with a React/TypeScript frontend and Rust backend.

- `src/app.tsx`, `src/main.tsx`, and `src/app.css`: application entry, window routing, and app-level styles.
- `src/components/`: reusable, presentation-only base components such as `button`, `input`, and `badge`. These components must not depend on task, recognition, or settings domain data.
- `src/biz-components/`: domain UI such as `task-item`, `settings-window`, `screenshot-selection-window`, and recognition-related components.
- `src/lib/`: non-UI shared code. `api.ts` wraps the Tauri/browser bridge, `types.ts` owns shared contracts, `utils.ts` holds generic helpers, and `task-groups.ts` contains pure task grouping logic.
- `src-tauri/src/`: Rust application code. `db.rs` owns SQLite persistence, `parser.rs` provides local fallback parsing, and `integrations.rs` contains AI, screenshot, and Feishu integrations.
- `src-tauri/capabilities/` and `src-tauri/tauri.conf.json`: permissions, windows, and bundle configuration.
- Tests are colocated with their code: `*.test.ts(x)` for frontend tests and `#[cfg(test)]` modules for Rust.
- Generated output (`dist/`, `src-tauri/target/`) must not be committed.

## Build, Test, and Development Commands

- `pnpm install`: install JavaScript dependencies.
- `pnpm dev`: run the browser-only Vite preview.
- `pnpm tauri dev`: run the complete desktop application.
- `pnpm test`: run Vitest once; use `pnpm test:watch` while developing.
- `pnpm build`: type-check with TypeScript 7 and build the frontend.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: verify Rust formatting.
- `pnpm tauri build --debug --no-bundle`: validate the complete Tauri build quickly.

## Coding Style & Naming Conventions

TypeScript uses strict mode, two-space indentation, double quotes, and semicolons. Name React components and exported types in `PascalCase`; use `camelCase` for functions, variables, and serialized fields. Use kebab-case for React source, style, and test filenames, for example `task-item.tsx` and `screenshot-selection-window.test.tsx`. Keep framework-conventional names such as `main.tsx` and `vite-env.d.ts` unchanged.

Keep base UI in `components/`, business UI in `biz-components/`, and non-rendering code in `lib/`. Keep Tauri commands and Rust functions in `snake_case`. Format Rust with `cargo fmt`.

## Testing Guidelines

Use Vitest with Testing Library for user-visible behavior. Name tests with kebab-case filenames, such as `task-item.test.tsx`. Add Rust unit tests beside parsers, database logic, integration payload builders, and coordinate/format conversion helpers. There is no coverage threshold; every bug fix should include a regression test. Tests must not require live credentials.

## Commit & Pull Request Guidelines

The repository has no commit history, so use Conventional Commit messages such as `feat: add tray settings window` or `fix: restore reminders on reopen`. Keep commits focused. Pull requests should explain behavior changes, list verification commands, link issues, and include screenshots or recordings for UI changes. Call out database, permission, or configuration changes.

## Security & Configuration Tips

Never commit API keys, App Secrets, OAuth tokens, local databases, or screenshots containing private data. Model service addresses and model names are stored in the local SQLite settings database; API keys, Feishu App Secrets, and OAuth tokens are stored in the system keychain. Do not print or commit any secret values. Treat changes to CSP, Tauri capabilities, OAuth scopes, and external network endpoints as security-sensitive and justify them in the pull request.
