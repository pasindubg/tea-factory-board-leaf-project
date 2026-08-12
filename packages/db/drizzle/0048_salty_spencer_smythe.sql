-- LOV integrity for auction_lots.grade, added WITHOUT the deploy being able to
-- fail on data that already exists.
--
-- Broker documents spell grades their own way ("PEKOE1" for a factory that
-- registered "PEK1"), so real lots carry codes their factory never defined.
-- Refusing to migrate until a human corrects them means one unexpected
-- spelling blocks a production release, which is not a trade this system can
-- make. Instead every such code is registered up front as an INACTIVE grade:
-- the row keeps its original meaning, the constraint below can be created for
-- certain, and because it is inactive it never appears in a picker for new
-- entry — an owner can rename, merge, or activate it afterwards at leisure.
INSERT INTO "auction_grades" ("factory_id", "code", "name", "active", "sort_order")
SELECT DISTINCT l."factory_id", l."grade", l."grade", false, 999
FROM "auction_lots" l
WHERE l."grade" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "auction_grades" g
    WHERE g."factory_id" = l."factory_id" AND g."code" = l."grade"
  )
ON CONFLICT DO NOTHING;

-- Dropped first so re-running this file is harmless.
ALTER TABLE "auction_lots" DROP CONSTRAINT IF EXISTS "fk_auction_lots_grade";
ALTER TABLE "auction_lots" ADD CONSTRAINT "fk_auction_lots_grade" FOREIGN KEY ("factory_id","grade") REFERENCES "public"."auction_grades"("factory_id","code") ON DELETE no action ON UPDATE cascade;
