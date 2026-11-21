import { mobileBindDevice, mobileBoundary } from "@/lib/mobile-app";

export async function POST(request: Request) {
  return mobileBoundary(async () => mobileBindDevice(request, await request.json().catch(() => null)));
}
