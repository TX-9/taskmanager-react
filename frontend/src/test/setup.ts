// Extends vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.)
// across every test file — deferred here from Chunk 7 until this suite
// (Chunk 25) actually needed it. React Testing Library auto-registers its
// cleanup via `afterEach` since vite.config.ts's `test.globals: true`
// exposes one globally.

import "@testing-library/jest-dom";
