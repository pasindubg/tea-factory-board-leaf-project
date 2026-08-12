import { describe, expect, it } from "vitest";
import { friendlyError, friendlyDeleteError } from "@/lib/errors";

/**
 * These lock in the LOV contract: a value that isn't in the referenced table
 * must come back naming what was typed and what it should have been, so the
 * user can act on it. The payloads below are copied verbatim from PostgREST
 * against the local stack — parsing them is the whole mechanism, so a change
 * in wording that breaks the parse has to fail here rather than in the UI.
 */
describe("friendlyError", () => {
  it("names the value and entity for a composite foreign-key violation", () => {
    const message = friendlyError({
      code: "23503",
      message: `insert or update on table "auction_lots" violates foreign key constraint "fk_auction_lots_grade"`,
      details: `Key (factory_id, grade)=(aaaaaaaa-0000-0000-0000-000000000001, BOPFX) is not present in table "auction_grades".`,
    });
    expect(message).toContain("BOPFX");
    expect(message).toContain("tea grade");
    // The tenant column is never the field the user typed into.
    expect(message).not.toContain("aaaaaaaa");
  });

  it("still names the entity when Postgres redacts the key", () => {
    // THIS is the payload the app actually receives: it connects as
    // `authenticated`, and Postgres withholds the column and value from a role
    // without privileges on the referenced table. Verified against the local
    // stack with the publishable key and a real user JWT.
    const message = friendlyError({
      code: "23503",
      message: `insert or update on table "auction_lots" violates foreign key constraint "fk_auction_lots_grade"`,
      details: `Key is not present in table "auction_grades".`,
    });
    expect(message).toContain("tea grade");
    expect(message).not.toBe("A referenced record was not found. Refresh and try again.");
  });

  it("names the value when free text fails to cast to an id", () => {
    const message = friendlyError({
      code: "22P02",
      message: `invalid input syntax for type uuid: "iokl"`,
      details: null,
    });
    expect(message).toContain("iokl");
    // Never leak the column type or the driver's phrasing.
    expect(message).not.toContain("uuid");
  });

  it("falls back without leaking details when a violation cannot be parsed", () => {
    const message = friendlyError({ code: "23503", message: "some unrecognised form", details: null });
    expect(message).toBe("A referenced record was not found. Refresh and try again.");
  });

  it("does not leak raw driver text for an unmapped error", () => {
    const message = friendlyError({ code: "XX000", message: "relation secret_table does not exist" });
    expect(message).not.toContain("secret_table");
  });
});

describe("friendlyDeleteError", () => {
  it("reports the dependent record type rather than the missing-reference wording", () => {
    const message = friendlyDeleteError({
      code: "23503",
      message: `update or delete on table "auction_grades" violates foreign key constraint "fk_auction_lots_grade" on table "auction_lots"`,
      details: `Key (factory_id, code)=(aaaaaaaa-0000-0000-0000-000000000001, BOPF) is still referenced from table "auction_lots".`,
    });
    expect(message).toContain("auction lots");
    expect(message).toContain("cannot be deleted");
  });
});
