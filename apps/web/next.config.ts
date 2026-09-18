import type { NextConfig } from "next";
const neonStorageUrl = process.env.AWS_ENDPOINT_URL_S3;

const nextConfig: NextConfig = {
  // @tea/api is an internal TS package consumed from source (the payment engine).
  transpilePackages: ["@tea/api"],
  serverExternalPackages: ["postgres"],
  images: {
    remotePatterns: [
      ...(neonStorageUrl ? [new URL("/**", neonStorageUrl)] : []),
    ],
  },
};

export default nextConfig;
