import { describe, expect, it } from "vitest";
import { buildHash, documentTitle, guardRoute, homeFor, isRoute, parseHash, ROUTES, routeRole, type Route } from "./router";

describe("parseHash", () => {
  it("maps empty and root hashes to the welcome page", () => {
    for (const h of ["", "#", "#/"]) expect(parseHash(h)).toMatchObject({ path: "/", known: true });
  });

  it("parses path and query params", () => {
    const r = parseHash("#/c/overview?tour=1&x=a%20b");
    expect(r.path).toBe("/c/overview");
    expect(r.params.get("tour")).toBe("1");
    expect(r.params.get("x")).toBe("a b");
    expect(r.known).toBe(true);
  });

  it("tolerates a missing leading slash and a trailing slash", () => {
    expect(parseHash("#c/meds").path).toBe("/c/meds");
    expect(parseHash("#/c/meds/").path).toBe("/c/meds");
  });

  it("maps unknown paths (and in-page anchors) to the welcome page, flagged unknown", () => {
    expect(parseHash("#/nope")).toMatchObject({ path: "/", known: false });
    expect(parseHash("#main-content")).toMatchObject({ path: "/", known: false });
  });

  it("knows every SPEC §10 route plus the design-system gallery", () => {
    const expected: Route[] = [
      "/",
      "/how-it-works",
      "/p/today",
      "/p/week",
      "/p/meds",
      "/c/overview",
      "/c/meds",
      "/c/review",
      "/c/timeline",
      "/c/ask",
      "/c/brief",
      "/c/settings",
      "/dev/ui",
    ];
    expect(Object.keys(ROUTES).sort()).toEqual([...expected].sort());
    for (const r of expected) expect(isRoute(r)).toBe(true);
  });
});

describe("buildHash", () => {
  it("round-trips through parseHash", () => {
    const h = buildHash("/c/overview", { tour: "1", empty: "", missing: undefined });
    expect(h).toBe("#/c/overview?tour=1");
    expect(parseHash(h).params.get("tour")).toBe("1");
  });

  it("encodes values safely", () => {
    const h = buildHash("/c/ask", { q: "dizzy & tired?" });
    expect(parseHash(h).params.get("q")).toBe("dizzy & tired?");
  });

  it("omits the query string when there are no params", () => {
    expect(buildHash("/p/today")).toBe("#/p/today");
  });
});

describe("role guards", () => {
  it("lets anyone see public routes", () => {
    for (const role of [null, "patient", "caregiver"] as const) {
      expect(guardRoute("/", role)).toBeNull();
      expect(guardRoute("/how-it-works", role)).toBeNull();
      expect(guardRoute("/dev/ui", role)).toBeNull();
    }
  });

  it("requires the matching role for patient and caregiver areas", () => {
    expect(guardRoute("/p/today", "patient")).toBeNull();
    expect(guardRoute("/p/today", "caregiver")).toBe("/");
    expect(guardRoute("/p/today", null)).toBe("/");
    expect(guardRoute("/c/brief", "caregiver")).toBeNull();
    expect(guardRoute("/c/brief", "patient")).toBe("/");
    expect(guardRoute("/c/brief", null)).toBe("/");
  });

  it("route prefixes match their roles", () => {
    for (const r of Object.keys(ROUTES) as Route[]) {
      if (r.startsWith("/p/")) expect(routeRole(r)).toBe("patient");
      else if (r.startsWith("/c/")) expect(routeRole(r)).toBe("caregiver");
      else expect(routeRole(r)).toBeNull();
    }
  });

  it("sends each role to its home page", () => {
    expect(homeFor("patient")).toBe("/p/today");
    expect(homeFor("caregiver")).toBe("/c/overview");
  });
});

describe("documentTitle", () => {
  it("names the page and the product", () => {
    expect(documentTitle("/c/review")).toBe("Medication review · Kinwise");
    expect(documentTitle("/")).toContain("Kinwise");
  });
});
