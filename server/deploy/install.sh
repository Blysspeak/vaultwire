#!/usr/bin/env bash
# Развёртывание сервера vaultwire с нуля. Идемпотентен: повторный запуск обновляет
# код и зависимости, не трогая базу и уже выданные токены.
#
#   ./install.sh                     установка или обновление
#   VW_PORT=8788 ./install.sh        другой порт
#
# Требуется: Node 20+, PostgreSQL, pm2. Домен, nginx и TLS настраиваются отдельно,
# смотри nginx.conf.example и README.md рядом.

set -euo pipefail

VW_ROOT="${VW_ROOT:-/opt/vaultwire}"
VW_PORT="${VW_PORT:-8787}"
VW_HOST="${VW_HOST:-127.0.0.1}"
VW_DB_NAME="${VW_DB_NAME:-vaultwire}"
VW_DB_USER="${VW_DB_USER:-vaultwire}"
VW_BLOB_DIR="${VW_BLOB_DIR:-$VW_ROOT/data/blobs}"
VW_PM2_NAME="${VW_PM2_NAME:-vaultwire-server}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\033[31mошибка: %s\033[0m\n' "$1" >&2; exit 1; }

say "проверка окружения"
for cmd in node npm psql pm2; do
  command -v "$cmd" >/dev/null || die "нет $cmd"
done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 20 ] || die "нужен Node 20 или новее, найден $(node -v)"
[ -d "$VW_ROOT/server" ] || die "нет $VW_ROOT/server, сначала залейте код"
echo "node $(node -v), psql $(psql --version | awk '{print $3}'), корень $VW_ROOT"

say "база данных"
# Пароль генерируется один раз и переживает повторные запуски: он лежит в .env.
if [ -f "$VW_ROOT/server/.env" ] && grep -q '^DATABASE_URL=' "$VW_ROOT/server/.env"; then
  DB_URL="$(grep '^DATABASE_URL=' "$VW_ROOT/server/.env" | cut -d= -f2-)"
  echo "строка подключения взята из существующего .env"
else
  DB_PASS="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)"
  DB_URL="postgresql://$VW_DB_USER:$DB_PASS@127.0.0.1:5432/$VW_DB_NAME"
  su - postgres -c "psql -tAc \"select 1 from pg_roles where rolname='$VW_DB_USER'\"" | grep -q 1 \
    || su - postgres -c "psql -c \"create role $VW_DB_USER login password '$DB_PASS'\"" >/dev/null
  su - postgres -c "psql -tAc \"select 1 from pg_database where datname='$VW_DB_NAME'\"" | grep -q 1 \
    || su - postgres -c "createdb -O $VW_DB_USER $VW_DB_NAME"
  echo "роль и база $VW_DB_NAME готовы"
fi

say "конфигурация"
if [ ! -f "$VW_ROOT/server/.env" ]; then
  # Bootstrap-токен нужен, чтобы создавать пространства. Пустой отключает создание.
  BOOTSTRAP="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
  cat > "$VW_ROOT/server/.env" <<EOF
DATABASE_URL=$DB_URL
PORT=$VW_PORT
HOST=$VW_HOST
BLOB_DIR=$VW_BLOB_DIR
BOOTSTRAP_TOKEN=$BOOTSTRAP
LOG_LEVEL=info
MAX_BLOB_BYTES=52428800
DEFAULT_QUOTA_BYTES=5368709120
GC_INTERVAL_MS=3600000
EOF
  chmod 600 "$VW_ROOT/server/.env"
  echo "создан .env, bootstrap-токен: $BOOTSTRAP"
  echo "сохраните его: показывается только сейчас"
else
  echo ".env на месте, не трогаем"
fi
mkdir -p "$VW_BLOB_DIR"

say "зависимости и сборка контракта"
# shared подключён через file:../shared и должен быть собран раньше сервера.
# Ставится вместе с dev-зависимостями: сборка контракта идёт через tsc, а он там.
( cd "$VW_ROOT/shared" && npm install --no-audit --no-fund >/dev/null )
( cd "$VW_ROOT/shared" && npm run build >/dev/null )
# Серверу tsx нужен в рантайме, поэтому dev-зависимости тоже остаются.
( cd "$VW_ROOT/server" && npm install --no-audit --no-fund >/dev/null )

say "миграции"
( cd "$VW_ROOT/server" && npx prisma generate >/dev/null && npx prisma migrate deploy )

say "запуск под pm2"
cd "$VW_ROOT/server"
if pm2 describe "$VW_PM2_NAME" >/dev/null 2>&1; then
  pm2 reload "$VW_PM2_NAME" --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save >/dev/null

say "проверка живости"
for i in $(seq 1 20); do
  if curl -fsS "http://$VW_HOST:$VW_PORT/health" >/dev/null 2>&1; then
    curl -sS "http://$VW_HOST:$VW_PORT/health"; echo
    say "готово"
    echo "дальше: сертификат и серверный блок nginx, смотри nginx.conf.example"
    exit 0
  fi
  sleep 1
done
pm2 logs "$VW_PM2_NAME" --lines 30 --nostream || true
die "сервер не ответил на /health"
