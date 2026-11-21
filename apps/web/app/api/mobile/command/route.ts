import { mobileBoundary } from "@/lib/mobile-app";
import { runMobileCommand } from "@/lib/mobile-command";

export async function POST(request: Request) {
  return mobileBoundary(async () => runMobileCommand(request, await request.json().catch(() => null)));
}
