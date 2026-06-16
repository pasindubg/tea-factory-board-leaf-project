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

  it("returned modules are a subset of MODULES", () => {
    const allHrefs = MODULES.map((m) => m.href);
    ALL_WEB_ROLES.forEach((role) => {
      modulesForRole(role).forEach((m) => {
        expect(allHrefs).toContain(m.href);
      });
    });
  });

  it("every module declares an entitlement key", () => {
    MODULES.forEach((m) => {
      expect(m.entitlement).toBeTruthy();
    });
  });

  it("every module has at least one allowed role", () => {
    MODULES.forEach((m) => {
      expect(m.roles.length).toBeGreaterThan(0);
    });
  });

  it("owner sees at least as many modules as manager", () => {
    expect(modulesForRole("owner").length).toBeGreaterThanOrEqual(
      modulesForRole("manager").length,
    );
  });

  it("manager sees at least as many modules as collector", () => {
    expect(modulesForRole("manager").length).toBeGreaterThanOrEqual(
      modulesForRole("collector").length,
    );
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

  it("all role homes start with /dashboard", () => {
    ALL_WEB_ROLES.forEach((role) => {
      expect(roleHome(role)).toMatch(/^\/dashboard/);
    });
  });

  it("collector home is accessible to collectors", () => {
    const home = roleHome("collector");
    const collectorModules = modulesForRole("collector").map((m) => m.href);
    expect(collectorModules).toContain(home);
  });
});
