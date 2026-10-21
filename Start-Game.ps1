param([int]$Port = 4173, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'dist'
if (-not (Test-Path (Join-Path $root 'index.html'))) {
    Write-Host 'Build not found. Run npm install and npm run build first.' -ForegroundColor Yellow
    Read-Host 'Press Enter to exit'
    exit 1
}
$root = [IO.Path]::GetFullPath($root)
$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } catch {
    Write-Host "Port $Port is unavailable. Try: .\Start-Game.ps1 -Port 4174" -ForegroundColor Yellow
    exit 1
}
Write-Host "Bug War: http://127.0.0.1:$Port/" -ForegroundColor Green
Write-Host 'Offline local server. Keep this window open; Ctrl+C to stop. No Node.js required.'
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port/" }
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.svg'='image/svg+xml'; '.wav'='audio/wav'; '.png'='image/png'; '.json'='application/json' }
try {
    while ($true) {
        if (-not $listener.Pending()) { Start-Sleep -Milliseconds 12; continue }
        $client = $listener.AcceptTcpClient()
        $client.ReceiveTimeout = 3000; $client.SendTimeout = 5000
        try {
            $stream = $client.GetStream()
            $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
            $request = $reader.ReadLine()
            if (-not $request) { continue }
            $headersComplete = $false
            while ($true) {
                $line = $reader.ReadLine()
                if ($null -eq $line) { break }
                if ($line -eq '') { $headersComplete = $true; break }
            }
            if (-not $headersComplete) { continue }
            $parts = $request.Split(' ')
            $url = [Uri]::UnescapeDataString($parts[1].Split('?')[0])
            if ($url.EndsWith('/')) { $url += 'index.html' }
            $file = [IO.Path]::GetFullPath((Join-Path $root $url.TrimStart('/').Replace('/', '\')))
            $body = [byte[]]@(); $status = '404 Not Found'; $type = 'text/plain'
            if ($file.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and [IO.File]::Exists($file)) {
                $body = [IO.File]::ReadAllBytes($file); $status = '200 OK'
                $extension = [IO.Path]::GetExtension($file)
                if ($mime.ContainsKey($extension)) { $type = $mime[$extension] } else { $type = 'application/octet-stream' }
            }
            $header = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`n`r`n")
            $stream.Write($header, 0, $header.Length)
            if ($parts[0] -ne 'HEAD') { $stream.Write($body, 0, $body.Length) }
            $stream.Flush()
        } catch { Write-Verbose $_ } finally { $client.Close() }
    }
} finally { $listener.Stop() }
