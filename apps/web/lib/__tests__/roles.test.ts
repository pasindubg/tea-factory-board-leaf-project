import { describe, it, expect } from "vitest";
import { modulesForRole, roleHome, MODULES, ALL_WEB_ROLES } from "../roles";

describe("modulesForRole", () => {
  it("collector only has access to weighings", () => {
    const modules = modulesForRole("collector");
    expect(modules).toHaveLength(1);
    expect(modules[0].href).toBe("/dashboard/weighings");
  });

  it("owner sees every registered module", () => {
    const modules = modulesForRole("owner");
    expect(modules).toHaveLength(MODULES.length);
  });

  it("manager sees all modules except user management", () => {
    const hrefs = modulesForRole("manager").map((m) => m.href);
    expect(hrefs).not.toContain("/dashboard/users");
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/dashboard/weighings");
    expect(hrefs).toContain("/dashboard/suppliers");
    expect(hrefs).toContain("/dashboard/collectors");
  });

  it("every module declares an entitlement key", () => {
    MODULES.forEach((m) => {
      expect(m.entitlement).toBeTruthy();
    });
  });

  it("keeps physical dispatch creation inside Dispatch Overview", () => {
    expect(MODULES.some((module) => module.href === "/dashboard/auction/dispatches/new")).toBe(false);
    expect(MODULES.find((module) => module.key === "auction-dispatch-overview")?.roles)
      .toEqual(["owner", "manager", "accountant"]);
  });
});

describe("roleHome", () => {
  it("collector home is weighings page", () => {
    expect(roleHome("collector")).toBe("/dashboard/weighings");
  });

  it("owner home is main dashboard", () => {
    expect(roleHome("owner")).toBe("/dashboard");
  });

  it("manager home is main dashboard", () => {
    expect(roleHome("manager")).toBe("/dashboard");
  });

  it("collector home is accessible to collectors", () => {
    const home = roleHome("collector");
    const collectorModules = modulesForRole("collector").map((m) => m.href);
    expect(collectorModules).toContain(home);
  });
});
