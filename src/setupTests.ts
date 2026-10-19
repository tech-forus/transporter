// The vitest-specific entry point registers matchers against vitest's own
// `expect` — the plain '@testing-library/jest-dom' import assumes a Jest-style
// global `expect`, which doesn't exist here since test.globals isn't enabled.
import '@testing-library/jest-dom/vitest';
