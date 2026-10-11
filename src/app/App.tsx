// Root component: providers, role guard, shell selection and lazily loaded views.
//
//   main.tsx → <StoreProvider> → <App>
//                                  ├─ ToastProvider, HelpProvider (app-wide services)
//                                  └─ Routes: "/" Welcome · public pages · PatientShell · CaregiverShell
//
// Views are code-split per route so the welcome page loads fast and heavy modules (charts, the
// on-device language model) only download when their screen is opened.
import { lazy, useEffect, type ComponentType, type LazyExoticComponent } from "react";
import { ToastProvider } from "../ui";
import { HelpProvider } from "./Help";
import { TourHost } from "./Tour";
import { guardRoute, navigate, routeRole, useNavigationEffects, useRoute, type Route } from "./router";
import { useSession } from "./session";
import { CaregiverShell } from "./layouts/CaregiverShell";
import { PatientShell } from "./layouts/PatientShell";
import { PublicShell } from "./layouts/PublicShell";
import { ViewBoundary } from "./layouts/ViewBoundary";
import { useDocumentSettings } from "./layouts/useDocumentSettings";
import { Welcome } from "../views/public/Welcome";

/** lazy() for named exports: lazyNamed(() => import("./X"), "X"). */
function lazyNamed<M extends Record<string, unknown>, K extends keyof M & string>(
  load: () => Promise<M>,
  name: K,
): LazyExoticComponent<ComponentType> {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const VIEWS: Partial<Record<Route, LazyExoticComponent<ComponentType>>> = {
  "/how-it-works": lazyNamed(() => import("../views/public/HowItWorks"), "HowItWorks"),
  "/p/today": lazyNamed(() => import("../views/patient/Today"), "Today"),
  "/p/week": lazyNamed(() => import("../views/patient/MyWeek"), "MyWeek"),
  "/p/meds": lazyNamed(() => import("../views/patient/MyMedicines"), "MyMedicines"),
  "/c/overview": lazyNamed(() => import("../views/caregiver/Overview"), "Overview"),
  "/c/meds": lazyNamed(() => import("../views/caregiver/Medications"), "Medications"),
  "/c/review": lazyNamed(() => import("../views/caregiver/Review"), "Review"),
  "/c/timeline": lazyNamed(() => import("../views/caregiver/Timeline"), "Timeline"),
  "/c/ask": lazyNamed(() => import("../views/caregiver/Ask"), "Ask"),
  "/c/brief": lazyNamed(() => import("../views/caregiver/VisitBrief"), "VisitBrief"),
  "/c/settings": lazyNamed(() => import("../views/caregiver/Settings"), "Settings"),
  "/dev/ui": lazyNamed(() => import("../ui/Gallery"), "Gallery"),
};

function Routes() {
  useDocumentSettings();
  const role = useSession();
  const { path } = useRoute();
  const redirect = guardRoute(path, role);
  useNavigationEffects(redirect ?? path);

  // Role guard: signed-out (or wrong-role) visits to a protected page land on Welcome, which remembers
  // where they were going (?next=) and continues there after choosing the matching view.
  useEffect(() => {
    if (!redirect) return;
    const next = routeRole(path) && routeRole(path) !== role ? path : undefined;
    navigate(redirect, next ? { next } : undefined, { replace: true });
  }, [redirect, path, role]);

  if (redirect) return null;
  if (path === "/") return <Welcome />;

  const View = VIEWS[path];
  const content = View ? (
    <ViewBoundary key={path}>
      <View />
    </ViewBoundary>
  ) : null;

  if (path === "/dev/ui") return <PublicShell wide>{content}</PublicShell>;

  // Patient and caregiver areas; How it works opens inside the signed-in shell when there is one.
  const area = routeRole(path) ?? role;
  if (area === "patient") return <PatientShell current={path}>{content}</PatientShell>;
  if (area === "caregiver") return <CaregiverShell current={path}>{content}</CaregiverShell>;
  return <PublicShell>{content}</PublicShell>;
}

export default function App() {
  return (
    <ToastProvider>
      <HelpProvider>
        <Routes />
        <TourHost />
      </HelpProvider>
    </ToastProvider>
  );
}
