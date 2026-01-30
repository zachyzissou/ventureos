# Bloom Git Workflow (Agents)

**Always follow this pattern to avoid rebase conflicts.**

## Before Starting Work
```powershell
cd C:\Users\Zachg\Development\Games\Bloom
git fetch origin
git checkout origin/master
git checkout -b <branch-name>
```

## Before Pushing
```powershell
git fetch origin
git rebase origin/master
# If conflicts, resolve them
git push origin <branch-name>
```

## Creating PR
```powershell
gh pr create --title "..." --body "..." --repo zachyzissou/Bloom
```

## Key Rules
1. **Never branch from local master** — always `origin/master`
2. **Always rebase before push** — catches any merges that happened while working
3. **If rebase fails**, resolve conflicts before pushing

This prevents the "PR needs rebase" problem.
