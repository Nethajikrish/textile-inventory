# Daily database backup: dump -> check -> zip -> check -> tidy old backups.
# Scheduled by install-backup-task.ps1. To back up right now: .\backup-database.ps1 -Force
[CmdletBinding()]
param(
    [string]$BackupDir = 'E:\TextileBackups',
    [string]$XamppRoot = 'D:\XAMPPN',
    [string]$DailyAt = '21:00',       # the scheduled time; a run is skipped if a backup already exists since then
    [string]$CopyTo = '',             # optional second folder, e.g. a pen drive or a cloud-synced folder
    [int]$KeepDaily = 30,             # newest backups always kept
    [int]$KeepMonths = 12,            # plus the first backup of each of these months
    [int]$Port = 3306,
    [string]$DefaultsFile = '',       # my.ini used if MySQL has to be started; defaults to XAMPP's
    [switch]$Force                    # back up even if one already exists since the scheduled time
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'backup-common.ps1')

$binDir = Join-Path $XamppRoot 'mysql\bin'
if (-not $DefaultsFile) { $DefaultsFile = Join-Path $binDir 'my.ini' }
$configPath = Join-Path $PSScriptRoot '..\backend\config\config.php'
$warningFile = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DATABASE BACKUP FAILED.txt'

function Write-Log([string]$Message) {
    $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Output $line
    # A bad backup folder must still leave a trace somewhere.
    try { Add-Content -Path (Join-Path $BackupDir 'backup.log') -Value $line -Encoding UTF8 }
    catch { Add-Content -Path (Join-Path $env:TEMP 'textile-backup.log') -Value $line -Encoding UTF8 }
}

# Backups are named <db>_yyyy-MM-dd_HHmm.zip; nothing else in the folder is ever touched.
function Get-Backups([string]$DbName) {
    $pattern = '^' + [regex]::Escape($DbName) + '_(\d{4}-\d{2}-\d{2}_\d{4})\.zip$'
    Get-ChildItem -Path $BackupDir -File | ForEach-Object {
        $m = [regex]::Match($_.Name, $pattern)
        if ($m.Success) {
            $when = [datetime]::MinValue
            if ([datetime]::TryParseExact($m.Groups[1].Value, 'yyyy-MM-dd_HHmm', [Globalization.CultureInfo]::InvariantCulture, 'None', [ref]$when)) {
                [pscustomobject]@{ File = $_; When = $when }
            }
        }
    }
}

# The start of the current backup period: today's scheduled time if it has passed, otherwise yesterday's.
function Get-LastSlot {
    $slot = [datetime]::ParseExact($DailyAt, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
    $slot = (Get-Date).Date.Add($slot.TimeOfDay)
    if ((Get-Date) -lt $slot) { $slot = $slot.AddDays(-1) }
    return $slot
}

function Remove-OldBackups([string]$DbName) {
    $all = @(Get-Backups $DbName | Sort-Object When -Descending)
    $keep = @{}
    $all | Select-Object -First $KeepDaily | ForEach-Object { $keep[$_.File.Name] = $true }
    $oldestMonth = (Get-Date -Day 1).Date.AddMonths(-($KeepMonths - 1))
    $all | Where-Object { $_.When -ge $oldestMonth } | Group-Object { $_.When.ToString('yyyy-MM') } | ForEach-Object {
        $first = $_.Group | Sort-Object When | Select-Object -First 1
        $keep[$first.File.Name] = $true
    }
    foreach ($b in $all) {
        if (-not $keep[$b.File.Name]) {
            Remove-Item -LiteralPath $b.File.FullName
            Write-Log "Removed old backup $($b.File.Name)"
        }
    }
}

# Dump to a working file, check it, zip it, check the zip, and only then give it its final name.
function New-Backup($Db) {
    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
    $finalName = "$($Db.name)_$stamp.zip"
    $sqlPath = Join-Path $BackupDir "$($Db.name)_$stamp.sql"
    $pendingZip = Join-Path $BackupDir "pending_$stamp.zip"
    try {
        # --result-file: redirecting through PowerShell would damage the file's encoding.
        # --single-transaction: billing can carry on during the dump.
        $r = Invoke-Tool (Join-Path $binDir 'mysqldump.exe') @(
            '--host=127.0.0.1', "--port=$Port", "--user=$($Db.user)", '--single-transaction', '--routines', '--events',
            '--default-character-set=utf8mb4', "--result-file=`"$sqlPath`"", $Db.name)
        if ($r.ExitCode -ne 0) { throw "mysqldump failed (exit $($r.ExitCode)): $($r.Error)" }
        if ((Get-Content -LiteralPath $sqlPath -Tail 1) -notmatch 'Dump completed') { throw 'The dump is incomplete (no "Dump completed" line).' }

        Compress-Archive -LiteralPath $sqlPath -DestinationPath $pendingZip -Force
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($pendingZip)
        try {
            $entry = $zip.Entries | Select-Object -First 1
            if (-not $entry -or $entry.Length -ne (Get-Item -LiteralPath $sqlPath).Length) { throw 'The zip does not match the dump.' }
        } finally { $zip.Dispose() }

        $finalPath = Join-Path $BackupDir $finalName
        Move-Item -LiteralPath $pendingZip -Destination $finalPath -Force
        return Get-Item -LiteralPath $finalPath
    } finally {
        Remove-Item -LiteralPath $sqlPath, $pendingZip -ErrorAction SilentlyContinue
    }
}

$startedMySql = $null
$failed = $false
try {
    if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
    $db = Read-DbConfig $XamppRoot $configPath

    if (-not $Force) {
        $slot = Get-LastSlot
        if (@(Get-Backups $db.name | Where-Object { $_.When -ge $slot }).Count -gt 0) {
            Write-Log "Skipped: already backed up since $($slot.ToString('yyyy-MM-dd HH:mm'))."
            if (Test-Path -LiteralPath $warningFile) { Remove-Item -LiteralPath $warningFile }
            exit 0
        }
    }

    $env:MYSQL_PWD = $db.pass # read by the MySQL tools; keeps the password off the command line

    # XAMPP starts MySQL by hand, so it may be stopped. Start it just for the backup, the way XAMPP does.
    if (-not (Test-MySqlUp $binDir $Port)) {
        Write-Log 'MySQL is not running; starting it for the backup.'
        $startedMySql = Start-Process -FilePath (Join-Path $binDir 'mysqld.exe') -ArgumentList @("--defaults-file=`"$DefaultsFile`"", '--standalone') -WindowStyle Hidden -PassThru
        $deadline = (Get-Date).AddSeconds(60)
        while (-not (Test-MySqlUp $binDir $Port)) {
            if ($startedMySql.HasExited) { throw "MySQL could not be started (exit $($startedMySql.ExitCode)). Is the database damaged, or is the port in use?" }
            if ((Get-Date) -gt $deadline) { throw 'MySQL did not start within 60 seconds.' }
            Start-Sleep -Seconds 1
        }
    }

    $backup = New-Backup $db
    Write-Log "OK: $($backup.Name) ($([math]::Round($backup.Length / 1KB, 1)) KB)"

    if ($CopyTo) {
        if (-not (Test-Path $CopyTo)) { New-Item -ItemType Directory -Path $CopyTo | Out-Null }
        Copy-Item -LiteralPath $backup.FullName -Destination $CopyTo -Force
        Write-Log "Copied to $CopyTo"
    }

    # Only after a good backup, so repeated failures can never wipe the good ones.
    Remove-OldBackups $db.name
    if (Test-Path -LiteralPath $warningFile) { Remove-Item -LiteralPath $warningFile }
} catch {
    $failed = $true
    $reason = $_.Exception.Message
    Write-Log "FAILED: $reason"
    Set-Content -LiteralPath $warningFile -Encoding UTF8 -Value @(
        "The database backup failed on $(Get-Date -Format 'dd/MM/yyyy HH:mm').",
        '',
        "Reason: $reason",
        '',
        "Backup folder: $BackupDir",
        'This file is removed automatically after the next good backup.',
        "To try now, run: powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Force"
    )
} finally {
    if ($startedMySql -and -not $startedMySql.HasExited) {
        $r = Invoke-Tool (Join-Path $binDir 'mysqladmin.exe') @('--host=127.0.0.1', "--port=$Port", "--user=$($db.user)", 'shutdown')
        if ($r.ExitCode -eq 0) { [void]$startedMySql.WaitForExit(30000); Write-Log 'Stopped MySQL again.' }
        else { Write-Log "Could not stop MySQL after the backup: $($r.Error)" }
    }
    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
}
if ($failed) { exit 1 }
