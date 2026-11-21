import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: "react-native-web" },
      { find: "@tea/ui/list-controller", replacement: fileURLToPath(new URL("../../../packages/ui/src/list-controller.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL(".", import.meta.url)) },
    ],
  },
  server: {
    port: 8081,
    proxy: { "/api/mobile": { target: process.env.MOBILE_DEV_API_ORIGIN ?? "http://127.0.0.1:3000", changeOrigin: true } },
  },
});
