import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const factories = pgTable("factories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  registrationNumber: text("registration_number"),
  // Growing elevation of the estate, printed on the tea estate invoice. Most
  // bought-leaf factories are Low Grown, but a factory in the up-country hills
  // is not, so it stays a per-factory setting rather than a constant.
  elevation: text("elevation").default("Low Grown"),
  contactPhone: text("contact_phone"),
  logoPath: text("logo_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
