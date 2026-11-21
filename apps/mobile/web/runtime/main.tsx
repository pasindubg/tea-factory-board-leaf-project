import type { ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { SessionProvider, useSession } from "@/lib/session";
import Login from "@/app/login";
import Driver from "@/app/(driver)/home";
import Lines from "@/app/(field)/lines";
import Customers from "@/app/(field)/line/[id]/index";
import Supplier from "@/app/(supplier)/home";
import NewRequest from "@/app/(supplier)/new-request";
import Requests from "@/app/(supplier)/requests";
import Messages from "@/app/(supplier)/messages";
import Collector from "@/app/(app)/home";
import Weigh from "@/app/(app)/weigh";
import Records from "@/app/(app)/records";
import { Redirect, useRoute, useRouter } from "./navigation";
import { NetworkBoundary } from "./network";
import "./shell.css";

const routes: Record<string, { screen: ComponentType; label?: string }> = {
  "/(driver)/home": { screen: Driver },
  "/(field)/lines": { screen: Lines },
  "/(field)/line": { screen: Customers, label: "Customers" },
  "/(supplier)/home": { screen: Supplier },
  "/(supplier)/new-request": { screen: NewRequest, label: "New request" },
  "/(supplier)/requests": { screen: Requests, label: "My requests" },
  "/(supplier)/messages": { screen: Messages, label: "Messages" },
  "/(app)/home": { screen: Collector },
  "/(app)/weigh": { screen: Weigh },
  "/(app)/records": { screen: Records },
};

function FieldApp() {
  const route = useRoute();
  const router = useRouter();
  const { loading, profile, collector, error, signOut, reloadProfile } = useSession();
  if (loading) return <div className="notice" role="status">Signing in…</div>;
  if (error) return (
    <div className="notice" role="alert">
      <p>{error}</p>
      <button onClick={() => void reloadProfile()}>Try again</button>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
  if (!profile) return route === "/login" ? <Login /> : <Redirect href="/login" />;
  const area = { driver: "driver", field_officer: "field", supplier: "supplier", collector: "app" }[profile.role as string];
  if (!area || (area === "app" && !collector)) {
    return <div className="notice"><p>This account is not set up for the field app.</p><button onClick={() => void signOut()}>Sign out</button></div>;
  }
  const home = `/(${area})/${area === "field" ? "lines" : "home"}`;
  const path = route.split("?")[0];
  const inField = path.startsWith("/(field)/");
  if (!path.startsWith(`/(${area})/`) && !(area === "driver" && inField)) return <Redirect href={home} />;
  const line = /^\/\(field\)\/line\/[a-f0-9-]+(?:\/new)?$/i.test(path);
  if (line && path.endsWith("/new")) {
    const params = new URLSearchParams(route.split("?")[1]);
    params.set("register", "1");
    return <Redirect href={`${path.slice(0, -4)}?${params}`} />;
  }
  const match = routes[line ? "/(field)/line" : path];
  if (!match) return <Redirect href={home} />;
  const Screen = match.screen;
  return (
    <>
      {match.label && <header className="mobile-bar">
        <button onClick={() => router.replace(line ? "/(field)/lines" : home)} aria-label="Back">‹</button>
        <strong>{match.label}</strong>
      </header>}
      <main className="mobile-content"><Screen key={path} /></main>
      {area === "app" && <nav className="mobile-bar" aria-label="Collector">
        <button onClick={() => router.push("/(app)/home")}>Home</button>
        <button onClick={() => router.push("/(app)/weigh")}>Weigh</button>
        <button onClick={() => router.push("/(app)/records")}>Today</button>
      </nav>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <NetworkBoundary><SessionProvider><FieldApp /></SessionProvider></NetworkBoundary>,
);
