import { boolean, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { factories } from "./factories";
import { users } from "./users";

/**
 * Private, self-managed staff details.
 *
 * Keeping these fields separate from `users` prevents the factory-wide account
 * directory policy from exposing identity and employment data. RLS on this
 * table owns the self-edit and opt-in coworker visibility rules.
 */
export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    factoryId: uuid("factory_id")
      .references(() => factories.id)
      .notNull(),
    fullName: text("full_name").notNull(),
    nationalIdNumber: text("national_id_number"),
    dateOfBirth: date("date_of_birth"),
    address: text("address"),
    phone: text("phone"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    employeeNumber: text("employee_number"),
    jobTitle: text("job_title"),
    department: text("department"),
    employmentType: text("employment_type"),
    employmentStartDate: date("employment_start_date"),
    qualifications: text("qualifications"),
    notes: text("notes"),
    visibleToColleagues: boolean("visible_to_colleagues").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_user_profiles_factory").on(t.factoryId),
    index("idx_user_profiles_visible").on(t.factoryId, t.visibleToColleagues),
  ],
);
