#!/bin/bash
# Setup GitHub Project Board for Dashboard → VentureOS Integration
#
# Prerequisites:
#   gh auth refresh -h github.com -s project,read:project
#
# Usage:
#   ./scripts/setup-dashboard-merge-project.sh

set -euo pipefail

OWNER="zachyzissou"
REPO="zachyzissou/ventureos"

echo "=== Dashboard → VentureOS Integration — Project Board Setup ==="
echo ""

# Check auth scopes
echo "Checking GitHub auth scopes..."
if ! gh api graphql -f query='query { viewer { login } }' &>/dev/null; then
  echo "ERROR: GitHub auth issue. Run: gh auth refresh -h github.com -s project,read:project"
  exit 1
fi

# 1. Create the project
echo ""
echo "1. Creating project..."
PROJECT_JSON=$(gh project create --owner "$OWNER" --title "Dashboard → VentureOS Integration" --format json)
PROJECT_NUMBER=$(echo "$PROJECT_JSON" | jq -r '.number')
echo "   Created project #${PROJECT_NUMBER}"

# Get owner ID
OWNER_ID=$(gh api graphql -f query='query { user(login: "'"$OWNER"'") { id } }' --jq '.data.user.id')

# Get project ID
PROJECT_ID=$(gh api graphql -f query='
  query {
    user(login: "'"$OWNER"'") {
      projectV2(number: '"$PROJECT_NUMBER"') {
        id
      }
    }
  }
' --jq '.data.user.projectV2.id')

echo "   Project ID: ${PROJECT_ID}"

# 2. Create custom fields
echo ""
echo "2. Creating custom fields..."

# Phase field (single select)
PHASE_FIELD_ID=$(gh api graphql -f query='
  mutation {
    createProjectV2Field(input: {
      projectId: "'"$PROJECT_ID"'"
      dataType: SINGLE_SELECT
      name: "Phase"
      singleSelectOptions: [
        {name: "Analysis", color: BLUE, description: "Research and analysis phase"}
        {name: "Build", color: GREEN, description: "Implementation phase"}
        {name: "Test", color: YELLOW, description: "Testing and validation phase"}
        {name: "Deploy", color: PURPLE, description: "Deployment phase"}
      ]
    }) {
      projectV2Field {
        ... on ProjectV2SingleSelectField {
          id
        }
      }
    }
  }
' --jq '.data.createProjectV2Field.projectV2Field.id')
echo "   Phase field: ${PHASE_FIELD_ID}"

# Effort field (single select)
EFFORT_FIELD_ID=$(gh api graphql -f query='
  mutation {
    createProjectV2Field(input: {
      projectId: "'"$PROJECT_ID"'"
      dataType: SINGLE_SELECT
      name: "Effort"
      singleSelectOptions: [
        {name: "Small", color: GREEN, description: "1-2 hours"}
        {name: "Medium", color: YELLOW, description: "3-5 hours"}
        {name: "Large", color: RED, description: "6+ hours"}
      ]
    }) {
      projectV2Field {
        ... on ProjectV2SingleSelectField {
          id
        }
      }
    }
  }
' --jq '.data.createProjectV2Field.projectV2Field.id')
echo "   Effort field: ${EFFORT_FIELD_ID}"

# Agent field (single select)
AGENT_FIELD_ID=$(gh api graphql -f query='
  mutation {
    createProjectV2Field(input: {
      projectId: "'"$PROJECT_ID"'"
      dataType: SINGLE_SELECT
      name: "Agent"
      singleSelectOptions: [
        {name: "Oracle", color: BLUE, description: "Research & analysis"}
        {name: "Atlas", color: PURPLE, description: "Architecture & planning"}
        {name: "Synth", color: GREEN, description: "Implementation"}
        {name: "Archivist", color: YELLOW, description: "Documentation"}
        {name: "Multiple", color: GRAY, description: "Multiple agents"}
      ]
    }) {
      projectV2Field {
        ... on ProjectV2SingleSelectField {
          id
        }
      }
    }
  }
' --jq '.data.createProjectV2Field.projectV2Field.id')
echo "   Agent field: ${AGENT_FIELD_ID}"

# Blocker field (single select yes/no)
BLOCKER_FIELD_ID=$(gh api graphql -f query='
  mutation {
    createProjectV2Field(input: {
      projectId: "'"$PROJECT_ID"'"
      dataType: SINGLE_SELECT
      name: "Blocker"
      singleSelectOptions: [
        {name: "Yes", color: RED, description: "Has blocking dependency"}
        {name: "No", color: GREEN, description: "Ready to proceed"}
      ]
    }) {
      projectV2Field {
        ... on ProjectV2SingleSelectField {
          id
        }
      }
    }
  }
' --jq '.data.createProjectV2Field.projectV2Field.id')
echo "   Blocker field: ${BLOCKER_FIELD_ID}"

# 3. Get the Status field (built-in) and configure columns
echo ""
echo "3. Configuring board columns..."

# Get the Status field ID and its options
STATUS_FIELD_JSON=$(gh api graphql -f query='
  query {
    node(id: "'"$PROJECT_ID"'") {
      ... on ProjectV2 {
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options {
              id
              name
            }
          }
        }
      }
    }
  }
')
STATUS_FIELD_ID=$(echo "$STATUS_FIELD_JSON" | jq -r '.data.node.field.id')
echo "   Status field: ${STATUS_FIELD_ID}"

# Delete default options and create custom ones
# Note: GitHub Projects v2 default statuses are "Todo", "In Progress", "Done"
# We need to update them to our custom columns

# We'll update existing and add new columns via the API
# Unfortunately, GitHub GraphQL doesn't have a clean "replace all options" mutation
# We'll use updateProjectV2Field to set custom options

gh api graphql -f query='
  mutation {
    updateProjectV2Field(input: {
      fieldId: "'"$STATUS_FIELD_ID"'"
      singleSelectOptions: [
        {name: "📋 Backlog", color: GRAY, description: "Not started"}
        {name: "🔍 Analysis", color: BLUE, description: "Under analysis"}
        {name: "📝 Planning", color: PURPLE, description: "Being planned"}
        {name: "🏗️ Ready to Build", color: ORANGE, description: "Ready for implementation"}
        {name: "🚧 In Progress", color: YELLOW, description: "Actively being worked on"}
        {name: "🧪 Testing", color: PINK, description: "In testing/validation"}
        {name: "✅ Done", color: GREEN, description: "Complete"}
      ]
    }) {
      projectV2Field {
        ... on ProjectV2SingleSelectField {
          id
          options {
            id
            name
          }
        }
      }
    }
  }
' > /dev/null
echo "   Board columns configured"

# 4. Add issues to project
echo ""
echo "4. Adding issues to project..."

ISSUES=(75 76 77 78 79 80 81 82 83 84)
ISSUE_ITEM_IDS=()

for ISSUE_NUM in "${ISSUES[@]}"; do
  # Get issue node ID
  ISSUE_NODE_ID=$(gh api "repos/${REPO}/issues/${ISSUE_NUM}" --jq '.node_id')
  
  # Add to project
  ITEM_ID=$(gh api graphql -f query='
    mutation {
      addProjectV2ItemById(input: {
        projectId: "'"$PROJECT_ID"'"
        contentId: "'"$ISSUE_NODE_ID"'"
      }) {
        item {
          id
        }
      }
    }
  ' --jq '.data.addProjectV2ItemById.item.id')
  
  ISSUE_ITEM_IDS+=("$ISSUE_NUM:$ITEM_ID")
  echo "   Added #${ISSUE_NUM} → ${ITEM_ID}"
done

# 5. Set field values for each issue
echo ""
echo "5. Setting field values..."

# Re-fetch status options to get IDs
STATUS_OPTIONS=$(gh api graphql -f query='
  query {
    node(id: "'"$PROJECT_ID"'") {
      ... on ProjectV2 {
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }
  }
' --jq '.data.node.field.options')

# Get option IDs
BACKLOG_ID=$(echo "$STATUS_OPTIONS" | jq -r '.[] | select(.name | contains("Backlog")) | .id')
ANALYSIS_ID=$(echo "$STATUS_OPTIONS" | jq -r '.[] | select(.name | contains("Analysis")) | .id')
PLANNING_ID=$(echo "$STATUS_OPTIONS" | jq -r '.[] | select(.name | contains("Planning")) | .id')
READY_ID=$(echo "$STATUS_OPTIONS" | jq -r '.[] | select(.name | contains("Ready")) | .id')

# Get Phase option IDs
PHASE_OPTIONS=$(gh api graphql -f query='
  query {
    node(id: "'"$PROJECT_ID"'") {
      ... on ProjectV2 {
        field(name: "Phase") {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }
  }
' --jq '.data.node.field.options')

PHASE_ANALYSIS=$(echo "$PHASE_OPTIONS" | jq -r '.[] | select(.name == "Analysis") | .id')
PHASE_BUILD=$(echo "$PHASE_OPTIONS" | jq -r '.[] | select(.name == "Build") | .id')
PHASE_TEST=$(echo "$PHASE_OPTIONS" | jq -r '.[] | select(.name == "Test") | .id')
PHASE_DEPLOY=$(echo "$PHASE_OPTIONS" | jq -r '.[] | select(.name == "Deploy") | .id')

# Get Effort option IDs
EFFORT_OPTIONS=$(gh api graphql -f query='
  query {
    node(id: "'"$PROJECT_ID"'") {
      ... on ProjectV2 {
        field(name: "Effort") {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }
  }
' --jq '.data.node.field.options')

EFFORT_SMALL=$(echo "$EFFORT_OPTIONS" | jq -r '.[] | select(.name == "Small") | .id')
EFFORT_MEDIUM=$(echo "$EFFORT_OPTIONS" | jq -r '.[] | select(.name == "Medium") | .id')
EFFORT_LARGE=$(echo "$EFFORT_OPTIONS" | jq -r '.[] | select(.name == "Large") | .id')

# Get Agent option IDs
AGENT_OPTIONS=$(gh api graphql -f query='
  query {
    node(id: "'"$PROJECT_ID"'") {
      ... on ProjectV2 {
        field(name: "Agent") {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }
  }
' --jq '.data.node.field.options')

AGENT_ORACLE=$(echo "$AGENT_OPTIONS" | jq -r '.[] | select(.name == "Oracle") | .id')
AGENT_ATLAS=$(echo "$AGENT_OPTIONS" | jq -r '.[] | select(.name == "Atlas") | .id')
AGENT_SYNTH=$(echo "$AGENT_OPTIONS" | jq -r '.[] | select(.name == "Synth") | .id')
AGENT_ARCHIVIST=$(echo "$AGENT_OPTIONS" | jq -r '.[] | select(.name == "Archivist") | .id')
AGENT_MULTIPLE=$(echo "$AGENT_OPTIONS" | jq -r '.[] | select(.name == "Multiple") | .id')

# Get Blocker option IDs
BLOCKER_OPTIONS=$(gh api graphql -f query='
  query {
    node(id: "'"$PROJECT_ID"'") {
      ... on ProjectV2 {
        field(name: "Blocker") {
          ... on ProjectV2SingleSelectField {
            options { id name }
          }
        }
      }
    }
  }
' --jq '.data.node.field.options')

BLOCKER_YES=$(echo "$BLOCKER_OPTIONS" | jq -r '.[] | select(.name == "Yes") | .id')
BLOCKER_NO=$(echo "$BLOCKER_OPTIONS" | jq -r '.[] | select(.name == "No") | .id')

# Helper function to set field value
set_field() {
  local ITEM_ID="$1"
  local FIELD_ID="$2"
  local OPTION_ID="$3"
  
  gh api graphql -f query='
    mutation {
      updateProjectV2ItemFieldValue(input: {
        projectId: "'"$PROJECT_ID"'"
        itemId: "'"$ITEM_ID"'"
        fieldId: "'"$FIELD_ID"'"
        value: {singleSelectOptionId: "'"$OPTION_ID"'"}
      }) {
        projectV2Item { id }
      }
    }
  ' > /dev/null
}

# Find item ID for an issue number
get_item_id() {
  local ISSUE_NUM="$1"
  for pair in "${ISSUE_ITEM_IDS[@]}"; do
    if [[ "$pair" == "${ISSUE_NUM}:"* ]]; then
      echo "${pair#*:}"
      return
    fi
  done
}

# Set values for each issue
# #75 - Repo Structure: Ready to Build, Build phase, Small, Atlas, No blocker
ITEM=$(get_item_id 75)
set_field "$ITEM" "$STATUS_FIELD_ID" "$READY_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_BUILD"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_SMALL"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_ATLAS"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_NO"
echo "   #75 configured"

# #76 - Code Migration: Backlog, Build phase, Large, Synth, blocked by #75
ITEM=$(get_item_id 76)
set_field "$ITEM" "$STATUS_FIELD_ID" "$BACKLOG_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_BUILD"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_LARGE"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_SYNTH"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_YES"
echo "   #76 configured"

# #77 - Build Pipeline: Backlog, Build phase, Medium, Multiple, blocked by #75/#76
ITEM=$(get_item_id 77)
set_field "$ITEM" "$STATUS_FIELD_ID" "$BACKLOG_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_BUILD"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_MEDIUM"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_MULTIPLE"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_YES"
echo "   #77 configured"

# #78 - API Integration: Backlog, Build phase, Medium, Synth, blocked
ITEM=$(get_item_id 78)
set_field "$ITEM" "$STATUS_FIELD_ID" "$BACKLOG_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_BUILD"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_MEDIUM"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_SYNTH"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_YES"
echo "   #78 configured"

# #79 - Shared Libraries: Backlog, Build phase, Medium, Synth, blocked
ITEM=$(get_item_id 79)
set_field "$ITEM" "$STATUS_FIELD_ID" "$BACKLOG_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_BUILD"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_MEDIUM"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_SYNTH"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_YES"
echo "   #79 configured"

# #80 - Testing: Backlog, Test phase, Large, Multiple, blocked
ITEM=$(get_item_id 80)
set_field "$ITEM" "$STATUS_FIELD_ID" "$BACKLOG_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_TEST"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_LARGE"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_MULTIPLE"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_YES"
echo "   #80 configured"

# #81 - Deployment: Backlog, Deploy phase, Medium, Multiple, blocked
ITEM=$(get_item_id 81)
set_field "$ITEM" "$STATUS_FIELD_ID" "$BACKLOG_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_DEPLOY"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_MEDIUM"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_MULTIPLE"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_YES"
echo "   #81 configured"

# #82 - Documentation: Backlog, Deploy phase, Large, Archivist, blocked
ITEM=$(get_item_id 82)
set_field "$ITEM" "$STATUS_FIELD_ID" "$BACKLOG_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_DEPLOY"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_LARGE"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_ARCHIVIST"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_YES"
echo "   #82 configured"

# #83 - Cleanup: Backlog, Deploy phase, Small, Multiple, blocked
ITEM=$(get_item_id 83)
set_field "$ITEM" "$STATUS_FIELD_ID" "$BACKLOG_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_DEPLOY"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_SMALL"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_MULTIPLE"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_YES"
echo "   #83 configured"

# #84 - Epic: Planning, Analysis phase, Large
ITEM=$(get_item_id 84)
set_field "$ITEM" "$STATUS_FIELD_ID" "$PLANNING_ID"
set_field "$ITEM" "$PHASE_FIELD_ID" "$PHASE_ANALYSIS"
set_field "$ITEM" "$EFFORT_FIELD_ID" "$EFFORT_LARGE"
set_field "$ITEM" "$AGENT_FIELD_ID" "$AGENT_MULTIPLE"
set_field "$ITEM" "$BLOCKER_FIELD_ID" "$BLOCKER_NO"
echo "   #84 configured"

# 6. Print summary
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Project URL: https://github.com/users/${OWNER}/projects/${PROJECT_NUMBER}"
echo ""
echo "Issues added and configured:"
echo "  #84 - Epic (Planning)"
echo "  #75 - Repo Structure (Ready to Build)"
echo "  #76 - Code Migration (Backlog, blocked)"
echo "  #77 - Build Pipeline (Backlog, blocked)"
echo "  #78 - API Integration (Backlog, blocked)"
echo "  #79 - Shared Libraries (Backlog, blocked)"
echo "  #80 - Testing (Backlog, blocked)"
echo "  #81 - Deployment (Backlog, blocked)"
echo "  #82 - Documentation (Backlog, blocked)"
echo "  #83 - Cleanup (Backlog, blocked)"
echo ""
echo "Next steps:"
echo "  1. Visit the project URL and verify the board"
echo "  2. Create additional views (Table, Roadmap) via the UI"
echo "  3. Set up automations via Project Settings → Workflows:"
echo "     - Auto-add issues with 'dashboard-merge' label"
echo "     - Auto-move to 'In Progress' when PR opened"
echo "     - Auto-move to 'Testing' when PR in review"
echo "     - Auto-move to 'Done' when PR merged"
