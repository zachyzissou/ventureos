#!/usr/bin/env bash
# Fix agent workspace git remotes after GitLab → GitHub migration
# Updates all ventureos repo clones to point to GitHub

set -euo pipefail

GITHUB_REMOTE="https://github.com/zachyzissou/ventureos.git"
DEAD_GITLAB="http://slurpnet:9080/zachgonser/ventureos.git"

echo "🔧 Fixing agent workspace git remotes..."
echo "Target: $GITHUB_REMOTE"
echo ""

for agent_dir in ~/.openclaw/workspace-*/; do
  agent=$(basename "$agent_dir")
  ventureos_dir="${agent_dir}ventureos"
  
  if [ ! -d "$ventureos_dir/.git" ]; then
    echo "⏭️  $agent: No ventureos git repo"
    continue
  fi
  
  cd "$ventureos_dir"
  
  # Check current origin
  current_origin=$(git remote get-url origin 2>/dev/null || echo "none")
  
  if [ "$current_origin" = "$DEAD_GITLAB" ]; then
    echo "🔄 $agent: Updating origin $DEAD_GITLAB → GitHub"
    git remote set-url origin "$GITHUB_REMOTE"
    
    # Add github remote if it doesn't exist
    if ! git remote | grep -q "^github$"; then
      git remote add github "$GITHUB_REMOTE"
    else
      git remote set-url github "$GITHUB_REMOTE"
    fi
    
    echo "✅ $agent: Remotes updated"
  elif [ "$current_origin" = "$GITHUB_REMOTE" ]; then
    echo "✅ $agent: Already pointing to GitHub"
  else
    echo "⚠️  $agent: Unknown origin: $current_origin"
  fi
  
  echo ""
done

echo "🎉 Agent workspace remotes updated"
