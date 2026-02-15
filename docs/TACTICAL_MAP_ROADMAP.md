# Tactical Map - Feature Roadmap

## Vision
Real-time StarCraft-inspired visualization of the VentureOS multi-agent system. Visualize agents, missions, resource flows, and system health in an intuitive tactical interface.

## Completed Phases

### Phase 5.0: Foundation ✅
- Basic canvas setup
- Agent positioning system
- Minimap
- Grid overlay
- Initial TypeScript migration

### Phase 5.1: Security + Rendering ✅  
- Security middleware (auth, rate limiting, headers)
- TypeScript consolidation
- Test infrastructure (>70% coverage)
- Issue #7

### Phase 5.2: Activity & Animation ✅
- Agent activity indicators
- Movement animations
- State transitions (idle, active, thinking, blocked)
- Particle effects for activity
- Issue #8

### Phase 5.3: Khala Network ⏳ In Progress
- Agent bonds visualization (affinity-based)
- Pylon network overlay (infrastructure dependencies)
- Interactive hover (bond details)
- Performance: <500ms for 200 bonds
- Issue #9 (Synth session 9353433f)

## Upcoming Phases

### Phase 5.4: Resource Management & Economy (Est: 6-8h)
**Objective:** Visualize token budgets, costs, and resource allocation across agents

**Features:**
- Token budget visualization per agent
- Real-time cost tracking
- Resource pool indicators (quota remaining)
- Cost heat map overlay
- Budget alerts (approaching limits)
- Historical cost trends (mini graphs)

**Technical Requirements:**
- Integration with budget tracking system
- WebSocket for real-time updates
- Efficient rendering (avoid re-rendering entire scene)
- Time-series data handling

**Acceptance Criteria:**
- [ ] Token budgets shown per agent
- [ ] Real-time cost updates (<2s latency)
- [ ] Visual indicators for budget health (green/yellow/red)
- [ ] Historical trend sparklines
- [ ] Tests: >70% coverage
- [ ] Performance: <100ms update time

**Dependencies:** None (parallel with 5.3)

---

### Phase 5.5: Mission Tracking & Workflows (Est: 8-10h)
**Objective:** Visualize active missions, task queues, and workflow state

**Features:**
- Mission cards (floating above agents)
- Task queue visualization
- Workflow progress indicators
- Mission dependencies (arrows between related work)
- Completion animations
- Mission history timeline

**Technical Requirements:**
- Mission metadata integration
- Task queue API connection
- State machine for mission lifecycle
- Animation system for transitions

**Acceptance Criteria:**
- [ ] Active missions visible on agents
- [ ] Task queue depth shown
- [ ] Mission progress indicators (0-100%)
- [ ] Dependency arrows rendered
- [ ] Mission completion celebration
- [ ] Tests: >70% coverage
- [ ] Performance: <500ms for 50 active missions

**Dependencies:** Task queue system (Phase 2 operational roadmap)

---

### Phase 5.6: Health & Diagnostics (Est: 6-8h)
**Objective:** Real-time system health monitoring and issue detection

**Features:**
- Agent health indicators (CPU, memory, latency)
- Error state visualization (red pulsing)
- Alert overlays (P0/P1 issues)
- Performance metrics (requests/sec)
- Connectivity status (online/offline/degraded)
- System-wide health dashboard

**Technical Requirements:**
- Health check API integration
- Prometheus/metrics scraping
- Alert routing system
- Performance data aggregation

**Acceptance Criteria:**
- [ ] Health status per agent (green/yellow/red)
- [ ] Error alerts visible immediately (<5s)
- [ ] Performance metrics updated (10s interval)
- [ ] Connectivity indicators accurate
- [ ] System dashboard shows aggregates
- [ ] Tests: >70% coverage
- [ ] Performance: <50ms health check

**Dependencies:** Monitoring infrastructure (Phase 0.5 operational)

---

### Phase 5.7: Interactive Controls (Est: 10-12h)
**Objective:** Enable user control and configuration from the tactical map

**Features:**
- Click agent → detail panel
- Spawn mission from UI
- Pause/resume agents
- Budget adjustments (drag slider)
- Mission priority changes
- Configuration editing
- Command palette (Cmd+K)

**Technical Requirements:**
- Click/hover event system
- Modal/panel UI components
- API endpoints for control actions
- Permissions/auth for actions
- Undo/redo system

**Acceptance Criteria:**
- [ ] Agent details open on click
- [ ] Mission spawn UI functional
- [ ] Pause/resume works (with confirmation)
- [ ] Budget sliders persist changes
- [ ] Command palette searchable
- [ ] Permissions enforced
- [ ] Tests: >70% coverage
- [ ] Performance: <100ms UI response

**Dependencies:** Auth system, API endpoints

---

### Phase 5.8: Replay & History (Est: 8-10h)
**Objective:** Replay historical sessions and analyze past behavior

**Features:**
- Time scrubber (rewind/fast-forward)
- Session playback (replay agent movements)
- Event log integration
- Snapshot comparison (before/after)
- Export timeline as video/GIF
- Historical metrics overlay

**Technical Requirements:**
- Session log storage/retrieval
- Event replay engine
- Time-series data interpolation
- Canvas frame capture

**Acceptance Criteria:**
- [ ] Time scrubber functional
- [ ] Session playback accurate
- [ ] Event log synchronized
- [ ] Snapshot comparisons work
- [ ] Export to video (30fps)
- [ ] Tests: >70% coverage
- [ ] Performance: <100ms seek time

**Dependencies:** Session logging infrastructure

---

## Phase 6: Advanced Features (Weeks 14-16)

### Phase 6.1: 3D Visualization (Est: 12-16h)
- Migrate to Three.js for 3D tactical view
- Height-based layering (agent roles at different altitudes)
- Camera controls (rotate, zoom, pan)
- Lighting and shadows

### Phase 6.2: Multi-Environment Support (Est: 6-8h)
- Multiple workspaces/environments
- Environment switching (dev/staging/prod)
- Cross-environment comparisons
- Federation (multiple deployments in one view)

### Phase 6.3: AI Copilot Integration (Est: 8-10h)
- Ask questions about system state
- Suggested optimizations
- Anomaly detection highlights
- Natural language queries

### Phase 6.4: Mobile/Tablet Support (Est: 10-12h)
- Responsive design
- Touch gestures
- Mobile-optimized UI
- PWA support

---

## Non-Feature Work

### Documentation (Ongoing)
- [ ] Architecture document (Phase 5 technical design)
- [ ] API documentation (endpoints, schemas)
- [ ] Component library docs (UI elements)
- [ ] Deployment guide
- [ ] Performance tuning guide

### Infrastructure (Ongoing)
- [ ] CI/CD for tactical-map
- [ ] Automated visual regression tests
- [ ] Performance benchmarking suite
- [ ] Load testing (1000+ agents)

### Quality (Ongoing)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Security review (XSS, CSRF, injection)
- [ ] Browser compatibility testing
- [ ] Performance profiling

---

## Success Metrics

**Phase 5 Goals:**
- 90%+ test coverage
- <100ms UI response time
- <500ms render time for 200 agents
- Zero critical security issues
- Mobile-responsive

**Phase 6 Goals:**
- Support 1000+ agents
- 3D visualization performant (60fps)
- Multi-environment federation
- AI-powered insights

---

## Timeline

- **Phase 5.3**: Feb 15, 2026 (in progress)
- **Phase 5.4**: Feb 16-17, 2026
- **Phase 5.5**: Feb 18-19, 2026  
- **Phase 5.6**: Feb 20-21, 2026
- **Phase 5.7**: Feb 22-24, 2026
- **Phase 5.8**: Feb 25-26, 2026
- **Phase 6.x**: Mar 2026

---

## Related Documentation

- `/docs/ROADMAP.md` - Operational VentureOS roadmap
- `/docs/RPG_SYSTEM.md` - Role/mission system
- `/docs/ARCHITECTURE.md` - System architecture
- `/tactical-map/README.md` - Tactical map implementation guide
