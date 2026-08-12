# Serve SHADOWKO locally (ES modules need HTTP)
# Usage: powershell -ExecutionPolicy Bypass -File .\serve.ps1

param([int]$Port = 8080)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Could not bind $prefix — is the port in use?" -ForegroundColor Red
  throw
}

Write-Host "SHADOWKO running at $prefix" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop."

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".mjs"  = "text/javascript; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".json" = "application/json"
  ".webmanifest" = "application/manifest+json"
  ".ico"  = "image/x-icon"
  ".md"   = "text/markdown; charset=utf-8"
  ".txt"  = "text/plain; charset=utf-8"
}

function Send-Bytes([System.Net.HttpListenerResponse]$res, [int]$status, [string]$contentType, [byte[]]$bytes) {
  $res.StatusCode = $status
  $res.ContentType = $contentType
  $res.Headers["X-Content-Type-Options"] = "nosniff"
  $res.Headers["Cache-Control"] = if ($contentType -like "text/html*") { "no-cache" } else { "public, max-age=60" }
  $res.ContentLength64 = $bytes.LongLength
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    try {
      $path = [Uri]::UnescapeDataString($req.Url.LocalPath.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
      $path = $path -replace "/", [System.IO.Path]::DirectorySeparatorChar

      $full = [System.IO.Path]::GetFullPath((Join-Path $root $path))
      $rootPrefix = $root.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
      if (-not ($full.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -or
                $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase))) {
        Send-Bytes $res 403 "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Forbidden"))
        continue
      }

      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Send-Bytes $res 404 "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
        continue
      }

      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      Send-Bytes $res 200 $type ([System.IO.File]::ReadAllBytes($full))
    } catch {
      try {
        Send-Bytes $res 500 "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Server error"))
      } catch { }
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
