import { loadMobileRegistrationResource } from "@/lib/list-resource-registry";

export async function POST(request: Request) {
  return loadMobileRegistrationResource(request, await request.json().catch(() => null));
}
