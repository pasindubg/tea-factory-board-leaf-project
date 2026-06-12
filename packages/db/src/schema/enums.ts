import { pgEnum } from "drizzle-orm/pg-core";

// Sri Lankan made-tea grades + GREEN_LEAF for raw intake
export const teaGrade = pgEnum("tea_grade", [
  "BOP",
  "BOPF",
  "OP",
  "OPA",
  "FBOP",
  "FNGS",
  "DUST",
  "PD",
  "GREEN_LEAF",
]);
