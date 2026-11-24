const rawOrigin = process.env.MOBILE_API_ORIGIN;
if (!rawOrigin) throw new Error("Set MOBILE_API_ORIGIN to the hosted mobile API HTTPS origin.");
const apiOrigin = new URL(rawOrigin);
if (apiOrigin.protocol !== "https:" || apiOrigin.username || apiOrigin.password ||
    apiOrigin.pathname !== "/" || apiOrigin.search || apiOrigin.hash) {
  throw new Error("MOBILE_API_ORIGIN must be an HTTPS origin.");
}

export const config = {
  "framework": "vite",
  "ignoreCommand": "test \"$VERCEL_GIT_COMMIT_REF\" != blm-cloud-release",
  "rewrites": [
    {
      "source": "/api/mobile/:path*",
      "destination": new URL("/api/mobile/:path*", apiOrigin).href
    }
  ],
  "headers": [
    {
      "source": "/",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-store"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"
        }
      ]
    },
    {
      "source": "/api/mobile/:path*",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-store"
        }
      ]
    }
  ]
};
