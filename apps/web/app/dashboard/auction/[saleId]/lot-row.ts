import type { AuctionDispatchLotListRow } from "@/lib/list-resources";

// The list resource contract is the canonical row definition shared by the
// initial server render and every component-local soft reload.
export type LotRow = AuctionDispatchLotListRow;
