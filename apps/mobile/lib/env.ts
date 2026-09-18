const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
const dataApi = process.env.EXPO_PUBLIC_NEON_DATA_API_URL;

if (!apiBase || !dataApi) {
  throw new Error("Missing EXPO_PUBLIC_API_BASE_URL / EXPO_PUBLIC_NEON_DATA_API_URL. Copy .env.example to .env.");
}

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
if (!__DEV__ && LOCAL_HOST.test(apiBase)) {
  throw new Error(
    `This release build points at ${apiBase}, which is only reachable on the developer's network. Set EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env.production.`,
  );
}

export const apiBaseUrl = apiBase.replace(/\/$/, "");
export const dataApiUrl = dataApi.replace(/\/rest\/v1\/?$/, "");
