import type { NextConfig } from "next";

const supabaseStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  // @tea/api is an internal TS package consumed from source (the payment engine).
  transpilePackages: ["@tea/api"],
  images: {
    remotePatterns: supabaseStorageUrl
      ? [new URL("/storage/v1/object/sign/**", supabaseStorageUrl)]
      : [],
  },
};

export default nextConfig;
