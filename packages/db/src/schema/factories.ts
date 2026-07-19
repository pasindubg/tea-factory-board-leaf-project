import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const factories = pgTable("factories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  registrationNumber: text("registration_number"),
  contactPhone: text("contact_phone"),
  logoPath: text("logo_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
