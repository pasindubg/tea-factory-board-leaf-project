#!/bin/bash
# Tea Factory Ops — mint a Supabase email OTP for a seeded/dev user.
# Double-click to launch for owner-a@example.com, or run: ./otp.sh user@example.com

set -e
cd "$(dirname "$0")"

# Node 20.20.2 via nvm + pnpm global, matching start.sh.
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$HOME/.npm-global/bin:$PATH"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: ./otp.sh [email]"
  echo
  echo "Default email: owner-a@example.com"
  echo "Example: ./otp.sh collector-a@example.com"
  exit 0
fi

EMAIL="${1:-owner-a@example.com}"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${SUPABASE_SECRET_KEY:-}" ]]; then
  echo "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY."
  echo "Add them to .env, then run this again."
  exit 1
fi

echo "==> Minting login OTP for $EMAIL ..."
pnpm --dir packages/db db:mint-otp "$EMAIL"
