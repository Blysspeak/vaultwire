# vaultwire — сервер

Fastify, Prisma, PostgreSQL, Node 22, рантайм tsx. Сервер хранит только шифротекст: ни
содержимого заметок, ни их имён, ни структуры папок он не знает.

## Требования

- Node 22 или новее (используется `process.loadEnvFile`, встроенный тестовый рантайм не нужен)
- PostgreSQL 16, **отдельная база**, а не схема внутри чужой
- собранный пакет `shared`: `cd ../shared && npm install && npm run build`

## Поднятие базы

Через docker для разработки:

```
docker run -d --name vaultwire-pg -p 5432:5432 \
  -e POSTGRES_USER=vaultwire -e POSTGRES_PASSWORD=password -e POSTGRES_DB=vaultwire \
  postgres:16
```

Либо на существующем сервере PostgreSQL:

```sql
CREATE USER vaultwire WITH PASSWORD 'password';
CREATE DATABASE vaultwire OWNER vaultwire;
```

Пользователю нужно право `CREATE DATABASE`: `prisma migrate dev` заводит теневую базу, чтобы
сверить схему. На проде это право не требуется, там идёт `prisma migrate deploy`.

## Настройка окружения

```
cp .env.example .env
```

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | строка подключения, обязательна, без неё процесс не стартует |
| `PORT`, `HOST` | адрес прослушивания, наружу смотрит nginx |
| `BLOB_DIR` | каталог шифротел, раскладка `<spaceId>/<хеш[0:2]>/<хеш>` |
| `BOOTSTRAP_TOKEN` | токен для `POST /v1/spaces`. Пусто — создание пространств отключено |
| `LOG_LEVEL` | `trace`…`fatal` |
| `MAX_BLOB_BYTES` | предел одного тела |
| `DEFAULT_QUOTA_BYTES` | квота нового пространства |
| `GC_INTERVAL_MS` | период сборки мусора, `0` отключает |

`BLOB_DIR` создаётся лениво при первой записи тела и в git не попадает.

## Установка и миграции

```
npm install
npm run generate          # prisma generate, клиент по схеме
npm run migrate           # prisma migrate dev, разработка
npm run dev               # tsx watch src/index.ts
```

Если `npm install` пропустил install-скрипты (npm 11 просит подтверждения), выполните
`npm approve-scripts`: без них не соберётся движок Prisma и `generate` упадёт.

На проде миграции применяются без генерации новых файлов:

```
npm ci
npx prisma migrate deploy
npx prisma generate
npm start
```

Изменили `prisma/schema.prisma` — сделайте `npm run migrate -- --name краткое_описание` и
закоммитьте появившийся каталог в `prisma/migrations`. Файлы миграций правятся руками только
до первого применения на проде.

## Проверки

```
npm run typecheck
npm test
```

Модульные тесты базы не требуют. Сценарии, которым нужен PostgreSQL (монотонность `seq`,
409 при рассинхроне, атомарность переезда, сборка мусора, квоты), прогоняются вручную против
одноразовой базы и пока не входят в `npm test`.

## Развёртывание

`obsidian.boostix.space`, nginx на отдельный порт, pm2. В nginx обязательны
`client_max_body_size` не меньше `MAX_BLOB_BYTES` и заголовки Upgrade/Connection с
`proxy_read_timeout 3600s` для WebSocket на `/v1/sync`.

Бэкап делается в порядке «сначала тела, потом база»: `rsync` каталога `BLOB_DIR`, затем
`pg_dump`. Обратный порядок оставляет в базе ссылки на ещё не сохранённые тела.

Рассылка `changed` по WebSocket живёт в памяти процесса, поэтому инстанс должен быть один.
Двум и более инстансам понадобится внешняя шина.
