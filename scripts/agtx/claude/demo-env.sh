set -a; source ~/Documents/Codex/2026-09-23/egemed-clinical-learning-experience-platform-clix/.env.local >/dev/null 2>&1; set +a
export ADMIN_DATABASE_URL="$DATABASE_URL"
export DATABASE_URL="${DATABASE_URL%/*}/egemed_local_demo"
export AUTH_DEV_ENABLED=true NODE_ENV=development PORT=3100 AUTH_LOGIN_RATE_MAX=200
