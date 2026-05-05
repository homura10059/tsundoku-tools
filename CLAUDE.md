# CLAUDE.md

@AGENTS.md

## Development Philosophy

**IMPORTANT — TDD (t-wada style)**: NEVER write implementation code without a failing test first. Follow the strict Red → Green → Refactor cycle:

1. **Red**: Write a failing test that describes the desired behavior
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Clean up while keeping all tests green
