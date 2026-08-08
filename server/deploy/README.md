# Развёртывание сервера vaultwire

Целевой хост: `obsidian.boostix.space`. Схема та же, что у boostix: чекаут в
`/root/project`, процесс под pm2, снаружи nginx с TLS, выкладка по merge в `main`
на self-hosted runner.

Файлы этого каталога:

| Файл | Назначение |
|---|---|
| `ecosystem.config.cjs` | процесс pm2 `vaultwire-server` |
| `nginx.conf.example` | серверный блок, копируется в `sites-available` |
| `backup.sh`, `backup.ps1` | бэкап: тела, затем база |

## 0. Требования на хосте

Node 22+, PostgreSQL 16, nginx, certbot, pm2 (`npm i -g pm2`), git, rsync.

## 1. База данных

Отдельная база, не схема внутри базы boostix:

```sql
CREATE USER vaultwire WITH PASSWORD '<пароль>';
CREATE DATABASE vaultwire OWNER vaultwire;
```

Право `CREATE DATABASE` пользователю не нужно: на проде идёт `prisma migrate deploy`,
теневую базу заводит только `migrate dev` на машине разработчика.

## 2. Чекаут

```bash
mkdir -p /root/project && cd /root/project
git clone <репозиторий> vaultwire
cd vaultwire
```

Путь `/root/project/vaultwire` зашит в `ecosystem.config.cjs` и в workflow. Другой путь
надо править в обоих местах.

## 3. Переменные окружения

```bash
cd /root/project/vaultwire/server
cp .env.example .env
chmod 600 .env
```

Заполнить: `DATABASE_URL`, `BLOB_DIR=/var/lib/vaultwire/blobs`, `PORT=8787`,
`HOST=127.0.0.1`, `BOOTSTRAP_TOKEN` (длинная случайная строка; пусто — создание
пространств выключено), `MAX_BLOB_BYTES`.

```bash
mkdir -p /var/lib/vaultwire/blobs
openssl rand -base64 48   # значение для BOOTSTRAP_TOKEN
```

`.env` в git не попадает и CI его не трогает: он ставится руками один раз.

## 4. Зависимости и миграции

```bash
cd /root/project/vaultwire/shared && npm ci && npm run build
cd ../server && npm ci
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy
```

`shared` собирается первым: `server` видит его симлинком `file:../shared`, а `dist` в
git не хранится. `npm ci` без `--omit=dev` намеренно: рантайм `tsx` и CLI `prisma`
лежат в `devDependencies`, build-шага у сервера нет.

## 5. pm2

```bash
cd /root/project/vaultwire/server
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup        # один раз, чтобы процессы поднимались после перезагрузки
curl -sf http://127.0.0.1:8787/health
```

Ответ: `{"status":"ok","protocolVersion":1,"database":"up","wsConnections":0,...}`.
`database: "down"` и код 503 означают, что `DATABASE_URL` неверен или база не поднята.

## 6. Сертификат и nginx

Сначала сертификат, потом 443-блок: nginx не стартует, если в конфиге указаны
несуществующие файлы сертификата.

```bash
certbot certonly --nginx -d obsidian.boostix.space
cp deploy/nginx.conf.example /etc/nginx/sites-available/obsidian.boostix.space
ln -s /etc/nginx/sites-available/obsidian.boostix.space /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

В блоке проверить: `client_max_body_size` не меньше `MAX_BLOB_BYTES` плюс запас,
порт апстрима совпадает с `PORT`, у `location = /v1/sync` стоят `Upgrade`/`Connection`
и `proxy_read_timeout 3600s`.

## 7. Проверка работоспособности

```bash
curl -sf https://obsidian.boostix.space/health
curl -si https://obsidian.boostix.space/v1/spaces/x | head -1   # ожидается 401
```

WebSocket: `wss://obsidian.boostix.space/v1/sync`, токен уходит первым фреймом.
Соединение должно жить дольше минуты — иначе не подхватились таймауты в nginx.

Дальше создать пространство bootstrap-токеном (`POST /v1/spaces`) и подключиться
плагином.

## 8. Выкладка

`.github/workflows/server.yml` срабатывает на push в `main` по путям `server/**` и
`shared/**`. Раннер: self-hosted с метками `self-hosted` и `vaultwire`.

```bash
# на сервере, один раз
cd /root/actions-runner
./config.sh --url https://github.com/<владелец>/<репозиторий> --labels vaultwire
./svc.sh install && ./svc.sh start
```

До настройки раннера job'ы висят в очереди и не выполняются — это ожидаемо.

Шаги выкладки: проверки (типы, тесты) → `git reset --hard origin/main` под локом →
сборка `shared`, `npm ci` → `prisma migrate deploy` → перезапуск pm2 → проверка
живости. Красные проверки означают skipped у выкладки, прод не трогается.

## 9. Бэкап

```bash
crontab -e
0 4 * * * /root/project/vaultwire/server/deploy/backup.sh >> /var/log/vaultwire-backup.log 2>&1
```

Порядок внутри скрипта: тела, дамп базы, догоняющий проход по телам. Обоснование —
в шапке `backup.sh`. Восстановление:

```bash
rsync -a /var/backups/vaultwire/blobs/ /var/lib/vaultwire/blobs/
pg_restore --clean --if-exists --dbname="$DATABASE_URL" vaultwire-<дата>.dump
```

Тела восстанавливаются раньше базы по той же причине, по какой копируются первыми.

## 10. Откат

Автоматический откат встроен в workflow: при падении проверки живости чекаут
возвращается на предыдущий коммит и pm2 перезапускается. **Миграции базы не
откатываются** — политика forward-only. Выкладку с миграцией нужно заранее проверять
на совместимость со старым кодом.

Руками:

```bash
cd /root/project/vaultwire
git reset --hard <коммит>
cd shared && npm ci && npm run build
cd ../server && npm ci && ./node_modules/.bin/prisma generate
pm2 restart vaultwire-server
curl -sf http://127.0.0.1:8787/health
```

## Ограничение

Рассылка `changed` по WebSocket живёт в памяти процесса, поэтому инстанс ровно один
(`instances: 1`, `exec_mode: fork`). Второму инстансу понадобится внешняя шина.
