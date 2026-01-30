$namespaces = @{}

Get-ChildItem -Recurse -Filter "*.cs" | ForEach-Object {
    $content = Get-Content $_.FullName
    $ns = $content | Where-Object { $_ -match "namespace\s+(\S+)" } | ForEach-Object {
        if ($_ -match "namespace\s+(\S+)") {
            $matches[1]
        }
    }
    
    if ($ns) {
        $file = $_.FullName
        $ns | ForEach-Object {
            if (-not $namespaces.ContainsKey($_)) {
                $namespaces[$_] = @()
            }
            $namespaces[$_] += $file
        }
    }
}

$report = "# Namespace Analysis`n`n"
$report += "## Namespace Distribution`n`n"
$report += "| Namespace | File Count | Files |`n"
$report += "|----------|------------|-------|`n"

foreach ($ns in $namespaces.Keys | Sort-Object) {
    $fileCount = $namespaces[$ns].Count
    $fileList = $namespaces[$ns] -join "; "
    $report += "| $ns | $fileCount | $fileList |`n"
}

$report | Out-File "memory/bloom-audit/namespace-report.md"