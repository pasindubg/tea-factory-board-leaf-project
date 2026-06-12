// tRPC routers land here in M6 (payments) and M5 (sync).
// Imports @tea/db to verify the workspace dependency graph builds in order.
import { weighings } from "@tea/db";

export const PACKAGE_NAME = "@tea/api";
export type WeighingsTable = typeof weighings;
