# Shared by backup-database.ps1 and restore-database.ps1. Dot-source it; keep this file ASCII for Windows PowerShell 5.1.

# DB settings come from the app's own config so they live in one place.
function Read-DbConfig([string]$XamppRoot, [string]$ConfigPath) {
    $code = '$c=require $argv[1];echo json_encode($c[''db'']);'
    $json = & (Join-Path $XamppRoot 'php\php.exe') -r $code $ConfigPath
    if ($LASTEXITCODE -ne 0 -or -not $json) { throw "Could not read $ConfigPath" }
    return ($json -join '') | ConvertFrom-Json
}

# Runs a command-line tool and returns its exit code and error text. Native stderr stays out of PowerShell's error stream.
function Invoke-Tool([string]$Exe, [string[]]$ToolArgs) {
    $errFile = [IO.Path]::GetTempFileName()
    $outFile = [IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $Exe -ArgumentList $ToolArgs -Wait -PassThru -NoNewWindow -RedirectStandardError $errFile -RedirectStandardOutput $outFile
        return [pscustomobject]@{
            ExitCode = $p.ExitCode
            Error    = (Get-Content $errFile -Raw)
            Output   = (Get-Content $outFile -Raw)
        }
    } finally {
        Remove-Item $errFile, $outFile -ErrorAction SilentlyContinue
    }
}

# Answers even when the login is refused, so this only tests that the server is up.
function Test-MySqlUp([string]$BinDir, [int]$Port) {
    $r = Invoke-Tool (Join-Path $BinDir 'mysqladmin.exe') @('--host=127.0.0.1', "--port=$Port", '--user=root', '--connect-timeout=3', 'ping')
    return $r.ExitCode -eq 0
}
