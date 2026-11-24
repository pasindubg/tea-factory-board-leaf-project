import { useEffect, useSyncExternalStore } from "react";

function subscribe(notify: () => void) {
  window.addEventListener("hashchange", notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("popstate", notify);
  };
}

export function useRoute() {
  return useSyncExternalStore(subscribe, () => location.hash.slice(1) || "/");
}

const router = {
  push(path: string) { location.hash = path; },
  replace(path: string) {
    history.replaceState(null, "", "#" + path);
    window.dispatchEvent(new Event("hashchange"));
  },
};
export const useRouter = () => router;

export function Redirect({ href }: { href: string }) {
  useEffect(() => { router.replace(href); }, [href]);
  return null;
}

export function useLocalSearchParams<T>(): T {
  const [path, search] = useRoute().split("?", 2);
  const params = Object.fromEntries(new URLSearchParams(search));
  const match = /^\/\(field\)\/line\/([a-f0-9-]+)(?:\/new)?$/i.exec(path);
  if (match) params.id = match[1];
  return params as T;
}

export function useFocusEffect(effect: () => void | (() => void)) {
  useEffect(effect, [effect]);
}
