# Lore Touchpoint Search Script
$projectPath = "C:\Users\Zachg\Development\Games\Bloom"
$outputPath = "C:\Users\Zachg\clawd\memory\bloom-audit\lore-search-results.json"

$results = @{}

# Define search terms
$searchTerms = @{
    # Canonical Factions
    "Directorate" = "Directorate|Sky.?Bastion|FCT_DIR"
    "Vultures" = "Vulture|Iron.?Vulture|FCT_VUL"
    "Wardens" = "Warden|Truce.?Warden|Civic.?Warden|FCT_WAR|FCT_CWD"
    "Nomads" = "Nomad|Nomad.?Clan|FCT_NOM|Roadborn"
    "Free77" = "Free.?77|FCT_F77|SeventySeven"
    "Archive" = "Obsidian.?Archive|Vault.?Lexicon|FCT_VAR"
    "Trivector" = "Trivector|Pact.?of.?Ash"
    
    # Lore Terms
    "Harvester" = "Harvester|Harrower|Skimmer"
    "Monolith" = "Monolith"
    "Cascade" = "Cascade"
    "IEZ" = "IEZ|Industrial.?Exclusion.?Zone|Dead.?Sky"
    "BlackVault" = "Black.?Vault|Deep.?Vault"
    
    # Deprecated Terms
    "DEPRECATED_ApexDynamics" = "ApexDynamics|Apex.?Dynamics"
    "DEPRECATED_GhostProtocol" = "GhostProtocol|Ghost.?Protocol"
    "DEPRECATED_Northstar" = "NorthstarPMC|Northstar.?PMC|NStar"
    "DEPRECATED_Syndicate" = "Syndicate"
    "DEPRECATED_OldFactions" = "Echelon|Remnants|Collective"
}

$fileExtensions = @("*.cs", "*.md", "*.json", "*.asset", "*.prefab", "*.txt")

foreach ($term in $searchTerms.Keys) {
    Write-Host "Searching for: $term"
    $pattern = $searchTerms[$term]
    
    $files = @()
    foreach ($ext in $fileExtensions) {
        $matches = Get-ChildItem -Path $projectPath -Include $ext -Recurse -File -ErrorAction SilentlyContinue | 
            Select-String -Pattern $pattern -CaseSensitive:$false -List -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty Path
        if ($matches) { $files += $matches }
    }
    
    $results[$term] = @{
        "count" = $files.Count
        "files" = ($files | ForEach-Object { $_.Replace($projectPath + "\", "") }) | Sort-Object -Unique
    }
}

$results | ConvertTo-Json -Depth 4 | Out-File -FilePath $outputPath -Encoding UTF8
Write-Host "Results saved to: $outputPath"
