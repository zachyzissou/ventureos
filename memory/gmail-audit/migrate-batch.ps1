#!/usr/bin/env pwsh
# Gmail Migration Script - Batch processor
param(
    [string]$SourceLabel,
    [string]$TargetLabelId,
    [string]$SourceLabelId,
    [int]$DelaySeconds = 2,
    [int]$MaxThreads = 500
)

$env:GOG_ACCOUNT = "zachgonser@gmail.com"
$gog = "C:\Users\Zachg\.local\bin\gog.exe"

Write-Host "=== Gmail Migration Batch ===" -ForegroundColor Cyan
Write-Host "Source: $SourceLabel" -ForegroundColor Yellow
Write-Host "Add Label: $TargetLabelId" -ForegroundColor Green
Write-Host "Remove Label: $SourceLabelId" -ForegroundColor Red
Write-Host ""

# Search for threads with the source label
Write-Host "Searching for threads with label: $SourceLabel..." -ForegroundColor Cyan
$searchResult = & $gog gmail search "label:$SourceLabel" --account=zachgonser@gmail.com --max=$MaxThreads --plain 2>&1

# Parse thread IDs (first column in plain output)
$lines = $searchResult -split "`n" | Where-Object { $_ -match "^[0-9a-f]{16}" }
$threadIds = $lines | ForEach-Object { ($_ -split "\s+")[0] }

Write-Host "Found $($threadIds.Count) threads to migrate" -ForegroundColor Yellow
Write-Host ""

$migrated = 0
$errors = 0

foreach ($threadId in $threadIds) {
    try {
        Write-Host "[$($migrated + 1)/$($threadIds.Count)] Migrating $threadId..." -NoNewline
        
        $result = & $gog gmail thread modify $threadId --add=$TargetLabelId --remove=$SourceLabelId --account=zachgonser@gmail.com 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host " OK" -ForegroundColor Green
            $migrated++
        } else {
            Write-Host " FAILED: $result" -ForegroundColor Red
            $errors++
        }
        
        # Rate limit delay
        Start-Sleep -Seconds $DelaySeconds
    }
    catch {
        Write-Host " ERROR: $_" -ForegroundColor Red
        $errors++
    }
}

Write-Host ""
Write-Host "=== Migration Complete ===" -ForegroundColor Cyan
Write-Host "Migrated: $migrated" -ForegroundColor Green
Write-Host "Errors: $errors" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Green" })

return @{
    Migrated = $migrated
    Errors = $errors
    Total = $threadIds.Count
}
