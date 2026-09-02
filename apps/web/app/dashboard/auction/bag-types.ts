// The F/H/B column of the printed TEA ESTATE INVOICE: how the tea was packed.
export const BAG_TYPES = ["Full Bag", "Half Bag", "Bulk"] as const;

export type BagType = (typeof BAG_TYPES)[number];
