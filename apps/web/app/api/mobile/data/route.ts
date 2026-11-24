import { mobileBoundary } from "@/lib/mobile-app";
import { loadMobileAppResource } from "@/lib/mobile-resource-registry";

export async function POST(request: Request) {
  return mobileBoundary(async () => loadMobileAppResource(request, await request.json().catch(() => null)));
}
