import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  async rewrites() {
    return [{ source: "/", destination: "/field/index.html" }];
  },
  async headers() {
    const screenHeaders = [
      { key: "Cache-Control", value: "no-store" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'" },
    ];
    return [
      { source: "/", headers: screenHeaders },
      { source: "/field/index.html", headers: screenHeaders },
      { source: "/api/mobile/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  transpilePackages: ["@tea/api"],
  serverExternalPackages: ["postgres"],
};

export default config;
