#Requires -Version 5.1
<#
Starts Centrifugo and a cloudflared quick tunnel, then prints the wss:// address to paste into
Settings -> Multiplayer. See self-hosted-relay.md for what this is doing and why.

Both child processes are stopped when this script exits (Ctrl+C included).
#>

[CmdletBinding()]
param(
    # Centrifugo's http port. Must match http_server.port in config.json.
    [int]$Port = 8000,
    # Path to the Centrifugo config. Defaults to config.json beside this script.
    [string]$Config,
    # cloudflared transport. http2 works where QUIC/UDP is blocked, which is most home routers.
    [ValidateSet('http2', 'quic', 'auto')]
    [string]$Protocol = 'http2'
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Config) { $Config = Join-Path $scriptDir 'config.json' }

# --- binary discovery ---------------------------------------------------------------------------

function Find-Binary {
    param([string]$Name)
    # PATH first, then beside this script, then a bin/ subfolder, so dropping the two exes next to
    # the script works without touching PATH.
    $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    foreach ($dir in @($scriptDir, (Join-Path $scriptDir 'bin'), (Get-Location).Path)) {
        foreach ($ext in @('.exe', '')) {
            $candidate = Join-Path $dir ($Name + $ext)
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { return (Resolve-Path $candidate).Path }
        }
    }
    return $null
}

$centrifugo = Find-Binary 'centrifugo'
$cloudflared = Find-Binary 'cloudflared'

if (-not $centrifugo -or -not $cloudflared) {
    Write-Host ''
    Write-Host 'Missing programs:' -ForegroundColor Yellow
    if (-not $centrifugo) {
        Write-Host '  centrifugo   https://github.com/centrifugal/centrifugo/releases'
    }
    if (-not $cloudflared) {
        Write-Host '  cloudflared  https://github.com/cloudflare/cloudflared/releases'
    }
    Write-Host ''
    Write-Host 'Download the Windows binary for each, unzip it, and put the .exe in:'
    Write-Host "  $scriptDir"
    Write-Host 'or anywhere on PATH. Then run this script again.'
    if (-not $cloudflared) {
        Write-Host ''
        Write-Host 'cloudflared is also on winget:'
        Write-Host '  winget install Cloudflare.cloudflared'
    }
    Write-Host ''
    exit 1
}

if (-not (Test-Path -LiteralPath $Config -PathType Leaf)) {
    Write-Host "config.json not found at $Config" -ForegroundColor Yellow
    Write-Host 'Copy it from relay/centrifugo/ in the repo, or pass -Config <path>.'
    exit 1
}

Write-Host "centrifugo   $centrifugo"
Write-Host "cloudflared  $cloudflared"
Write-Host "config       $Config"
Write-Host ''

# --- process plumbing ---------------------------------------------------------------------------

$logDir = Join-Path ([System.IO.Path]::GetTempPath()) ('nessuvia-relay-' + $PID)
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$centOut = Join-Path $logDir 'centrifugo.out.log'
$centErr = Join-Path $logDir 'centrifugo.err.log'
$cfOut = Join-Path $logDir 'cloudflared.out.log'
$cfErr = Join-Path $logDir 'cloudflared.err.log'

$script:procs = @()

function Stop-Children {
    foreach ($p in $script:procs) {
        if ($p -and -not $p.HasExited) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { }
        }
    }
}

function Test-ARecord {
    # 'found', 'nxdomain', or 'unreachable'. The three mean different things and a bare try/catch
    # collapses them: a query that times out is not evidence the record is missing.
    param([string]$Name, [string]$Server)
    $params = @{ Name = $Name; Type = 'A'; ErrorAction = 'Stop'; DnsOnly = $true; NoHostsFile = $true }
    if ($Server) { $params['Server'] = $Server }
    try {
        $r = Resolve-DnsName @params
        if ($r | Where-Object { $_.Type -eq 'A' -and $_.IPAddress }) { return 'found' }
        return 'nxdomain'
    } catch {
        if ($_.Exception.Message -match 'does not exist') { return 'nxdomain' }
        return 'unreachable'
    }
}

function Read-Log {
    param([string[]]$Paths)
    $text = ''
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path) {
            # Shared read: both files are open for writing by the child process.
            try {
                $stream = [System.IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
                $reader = New-Object System.IO.StreamReader($stream)
                $text += $reader.ReadToEnd()
                $reader.Close()
                $stream.Close()
            } catch { }
        }
    }
    return $text
}

try {
    # --- 1. centrifugo --------------------------------------------------------------------------

    Write-Host 'Starting Centrifugo...'
    $cent = Start-Process -FilePath $centrifugo `
        -ArgumentList @('--config', "`"$Config`"") `
        -WorkingDirectory (Split-Path -Parent $Config) `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $centOut -RedirectStandardError $centErr
    $script:procs += $cent

    $listening = $false
    for ($i = 0; $i -lt 40; $i++) {
        if ($cent.HasExited) { break }
        $probe = New-Object System.Net.Sockets.TcpClient
        try {
            $probe.Connect('127.0.0.1', $Port)
            $listening = $true
        } catch { } finally { $probe.Close() }
        if ($listening) { break }
        Start-Sleep -Milliseconds 250
    }

    if (-not $listening) {
        Write-Host ''
        Write-Host "Centrifugo did not come up on port $Port." -ForegroundColor Red
        Write-Host (Read-Log @($centOut, $centErr))
        exit 1
    }
    Write-Host "  listening on port $Port"

    # --- 2. cloudflared -------------------------------------------------------------------------

    Write-Host 'Starting tunnel...'
    $cfArgs = @('tunnel', '--url', "http://localhost:$Port")
    if ($Protocol -ne 'auto') { $cfArgs = @('tunnel', '--protocol', $Protocol, '--url', "http://localhost:$Port") }
    $cf = Start-Process -FilePath $cloudflared -ArgumentList $cfArgs `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $cfOut -RedirectStandardError $cfErr
    $script:procs += $cf

    # The hostname is printed in a box well before the tunnel actually registers, so wait for both.
    $hostname = $null
    $registered = $false
    for ($i = 0; $i -lt 120; $i++) {
        if ($cf.HasExited) { break }
        $log = Read-Log @($cfOut, $cfErr)
        if (-not $hostname) {
            $m = [regex]::Match($log, 'https://([a-z0-9-]+\.trycloudflare\.com)')
            if ($m.Success) {
                $hostname = $m.Groups[1].Value
                Write-Host "  hostname $hostname"
            }
        }
        if ($log -match 'Registered tunnel connection') { $registered = $true; break }
        Start-Sleep -Milliseconds 500
    }

    if (-not $registered) {
        $log = Read-Log @($cfOut, $cfErr)
        Write-Host ''
        Write-Host 'The tunnel never registered.' -ForegroundColor Red
        if ($log -match 'failed to dial to edge' -or $log -match 'port 7844') {
            Write-Host 'A VPN holding the default route is the usual cause. Exclude cloudflared.exe'
            Write-Host 'from it by executable path, or disconnect for the session.'
            Write-Host 'See the FAQ in self-hosted-relay.md.'
        }
        Write-Host ''
        Write-Host $log
        exit 1
    }
    Write-Host '  registered'

    # --- 3. path check --------------------------------------------------------------------------

    $url = "https://$hostname/connection/websocket"
    $code = $null
    $failure = $null
    for ($i = 0; $i -lt 10; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 10 -UseBasicParsing
            $code = [int]$resp.StatusCode
        } catch [System.Net.WebException] {
            if ($_.Exception.Response) {
                $code = [int]$_.Exception.Response.StatusCode
                $failure = $null
            } else {
                $code = $null
                $failure = $_.Exception.Message
            }
        } catch {
            $code = $null
            $failure = $_.Exception.Message
        }
        # 400 is the success case: Centrifugo rejecting a non-handshake request proves the path
        # reached it. 530 means the edge has the hostname but no tunnel yet, so retry.
        if ($code -eq 400) { break }
        Start-Sleep -Seconds 2
    }

    Write-Host ''
    if ($code -eq 400) {
        Write-Host 'Relay is up.' -ForegroundColor Green
    } elseif ($null -eq $code) {
        # No HTTP response at all: DNS or TLS, not the relay. The browser resolves the same name the
        # same way, so an address that fails here will fail there too. Do not hand it out.
        Write-Host 'The address is not reachable from this machine.' -ForegroundColor Red
        Write-Host "  $failure"
        Write-Host ''
        if ((Test-ARecord $hostname) -ne 'found') {
            Write-Host "$hostname has no IPv4 address on this machine's resolver."
            Write-Host ''
            # Ask a resolver that does no filtering. Three outcomes, and they need different fixes:
            # it has the record (yours is blocking it), it says NXDOMAIN (the name is not published
            # yet), or it cannot be reached at all (something is intercepting outbound DNS).
            $public = Test-ARecord $hostname '1.1.1.1'
            Write-Host 'Current DNS servers:'
            Get-DnsClientServerAddress -AddressFamily IPv4 |
                Where-Object { $_.ServerAddresses } |
                ForEach-Object { Write-Host ("  {0}: {1}" -f $_.InterfaceAlias, ($_.ServerAddresses -join ', ')) }
            Write-Host ''
            switch ($public) {
                'found' {
                    Write-Host '1.1.1.1 has the record, so your DNS server is filtering it.'
                    Write-Host 'Blocklists cover trycloudflare.com subdomains fairly often.'
                    Write-Host 'Point the adapter at an unfiltered resolver, or allowlist the domain'
                    Write-Host 'in whichever service those addresses belong to.'
                }
                'nxdomain' {
                    Write-Host '1.1.1.1 says the name does not exist, so it is not published yet.'
                    Write-Host 'Run this script again for a fresh hostname.'
                }
                default {
                    Write-Host '1.1.1.1 could not be reached, so this check proved nothing about the'
                    Write-Host 'record. A VPN is the usual reason a direct DNS query times out: it'
                    Write-Host 'holds the default route and forces its own resolver, and it does that'
                    Write-Host 'whatever the adapter above is set to. Disconnect it and try again.'
                }
            }
        }
        Write-Host ''
        Write-Host 'Stopping. Nothing to paste.'
        exit 1
    } else {
        $note = switch ($code) {
            530 { 'the tunnel is down' }
            404 { 'the hostname works but the path is wrong' }
            502 { "nothing is listening on port $Port" }
            default { 'unexpected' }
        }
        Write-Host "Path check returned $code ($note). Address printed anyway." -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host 'Paste into Settings -> Multiplayer:'
    Write-Host ''
    Write-Host "  wss://$hostname/connection/websocket" -ForegroundColor Cyan
    Write-Host ''

    try {
        Set-Clipboard -Value "wss://$hostname/connection/websocket"
        Write-Host '(copied to clipboard)'
    } catch { }

    Write-Host ''
    Write-Host 'Leave this window open. Ctrl+C stops both programs.'
    Write-Host "Logs: $logDir"
    Write-Host ''

    while ($true) {
        if ($cent.HasExited) { Write-Host 'Centrifugo exited.' -ForegroundColor Yellow; break }
        if ($cf.HasExited) { Write-Host 'cloudflared exited.' -ForegroundColor Yellow; break }
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host 'Stopping...'
    Stop-Children
}
