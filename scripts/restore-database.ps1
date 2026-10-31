# Restores a backup zip. By default into a separate test database, leaving the live data alone.
#   Check a backup:      .\restore-database.ps1 -ZipPath E:\TextileBackups\<file>.zip
#   Replace live data:   .\restore-database.ps1 -ZipPath E:\TextileBackups\<file>.zip -Live
# MySQL must be running.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [string]$TestDatabase = 'textile_restore_test',
    [switch]$Live,
    [string]$ConfirmText = '',          # type RESTORE at the prompt, or pass it here
    [switch]$DropTestDatabase,          # remove the test database after the check
    [string]$BackupDir = 'E:\TextileBackups',
    [string]$XamppRoot = 'D:\XAMPPN',
    [int]$Port = 3306
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'backup-common.ps1')

$binDir = Join-Path $XamppRoot 'mysql\bin'
$mysql = Join-Path $binDir 'mysql.exe'
$db = Read-DbConfig $XamppRoot (Join-Path $PSScriptRoot '..\backend\config\config.php')
if (-not (Test-Path -LiteralPath $ZipPath)) { throw "Backup not found: $ZipPath" }
if (-not $Live -and $TestDatabase -eq $db.name) { throw 'The test database cannot be the live database. Use -Live to replace live data.' }
if (-not (Test-MySqlUp $binDir $Port)) { throw 'MySQL is not running. Start it in the XAMPP Control Panel first.' }

$conn = @('--host=127.0.0.1', "--port=$Port", "--user=$($db.user)", '--default-character-set=utf8mb4')
$env:MYSQL_PWD = $db.pass

function Invoke-Sql([string]$Database, [string]$Sql) {
    $r = Invoke-Tool $mysql ($conn + @('-N', '-e', "`"$Sql`"") + @($Database | Where-Object { $_ }))
    if ($r.ExitCode -ne 0) { throw "mysql failed: $($r.Error)" }
    return $r.Output
}

function Get-RowCounts([string]$Database) {
    $counts = [ordered]@{}
    foreach ($t in 'products', 'sales', 'sale_items', 'customers') {
        $counts[$t] = [int](Invoke-Sql $Database "SELECT COUNT(*) FROM $t")
    }
    return $counts
}

$workDir = Join-Path $env:TEMP ('textile-restore-' + [guid]::NewGuid().ToString('N'))
try {
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $workDir
    $sqlFile = Get-ChildItem -Path $workDir -Filter *.sql | Select-Object -First 1
    if (-not $sqlFile) { throw 'No .sql file inside this backup.' }
    if ((Get-Content -LiteralPath $sqlFile.FullName -Tail 1) -notmatch 'Dump completed') { throw 'This backup is incomplete.' }
    $source = $sqlFile.FullName -replace '\\', '/'

    if ($Live) {
        Write-Output "This REPLACES the live database '$($db.name)' with $(Split-Path $ZipPath -Leaf)."
        if (-not $ConfirmText) { $ConfirmText = Read-Host 'Type RESTORE to continue' }
        if ($ConfirmText -cne 'RESTORE') { Write-Output 'Cancelled. Nothing was changed.'; exit 1 }

        Write-Output 'Taking a backup of the current data first...'
        & (Join-Path $PSScriptRoot 'backup-database.ps1') -BackupDir $BackupDir -XamppRoot $XamppRoot -Port $Port -Force
        if ($LASTEXITCODE -ne 0) { throw 'The safety backup failed, so nothing was restored.' }
        $env:MYSQL_PWD = $db.pass # the backup script clears it when it finishes
        $target = $db.name
    } else {
        Invoke-Sql '' "DROP DATABASE IF EXISTS $TestDatabase; CREATE DATABASE $TestDatabase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" | Out-Null
        $target = $TestDatabase
    }

    $r = Invoke-Tool $mysql ($conn + @('-e', "`"source $source`"", $target))
    if ($r.ExitCode -ne 0) { throw "Restore failed: $($r.Error)" }

    Write-Output "Restored into '$target'. Row counts:"
    $restored = Get-RowCounts $target
    $restored.GetEnumerator() | ForEach-Object { Write-Output ("  {0,-12} {1}" -f $_.Key, $_.Value) }

    if (-not $Live) {
        Write-Output 'Live database for comparison:'
        (Get-RowCounts $db.name).GetEnumerator() | ForEach-Object { Write-Output ("  {0,-12} {1}" -f $_.Key, $_.Value) }
        if ($DropTestDatabase) {
            Invoke-Sql '' "DROP DATABASE $TestDatabase" | Out-Null
            Write-Output "Removed test database '$TestDatabase'."
        }
    }
} finally {
    Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
}
