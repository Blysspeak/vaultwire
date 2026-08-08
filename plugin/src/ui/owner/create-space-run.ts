import type { DeviceId, SpaceId } from '@vaultwire/shared';
import { createClient } from '../../api/client';
import type { VaultwireClient } from '../../api/client';
import type { RequestFn } from '../../api/http';
import { createVerifier, deriveBundle, fromBase64, generateSalt, toBase64 } from '../../crypto';
import { scanConnection } from '../../engine/scanner';
import type { ScanFile } from '../../engine/scanner';
import { t } from '../../i18n/ru';
import { createDefaultConnection } from '../../settings/defaults';
import { storePassword } from '../../settings/remember';
import type { ConnectionSettings, VaultwireSettings } from '../../settings/types';
import type { BootstrapFailure, SyncManager } from '../../sync';

/** Как часто обновляется счётчик залитых файлов, мс. */
const PROGRESS_MS = 400;

export interface CreateSpaceInput {
  readonly serverUrl: string;
  readonly bootstrapToken: string;
  readonly password: string;
  /** Папка-источник от корня хранилища; пустая строка — всё хранилище. */
  readonly localFolder: string;
  readonly deviceLabel: string;
  readonly label: string;
}

export interface CreateSpaceDeps {
  readonly request: RequestFn;
  readonly settings: VaultwireSettings;
  readonly manager: SyncManager;
  /** Снимок хранилища для подсчёта знаменателя прогресса. */
  readonly files: readonly ScanFile[];
  save(): Promise<void>;
  progress(done: number, total: number): void;
}

export type CreateSpaceResult =
  | { readonly ok: true; readonly connection: ConnectionSettings; readonly pushed: number }
  | { readonly ok: false; readonly failure: BootstrapFailure };

/**
 * Создание пространства целиком: соль и верификатор считает клиент, сервер их
 * только хранит. Верификатор зависит от spaceId, поэтому доезжает отдельным
 * PATCH сразу после создания — до первой записи документов.
 */
export async function createSpaceConnection(
  input: CreateSpaceInput,
  deps: CreateSpaceDeps,
): Promise<CreateSpaceResult> {
  const anonymous = createClient({ baseUrl: input.serverUrl, token: '', request: deps.request });
  const created = await anonymous.createSpace(
    { salt: toBase64(generateSalt()), deviceLabel: input.deviceLabel },
    input.bootstrapToken,
  );

  const owner = createClient({
    baseUrl: input.serverUrl,
    token: created.ownerToken,
    request: deps.request,
  });
  const space = await owner.getSpace(created.spaceId);
  const keys = await deriveBundle(input.password, fromBase64(space.salt), space.epoch);
  await owner.setSpaceVerifier(created.spaceId, await createVerifier(keys.metaKey, created.spaceId));

  const connection = createDefaultConnection({
    spaceId: created.spaceId,
    serverUrl: input.serverUrl,
    deviceId: await ownerDeviceId(owner, created.spaceId),
    deviceToken: created.ownerToken,
    label: input.label,
    deviceLabel: input.deviceLabel,
    localFolder: input.localFolder,
    role: 'owner',
    keyEpoch: space.epoch,
  });
  deps.settings.connections.push(connection);
  await deps.save();

  return uploadSnapshot(connection, input.password, deps);
}

/** Первичный снимок: обычный прогон движка, прогресс снимается с индекса подключения. */
async function uploadSnapshot(
  connection: ConnectionSettings,
  password: string,
  deps: CreateSpaceDeps,
): Promise<CreateSpaceResult> {
  const runtime = deps.manager.add(connection);
  const total = countCandidates(connection, deps);
  const done = (): number => runtime.connection.index.all().length;
  const tick = window.setInterval(() => {
    deps.progress(done(), total);
  }, PROGRESS_MS);
  try {
    const started = await deps.manager.start(connection.spaceId, password);
    if (!started.ok) return { ok: false, failure: started.failure ?? 'transport' };
    storePassword(connection, password, connection.rememberPassword);
    await deps.save();
    return { ok: true, connection, pushed: runtime.connection.lastReport?.pushed.length ?? 0 };
  } finally {
    window.clearInterval(tick);
    deps.progress(done(), total);
  }
}

/** Сколько файлов вообще попадёт в пространство: индекс пуст, значит всё созданное. */
function countCandidates(connection: ConnectionSettings, deps: CreateSpaceDeps): number {
  return scanConnection(deps.files, [], {
    folder: connection.localFolder,
    include: connection.include,
    exclude: connection.exclude,
    maxFileBytes: connection.maxFileBytes ?? deps.settings.maxFileBytes,
  }).created.length;
}

/** Сервер заводит владельца вместе с пространством, но deviceId отдаёт только списком. */
async function ownerDeviceId(client: VaultwireClient, spaceId: SpaceId): Promise<DeviceId> {
  const devices = await client.listDevices(spaceId);
  const owner = devices.find((device) => device.role === 'owner' && device.revokedAt === null);
  if (owner === undefined) throw new Error(t('error.noOwnerDevice'));
  return owner.deviceId;
}
