import { mobileBootstrap, mobileBoundary } from "@/lib/mobile-app";

export async function POST(request: Request) {
  return mobileBoundary(() => mobileBootstrap(request));
}
