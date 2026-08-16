param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)

if ($processIds.Count -eq 0) {
  Write-Host "Port $Port is not in use. The development service is already stopped."
  exit 0
}

foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    continue
  }

  Write-Host "Stopping $($process.ProcessName) (PID $processId) on port $Port..."
  Stop-Process -Id $processId -Force
}

Start-Sleep -Milliseconds 300

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Write-Error "Port $Port is still in use."
  exit 1
}

Write-Host "Development service on port $Port has stopped."
