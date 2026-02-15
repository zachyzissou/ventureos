#!/bin/bash
# Integrate VentureOS RPG Master Plan into GitLab
# Creates milestones, issues, and links everything together

set -e

GITLAB_URL="http://slurpnet:9080"
GITLAB_TOKEN="glpat-fKIVkcQdU933x0SRzpu92286MQp1OjEH.01.0w0vh6acn"
PROJECT_ID=15  # ventureos

echo "🔗 Integrating VentureOS RPG Master Plan into GitLab..."

# Test connectivity
echo "Testing GitLab connectivity..."
if ! curl -sf -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "$GITLAB_URL/api/v4/user" > /dev/null 2>&1; then
  echo "❌ GitLab not responding. Run this after GitLab boots."
  exit 1
fi

echo "✅ GitLab is up"

# Create Milestones for each Phase
echo ""
echo "📅 Creating milestones..."

PHASE1_ID=$(curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/milestones" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Phase 1: Psionic Attributes",
    "description": "SQLite schema + attribute calculation + tests",
    "due_date": "2026-02-28"
  }' | jq -r '.id')
echo "Created Phase 1 milestone (ID: $PHASE1_ID)"

PHASE2_ID=$(curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/milestones" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Phase 2: Khala Network",
    "description": "Bond calculation + drift tracking + cron job",
    "due_date": "2026-03-07"
  }' | jq -r '.id')
echo "Created Phase 2 milestone (ID: $PHASE2_ID)"

PHASE3_ID=$(curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/milestones" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Phase 3: Dashboard Visualization",
    "description": "Agent roster + Khala Network viz + tactical overlay",
    "due_date": "2026-03-14"
  }' | jq -r '.id')
echo "Created Phase 3 milestone (ID: $PHASE3_ID)"

PHASE4_ID=$(curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/milestones" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Phase 4: VOXYZ Integration",
    "description": "Role cards + conversation orchestration + voice rules",
    "due_date": "2026-03-21"
  }' | jq -r '.id')
echo "Created Phase 4 milestone (ID: $PHASE4_ID)"

PHASE5_ID=$(curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/milestones" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Phase 5: StarCraft Tactical Command Center",
    "description": "Real-time 2D tactical map with Pylon Network + Khala bonds",
    "due_date": "2026-03-31"
  }' | jq -r '.id')
echo "Created Phase 5 milestone (ID: $PHASE5_ID)"

P0_SPRINT_ID=$(curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/milestones" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "P0 Infrastructure Hardening Sprint",
    "description": "Fix critical infrastructure gaps before resuming features",
    "due_date": "2026-02-21"
  }' | jq -r '.id')
echo "Created P0 Sprint milestone (ID: $P0_SPRINT_ID)"

# Create P0 Issues (Security)
echo ""
echo "🔐 Creating P0 security issues..."

curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"[P0] SQL Injection in rpg-service.js (VULN-002)\",
    \"description\": \"**Problem:** Phase 5.1 RPG service uses template literals for SQL queries without parameterization.\\n\\n**Impact:** CVSS 9.8 - SQL injection allows arbitrary database manipulation.\\n\\n**Location:** \\\`~/clawd/ventureos-rpg/api/rpg-service.js\\\`\\n\\n**Fix:** Replace template literals with prepared statements.\\n\\n**Acceptance Criteria:**\\n- [ ] All SQL queries use parameterized statements\\n- [ ] SQL injection test added to test suite\\n- [ ] Test passes (injection attempt fails)\\n\\n**Verification:**\\n\\\`\\\`\\\`bash\\ngrep -n \\\"\\\\\\\`SELECT\\\" ~/clawd/ventureos-rpg/api/rpg-service.js  # Should return nothing\\n\\\`\\\`\\\`\",
    \"labels\": \"P0,security\",
    \"milestone_id\": $P0_SPRINT_ID
  }" > /dev/null
echo "Created VULN-002 (SQL Injection)"

curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"[P0] Error Disclosure Leaks Internal Paths (VULN-003)\",
    \"description\": \"**Problem:** Phase 5.1 error handlers return raw error messages with stack traces.\\n\\n**Impact:** P1 - Exposes internal file paths, library versions, implementation details.\\n\\n**Location:** \\\`~/clawd/openclaw-dashboard/server.js\\\` and middleware error handlers\\n\\n**Fix:** Generic error messages in production, detailed errors only in logs.\\n\\n**Acceptance Criteria:**\\n- [ ] API errors return generic messages (\\\"Internal Server Error\\\")\\n- [ ] Stack traces only in server logs, not HTTP responses\\n- [ ] Test: trigger error, verify no path disclosure\\n\\n**Verification:**\\n\\\`\\\`\\\`bash\\ncurl http://192.168.225.149:7001/api/nonexistent | grep -i \\\"/Users/\\\"  # Should be empty\\n\\\`\\\`\\\`\",
    \"labels\": \"P0,security\",
    \"milestone_id\": $P0_SPRINT_ID
  }" > /dev/null
echo "Created VULN-003 (Error Disclosure)"

# Create P0 Issues (QA)
echo ""
echo "🧪 Creating P0 QA issues..."

curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"[P0] 40 Phantom Middleware Tests (QA-001)\",
    \"description\": \"**Problem:** Phase 5.2 test suite has 40 middleware tests that pass but test nothing.\\n\\n**Impact:** False confidence - test suite says 88% coverage but critical paths untested.\\n\\n**Location:** \\\`~/clawd/ventureos/tactical-map/tests/middleware/*.test.js\\\`\\n\\n**Fix:** Replace mock-only tests with real HTTP integration tests.\\n\\n**Acceptance Criteria:**\\n- [ ] All middleware tests make real HTTP requests\\n- [ ] Tests verify actual headers/status codes\\n- [ ] Coverage validated (real code execution, not mocks)\\n\\n**Verification:**\\n\\\`\\\`\\\`bash\\ngrep -r \\\"mock\\\" ~/clawd/ventureos/tactical-map/tests/middleware/  # Should be minimal/none\\nnode --test | grep \\\"tests passed\\\"  # Count should match real tests\\n\\\`\\\`\\\`\",
    \"labels\": \"P0,qa\",
    \"milestone_id\": $P0_SPRINT_ID
  }" > /dev/null
echo "Created QA-001 (Phantom Tests)"

curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"[P0] XSS Sanitization Browser Path Untested (QA-002)\",
    \"description\": \"**Problem:** Phase 5.2 activity mapper has sanitization logic but no browser-executed XSS tests.\\n\\n**Impact:** Sanitization could be bypassed - no proof it actually prevents XSS in real browsers.\\n\\n**Location:** \\\`~/clawd/ventureos/tactical-map/src/data/activity-mapper.ts\\\`\\n\\n**Fix:** Add Playwright tests that attempt XSS injection and verify sanitization.\\n\\n**Acceptance Criteria:**\\n- [ ] Playwright test injects \\\`<script>alert(1)</script>\\\` into activity names\\n- [ ] Test verifies script doesn't execute in browser\\n- [ ] Test verifies sanitized output is safe HTML\\n\\n**Verification:**\\n\\\`\\\`\\\`bash\\nnpx playwright test xss-sanitization  # Should pass\\n\\\`\\\`\\\`\",
    \"labels\": \"P0,qa,security\",
    \"milestone_id\": $P0_SPRINT_ID
  }" > /dev/null
echo "Created QA-002 (XSS Untested)"

# Create P0 Issues (Performance)
echo ""
echo "⚡ Creating P0 performance issues..."

curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"[P0] N+1 Query in Khala Network Bond Rendering (PERF-003)\",
    \"description\": \"**Problem:** Phase 5.3 Khala Network will query SQLite once per bond during render.\\n\\n**Impact:** With 50 agents and 200 bonds, that's 200 sequential queries - ~2-4s render time.\\n\\n**Location:** Planned for Phase 5.3 (not yet implemented)\\n\\n**Fix:** Batch query - single \\\`SELECT * FROM bonds WHERE ...\\\` with all bond IDs.\\n\\n**Acceptance Criteria:**\\n- [ ] Bond data fetched in single query\\n- [ ] Query uses \\\`WHERE id IN (...)\\\` for batch fetch\\n- [ ] Performance test: 200 bonds render in <500ms\\n\\n**Verification:**\\n\\\`\\\`\\\`bash\\n# Enable SQLite query logging, render Khala Network, count queries\\ngrep \\\"SELECT.*FROM bonds\\\" /tmp/sqlite-query.log | wc -l  # Should be 1, not 200\\n\\\`\\\`\\\`\",
    \"labels\": \"P0,performance\",
    \"milestone_id\": $P0_SPRINT_ID
  }" > /dev/null
echo "Created PERF-003 (N+1 Query)"

# Create Phase 5 Sub-Tasks (already complete, for documentation)
echo ""
echo "📋 Creating Phase 5 completed tasks..."

curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Phase 5.1: Foundation (Security + Rendering)\",
    \"description\": \"**Status:** ✅ Complete (2026-02-14)\\n\\n**Deliverables:**\\n- Security middleware (auth, CORS, CSP, rate limiting, audit logging)\\n- Rendering core (terrain, buildings, Nexus, HUD, camera, API client)\\n- Tests: 56 passing, 88.57% coverage\\n\\n**Time:** ~30 min (vs 14-22h estimate)\\n\\n**Location:** \\\`~/clawd/ventureos/tactical-map\\\`\\n\\n**Commits:**\\n- 5e41bf0: Phase 5.1 implementation\\n- Multiple fixes (9a5bd8d, 4b0a0d4, ff79ca2, 5951fd0)\",
    \"labels\": \"phase-5,complete\",
    \"milestone_id\": $PHASE5_ID,
    \"state_event\": \"close\"
  }" > /dev/null
echo "Created Phase 5.1 issue (closed)"

curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Phase 5.2: Activity & Animation\",
    \"description\": \"**Status:** ✅ Complete (2026-02-14)\\n\\n**Deliverables:**\\n- Activity mapper (233 lines, 94 tests)\\n- Building states, animations, particles\\n- Unit sprites, health bars\\n- Input sanitization\\n\\n**Tests:** 172 passing (88.58% coverage)\\n\\n**Time:** ~30 min\\n\\n**Location:** \\\`~/clawd/ventureos/tactical-map/src/data/activity-mapper.ts\\\`\",
    \"labels\": \"phase-5,complete\",
    \"milestone_id\": $PHASE5_ID,
    \"state_event\": \"close\"
  }" > /dev/null
echo "Created Phase 5.2 issue (closed)"

curl -sf -X POST "$GITLAB_URL/api/v4/projects/$PROJECT_ID/issues" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Phase 5.3: Khala Network (Bonds + Pylon Network)\",
    \"description\": \"**Status:** 🔄 Next Up\\n\\n**Scope:**\\n- Render agent bonds (Khala connections)\\n- Pylon network overlay (infrastructure dependency graph)\\n- Bond strength visualization (line thickness/color based on affinity)\\n- Interactive hover (show bond details on mouseover)\\n\\n**Estimate:** 4-6h (v2.0-khala with buffers)\\n\\n**Acceptance Criteria:**\\n- [ ] Bonds render between agents\\n- [ ] Pylon network shows infrastructure dependencies\\n- [ ] Interactive hover works\\n- [ ] Performance: <500ms for 200 bonds (avoid N+1 query)\\n- [ ] Tests: >70% coverage\",
    \"labels\": \"phase-5,in-progress\",
    \"milestone_id\": $PHASE5_ID
  }" > /dev/null
echo "Created Phase 5.3 issue"

echo ""
echo "✅ GitLab integration complete!"
echo ""
echo "📊 Summary:"
echo "- 6 milestones created"
echo "- 5 P0 issues created (security + QA + performance)"
echo "- 3 Phase 5 issues created (2 closed, 1 open)"
echo ""
echo "🔗 Next steps:"
echo "1. Push ventureos branch with docs/RPG_SYSTEM.md"
echo "2. Update local references to point to GitLab issues"
echo "3. Begin P0 remediation via MR workflow"
