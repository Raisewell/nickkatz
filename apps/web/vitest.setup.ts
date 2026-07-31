import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without `globals: true` in vitest.config.ts, @testing-library/react's own auto-cleanup
// (which relies on detecting a global afterEach) never registers, so DOM from one test
// leaks into the next within the same file - harmless for the single existing test today,
// but breaks any multi-test component file with a "multiple elements found" error the
// moment a second test queries the same role/text.
afterEach(() => cleanup());
