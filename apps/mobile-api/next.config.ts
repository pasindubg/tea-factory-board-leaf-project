import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@tea/api"],
  serverExternalPackages: ["postgres"],
};

export default config;
