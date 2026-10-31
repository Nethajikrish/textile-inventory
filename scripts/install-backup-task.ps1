# Sets up the daily backup in Windows Task Scheduler for the current user.
#   Install:  powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1
#   Remove:   powershell -ExecutionPolicy Bypass -File scripts\install-backup-task.ps1 -Uninstall
[CmdletBinding()]
param(
    [string]$BackupDir = 'E:\TextileBackups',
    [string]$DailyAt = '21:00',
    [string]$CopyTo = '',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$taskName = 'Textile Inventory DB Backup'

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Removed task '$taskName'. Existing backups were left in place."
    exit 0
}

$script = Join-Path $PSScriptRoot 'backup-database.ps1'
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -BackupDir `"$BackupDir`" -DailyAt $DailyAt"
if ($CopyTo) { $arguments += " -CopyTo `"$CopyTo`"" }

$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
# The logon run is the catch-up: the script skips it unless the last scheduled backup was missed.
$triggers = @(
    (New-ScheduledTaskTrigger -Daily -At $DailyAt),
    (New-ScheduledTaskTrigger -AtLogOn -User $user)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal `
    -Description 'Daily backup of the textile_inventory database. See README.' -Force | Out-Null

$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Output "Installed task '$taskName'. Next run: $($info.NextRunTime). Backups go to $BackupDir."
