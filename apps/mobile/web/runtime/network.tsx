import { useEffect, useState, type ReactNode } from "react";

export function NetworkBoundary({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(() => navigator.onLine);
  const [opened, setOpened] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = (online: boolean) => {
      setConnected(online);
      if (online) setOpened(true);
    };
    const online = () => update(true);
    const offline = () => update(false);
    const native = (event: Event) => update((event as CustomEvent<{ connected: boolean }>).detail.connected);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("tea-network", native);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("tea-network", native);
    };
  }, []);

  return (
    <>
      {opened && <div id="online-content" inert={!connected}>{children}</div>}
      {!connected && (
        <div className="network-overlay" role="alert">
          <strong>Network disconnected</strong>
          <p>Reconnect to Wi-Fi or mobile data to continue.</p>
        </div>
      )}
    </>
  );
}
