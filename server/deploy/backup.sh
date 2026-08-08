#!/usr/bin/env bash
# Бэкап vaultwire: каталог шифротел и дамп базы.
#
# Порядок обязателен: СНАЧАЛА ТЕЛА, ПОТОМ БАЗА.
# Сервер сначала кладёт тело на диск и только потом коммитит транзакцию со ссылкой
# на него, то есть каталог тел всегда опережает базу. Если снять дамп первым, а тела
# копировать после, за время копирования GC успеет физически снести тело, ссылку на
# которое дамп ещё содержит. Поэтому основной объём тел уходит в копию до дампа.
# Второй, догоняющий проход rsync после дампа закрывает обратное окно: тела,
# приехавшие во время дампа. Тела адресуются хешем и неизменяемы, поэтому второй
# проход дёшев и безопасен.
#
# Запуск из cron на сервере:
#   0 4 * * * /root/project/vaultwire/server/deploy/backup.sh >> /var/log/vaultwire-backup.log 2>&1

set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${VAULTWIRE_BACKUP_ROOT:-/var/backups/vaultwire}"
KEEP_DAYS="${VAULTWIRE_BACKUP_KEEP_DAYS:-14}"

# Переменные берутся из .env сервера, если не заданы снаружи: строка подключения и
# путь к телам не должны дублироваться в двух местах и разъезжаться.
if [[ -f "$SERVER_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SERVER_DIR/.env"
  set +a
fi

: "${DATABASE_URL:?не задан DATABASE_URL: ни в окружении, ни в server/.env}"
BLOB_DIR="${BLOB_DIR:-./data/blobs}"
# Относительный путь в .env считается от каталога сервера, а не от cwd cron.
case "$BLOB_DIR" in
  /*) ;;
  *) BLOB_DIR="$SERVER_DIR/${BLOB_DIR#./}" ;;
esac

STAMP="$(date +%Y-%m-%d-%H%M%S)"
mkdir -p "$BACKUP_ROOT/blobs" "$BACKUP_ROOT/db"

echo "[$(date +%T)] шаг 1: тела $BLOB_DIR -> $BACKUP_ROOT/blobs"
# Без --delete: тела, снесённые сборщиком мусора, остаются в зеркале, пока жив
# дамп, который на них ссылается. Чистятся вместе с истёкшими дампами.
rsync -a --info=stats1 "$BLOB_DIR/" "$BACKUP_ROOT/blobs/"

DUMP_FILE="$BACKUP_ROOT/db/vaultwire-$STAMP.dump"
echo "[$(date +%T)] шаг 2: дамп базы -> $DUMP_FILE"
# -Fc: сжатый формат, восстанавливается pg_restore выборочно по таблицам.
# Пишем во временный файл и переименовываем: оборванный дамп не должен выглядеть готовым.
pg_dump --dbname="$DATABASE_URL" --format=custom --file="$DUMP_FILE.part"
mv "$DUMP_FILE.part" "$DUMP_FILE"

echo "[$(date +%T)] шаг 3: догоняющий проход по телам"
rsync -a --info=stats1 "$BLOB_DIR/" "$BACKUP_ROOT/blobs/"

echo "[$(date +%T)] шаг 4: чистка дампов старше $KEEP_DAYS дней"
find "$BACKUP_ROOT/db" -name 'vaultwire-*.dump' -mtime "+$KEEP_DAYS" -delete

echo "[$(date +%T)] бэкап готов: $DUMP_FILE"
