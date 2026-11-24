type StoredSession = { session: string; userId: string };
type Device = { deviceId: string; platform: "android"; model: string; appVersion: string };
type NativePort = { postMessage: (message: string) => void; onmessage?: (event: MessageEvent<string>) => void };
declare global { interface Window { TeaFactoryNative?: NativePort } }

const pending = new Map<string, (reply: { ok?: boolean; result?: unknown; error?: string }) => void>();
let listening: NativePort | undefined;
let sequence = 0;

function call<T>(method: string, params: object = {}): Promise<T> {
  const port = window.TeaFactoryNative;
  if (!port) return Promise.reject(new Error("Open Tea Factory Field on the registered Android phone."));
  if (listening !== port) {
    listening = port;
    port.onmessage = ({ data }) => {
      try {
        const reply = JSON.parse(data);
        if (reply?.v === 1 && typeof reply.id === "string") pending.get(reply.id)?.(reply);
      } catch { /* Ignore malformed bridge replies. */ }
    };
  }
  const id = String(++sequence);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error("The Android app did not respond. Please try again."));
    }, 5000);
    pending.set(id, (reply) => {
      pending.delete(id);
      window.clearTimeout(timer);
      if (reply.ok) resolve(reply.result as T);
      else reject(new Error(reply.error || "The Android app could not complete the request."));
    });
    try { port.postMessage(JSON.stringify({ v: 1, id, method, params })); }
    catch (error) { window.clearTimeout(timer); pending.delete(id); reject(error); }
  });
}

let previewSession: StoredSession | null = null;
export const getDevice = () => window.TeaFactoryNative ? call<Device>("device.get") : Promise.resolve(null);
export const loadSession = () => window.TeaFactoryNative ? call<StoredSession | null>("session.get") : Promise.resolve(previewSession);
export async function saveSession(value: StoredSession | null) {
  if (window.TeaFactoryNative) {
    if (value) await call("session.set", value);
    else await call("session.clear");
  } else previewSession = value;
}
