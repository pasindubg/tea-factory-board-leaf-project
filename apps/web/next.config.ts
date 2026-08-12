import type { NextConfig } from "next";
import { getSupabasePublicEnv } from "./lib/env";

function readSupabaseStorageUrl() {
  try {
    return getSupabasePublicEnv().url;
  } catch {
    return undefined;
  }
}

const supabaseStorageUrl = readSupabaseStorageUrl();

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
