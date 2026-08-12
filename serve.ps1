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
  Write-Host "Could not bind $prefix - is the port in use?" -ForegroundColor Red
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

function Send-Bytes {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$Status,
    [string]$ContentType,
    [byte[]]$Bytes
  )

  $Response.StatusCode = $Status
  $Response.ContentType = $ContentType
  $Response.Headers["X-Content-Type-Options"] = "nosniff"

  if ($ContentType -like "text/html*") {
    $Response.Headers["Cache-Control"] = "no-cache"
  } else {
    $Response.Headers["Cache-Control"] = 'public, max-age=60'
  }

  $Response.ContentLength64 = $Bytes.LongLength
  $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  $Response.Close()
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
        Send-Bytes -Response $res -Status 403 -ContentType "text/plain; charset=utf-8" -Bytes ([Text.Encoding]::UTF8.GetBytes("Forbidden"))
        continue
      }

      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Send-Bytes -Response $res -Status 404 -ContentType "text/plain; charset=utf-8" -Bytes ([Text.Encoding]::UTF8.GetBytes("Not found"))
        continue
      }

      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      Send-Bytes -Response $res -Status 200 -ContentType $type -Bytes ([System.IO.File]::ReadAllBytes($full))
    } catch {
      try {
        Send-Bytes -Response $res -Status 500 -ContentType "text/plain; charset=utf-8" -Bytes ([Text.Encoding]::UTF8.GetBytes("Server error"))
      } catch { }
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
