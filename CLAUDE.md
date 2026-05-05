# CLAUDE.md

@AGENTS.md

## Development Philosophy

**IMPORTANT — TDD (t-wada style)**: NEVER write implementation code without a failing test first. Follow the strict Red → Green → Refactor cycle:

1. **Red**: Write a failing test that describes the desired behavior
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Clean up while keeping all tests green

**IMPORTANT — Doc sync**: When making design-level changes (schema, architecture, data flow, auth, env vars, package deps, scraper method), ALWAYS update the relevant `docs/` files in the same commit. Changes that affect `AGENTS.md`'s Key Constraints or Architecture sections must update `AGENTS.md` too.
