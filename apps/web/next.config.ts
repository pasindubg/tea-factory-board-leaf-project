import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @tea/api is an internal TS package consumed from source (the payment engine).
  transpilePackages: ["@tea/api"],
};

export default nextConfig;
