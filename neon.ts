import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    buckets: {
      "factory-branding": { access: "private" },
      "auction-documents": { access: "private" },
      "supplier-documents": { access: "private" },
    },
  },
});
