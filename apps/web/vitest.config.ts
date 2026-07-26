import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    // `server-only` throws on import outside a Server Component. Stub it so
    // server-side modules stay unit-testable; it guards runtime bundling, and
    // Next.js still enforces it during a real build.
    alias: { "server-only": new URL("./lib/__tests__/server-only-stub.ts", import.meta.url).pathname },
  },
});
