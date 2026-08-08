# Бэкап vaultwire для Windows: каталог шифротел и дамп базы.
# Тот же порядок и та же логика, что в backup.sh, для машины администратора,
# снимающей копию с удалённой базы и примонтированного каталога тел.
#
# Порядок обязателен: СНАЧАЛА ТЕЛА, ПОТОМ БАЗА.
# Сервер сначала кладёт тело на диск и только потом коммитит транзакцию со ссылкой
# на него, каталог тел всегда опережает базу. Дамп, снятый первым, за время
# копирования тел может остаться со ссылкой на тело, уже снесённое сборщиком мусора.
# Догоняющий проход после дампа закрывает обратное окно: тела, приехавшие во время
# дампа. Тела адресуются хешем и неизменяемы, повторный проход дёшев.
#
# Запуск:
#   pwsh -File backup.ps1 -BackupRoot D:\backups\vaultwire

[CmdletBinding()]
param(
  [string]$BackupRoot = $env:VAULTWIRE_BACKUP_ROOT,
  [string]$BlobDir = $env:BLOB_DIR,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [int]$KeepDays = 14
)

$ErrorActionPreference = 'Stop'
$serverDir = Split-Path -Parent $PSScriptRoot

# Значения по умолчанию берём из server/.env, чтобы не дублировать настройки.
$envFile = Join-Path $serverDir '.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -notmatch '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') { continue }
    $name = $Matches[1]
    $value = $Matches[2].Trim().Trim('"')
    if ($name -eq 'DATABASE_URL' -and -not $DatabaseUrl) { $DatabaseUrl = $value }
    if ($name -eq 'BLOB_DIR' -and -not $BlobDir) { $BlobDir = $value }
  }
}

if (-not $DatabaseUrl) { throw 'не задан DATABASE_URL: ни параметром, ни в окружении, ни в server/.env' }
if (-not $BlobDir) { $BlobDir = './data/blobs' }
if (-not [System.IO.Path]::IsPathRooted($BlobDir)) {
  $BlobDir = Join-Path $serverDir ($BlobDir -replace '^\./', '')
}
if (-not $BackupRoot) { throw 'не задан каталог копии: параметр -BackupRoot или VAULTWIRE_BACKUP_ROOT' }

$blobsCopy = Join-Path $BackupRoot 'blobs'
$dbCopy = Join-Path $BackupRoot 'db'
New-Item -ItemType Directory -Force -Path $blobsCopy, $dbCopy | Out-Null

# robocopy сообщает об успехе кодами 0..7, всё выше — настоящая ошибка.
function Copy-Blobs {
  robocopy $BlobDir $blobsCopy /E /NFL /NDL /NJH /NP /R:2 /W:5 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy вернул $LASTEXITCODE" }
}

Write-Information "шаг 1: тела $BlobDir -> $blobsCopy" -InformationAction Continue
Copy-Blobs

$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$dumpFile = Join-Path $dbCopy "vaultwire-$stamp.dump"
Write-Information "шаг 2: дамп базы -> $dumpFile" -InformationAction Continue
# Пишем во временный файл и переименовываем: оборванный дамп не должен выглядеть готовым.
& pg_dump --dbname=$DatabaseUrl --format=custom --file="$dumpFile.part"
if ($LASTEXITCODE -ne 0) { throw "pg_dump вернул $LASTEXITCODE" }
Move-Item -Path "$dumpFile.part" -Destination $dumpFile -Force

Write-Information 'шаг 3: догоняющий проход по телам' -InformationAction Continue
Copy-Blobs

Write-Information "шаг 4: чистка дампов старше $KeepDays дней" -InformationAction Continue
Get-ChildItem -Path $dbCopy -Filter 'vaultwire-*.dump' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Force

Write-Information "бэкап готов: $dumpFile" -InformationAction Continue
