# bloom-search.ps1 - Context-efficient search for Bloom codebase
# Uses ripgrep (rg) for fast searching
# Usage: .\bloom-search.ps1 <command> [args]

param(
    [Parameter(Position=0)]
    [string]$Command,
    
    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$Args
)

$BloomRoot = "C:\Users\Zachg\Development\Games\Bloom"
$ScriptsPath = "$BloomRoot\Assets\Scripts"

# Check for ripgrep (use full path since shell may not have updated PATH yet)
$rgPath = "C:\Users\Zachg\AppData\Local\Microsoft\WinGet\Packages\BurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\ripgrep-15.1.0-x86_64-pc-windows-msvc\rg.exe"
$rg = Get-Command rg -ErrorAction SilentlyContinue
if ($rg) {
    $rgPath = $rg.Source
    $useRg = $true
} elseif (Test-Path $rgPath) {
    $useRg = $true
} else {
    Write-Host "ripgrep not found. Falling back to Select-String (slower)." -ForegroundColor Yellow
    $useRg = $false
}

function Search-Pattern {
    param([string]$Pattern, [int]$Context = 0, [int]$MaxCount = 100)
    if ($useRg) {
        $rgArgs = @("--type", "cs", "--max-count", $MaxCount, "-n", $Pattern, $ScriptsPath)
        if ($Context -gt 0) { $rgArgs = @("--type", "cs", "--max-count", $MaxCount, "-n", "-C", $Context, $Pattern, $ScriptsPath) }
        & $rgPath @rgArgs
    } else {
        Get-ChildItem -Path $ScriptsPath -Recurse -Filter "*.cs" | 
            Select-String -Pattern $Pattern -Context $Context |
            Select-Object -First $MaxCount |
            ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }
    }
}

function Search-Count {
    param([string]$Pattern)
    if ($useRg) {
        $results = & $rgPath --type cs -c $Pattern $ScriptsPath 2>$null
        $total = ($results | ForEach-Object { [int]($_ -split ':')[-1] } | Measure-Object -Sum).Sum
        Write-Host "Total matches: $total"
        $results | Sort-Object { [int]($_ -split ':')[-1] } -Descending | Select-Object -First 20
    } else {
        Get-ChildItem -Path $ScriptsPath -Recurse -Filter "*.cs" | 
            Select-String -Pattern $Pattern | 
            Group-Object Path | 
            Sort-Object Count -Descending |
            Select-Object Count, @{N='File';E={$_.Name.Replace($BloomRoot + '\', '')}} -First 20
    }
}

function Find-Class {
    param([string]$ClassName)
    Search-Pattern "class\s+$ClassName"
}

function Find-Enum {
    param([string]$EnumName)
    Search-Pattern "enum\s+$EnumName"
}

function Find-Interface {
    param([string]$InterfaceName)
    Search-Pattern "interface\s+$InterfaceName"
}

function Find-TODO {
    Search-Pattern "TODO|FIXME|HACK|XXX"
}

function Find-AntiPattern {
    param([string]$Type = "all")
    switch ($Type) {
        "find" { 
            Write-Host "=== FindObjectOfType usages ===" -ForegroundColor Yellow
            Search-Pattern "FindObjectOfType|FindObjectsOfType|FindFirstObjectByType"
        }
        "gameobjectfind" {
            Write-Host "=== GameObject.Find usages ===" -ForegroundColor Yellow
            Search-Pattern "GameObject\.Find\(|GameObject\.FindWithTag"
        }
        "singleton" { 
            Write-Host "=== Singleton patterns ===" -ForegroundColor Yellow
            Search-Pattern "static\s+\w+\s+Instance\s*[{;=]"
        }
        "asyncvoid" { 
            Write-Host "=== async void methods ===" -ForegroundColor Yellow
            Search-Pattern "async\s+void\s+\w+"
        }
        default { 
            Write-Host "=== All Anti-Patterns ===" -ForegroundColor Cyan
            Write-Host "`n--- FindObjectOfType ---" -ForegroundColor Yellow
            Search-Count "FindObjectOfType|FindFirstObjectByType"
            Write-Host "`n--- GameObject.Find ---" -ForegroundColor Yellow
            Search-Count "GameObject\.Find"
            Write-Host "`n--- async void ---" -ForegroundColor Yellow
            Search-Pattern "async\s+void\s+\w+"
        }
    }
}

function Get-FileStats {
    param([string]$Path)
    $fullPath = if ($Path.StartsWith("Assets")) { "$BloomRoot\$Path" } else { $Path }
    if (-not (Test-Path $fullPath)) {
        Write-Host "File not found: $fullPath" -ForegroundColor Red
        return
    }
    $content = Get-Content $fullPath
    [PSCustomObject]@{
        Path = $Path
        Lines = $content.Count
        Classes = ($content | Select-String -Pattern "^\s*(public|private|internal)?\s*(abstract|sealed|partial)?\s*class\s+" | Measure-Object).Count
        Interfaces = ($content | Select-String -Pattern "^\s*(public|private|internal)?\s*interface\s+" | Measure-Object).Count
        Methods = ($content | Select-String -Pattern "^\s*(public|private|protected|internal)\s+(static\s+|virtual\s+|override\s+|async\s+)*\w+\s+\w+\s*\(" | Measure-Object).Count
        TODOs = ($content | Select-String -Pattern "TODO|FIXME" | Measure-Object).Count
    } | Format-List
}

function List-Folder {
    param([string]$Folder, [int]$Top = 20)
    Get-ChildItem -Path "$ScriptsPath\*$Folder*" -Recurse -Filter "*.cs" -ErrorAction SilentlyContinue |
        ForEach-Object {
            $lines = (Get-Content $_.FullName | Measure-Object -Line).Lines
            [PSCustomObject]@{
                Lines = $lines
                Name = $_.Name
                RelPath = $_.FullName.Replace("$BloomRoot\", "")
            }
        } | Sort-Object Lines -Descending | Select-Object -First $Top | Format-Table -AutoSize
}

function List-Large {
    param([int]$MinLines = 500)
    Get-ChildItem -Path $ScriptsPath -Recurse -Filter "*.cs" |
        ForEach-Object {
            $lines = (Get-Content $_.FullName | Measure-Object -Line).Lines
            if ($lines -ge $MinLines) {
                [PSCustomObject]@{
                    Lines = $lines
                    File = $_.FullName.Replace("$BloomRoot\", "")
                }
            }
        } | Sort-Object Lines -Descending | Format-Table -AutoSize
}

function Show-Context {
    param([string]$File, [int]$Line, [int]$Context = 5)
    $fullPath = if ($File.StartsWith("Assets")) { "$BloomRoot\$File" } else { $File }
    $start = [Math]::Max(1, $Line - $Context)
    $content = Get-Content $fullPath -TotalCount ($Line + $Context) | Select-Object -Skip ($start - 1)
    $lineNum = $start
    foreach ($l in $content) {
        $prefix = if ($lineNum -eq $Line) { ">>>" } else { "   " }
        Write-Host "$prefix $lineNum : $l" -ForegroundColor $(if($lineNum -eq $Line){"Yellow"}else{"Gray"})
        $lineNum++
    }
}

# Command dispatch
switch ($Command) {
    "search" { Search-Pattern $Args[0] }
    "count" { Search-Count $Args[0] }
    "class" { Find-Class $Args[0] }
    "enum" { Find-Enum $Args[0] }
    "interface" { Find-Interface $Args[0] }
    "todo" { Find-TODO }
    "anti" { Find-AntiPattern $Args[0] }
    "stats" { Get-FileStats $Args[0] }
    "folder" { List-Folder $Args[0] }
    "large" { List-Large $(if($Args[0]){[int]$Args[0]}else{500}) }
    "context" { Show-Context $Args[0] ([int]$Args[1]) $(if($Args[2]){[int]$Args[2]}else{5}) }
    "help" {
        Write-Host @"
Bloom Search Tool - Fast context-efficient codebase search (uses ripgrep)

Commands:
  search <pattern>       Search for regex pattern in all .cs files
  count <pattern>        Count matches per file, show top 20
  class <name>           Find class definition
  enum <name>            Find enum definition  
  interface <name>       Find interface definition
  todo                   Find all TODO/FIXME/HACK comments
  anti [type]            Find anti-patterns (find|gameobjectfind|singleton|asyncvoid|all)
  stats <path>           Get file statistics (lines, classes, methods)
  folder <name>          List files in folder with line counts
  large [minLines]       List all files over N lines (default 500)
  context <file> <line>  Show source context around a line
  help                   Show this help

Examples:
  .\bloom-search.ps1 search "FactionType"
  .\bloom-search.ps1 count "ServiceLocator"
  .\bloom-search.ps1 class "WeatherSystem"
  .\bloom-search.ps1 anti find
  .\bloom-search.ps1 folder Networking
  .\bloom-search.ps1 large 1000
  .\bloom-search.ps1 context "Assets\Scripts\Core\ServiceLocator.cs" 50
"@
    }
    default {
        Write-Host "Unknown command '$Command'. Use 'help' for usage." -ForegroundColor Red
    }
}
