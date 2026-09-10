/**
 * Vitest configuration.
 *
 * Tests run in the Node environment: the logic worth testing here is pure (the access gate now,
 * the interview reducer later), and none of it touches the DOM. A jsdom environment gets added
 * when there is a component actually worth rendering in a test.
 */

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
