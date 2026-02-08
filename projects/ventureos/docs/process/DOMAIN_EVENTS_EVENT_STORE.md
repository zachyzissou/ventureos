# Domain Events + Event Store (M1)

**Status:** Implementation-ready spec

**Why this exists:** M0 defined an `event_outbox` for integrations. M1 formalizes **domain events** and a durable **event store** that supports **at-least-once delivery**, **idempotent consumers**, **replay**, and operational tooling (DLQ, checkpoints, retention).

**Scope:** Event envelope, naming (topics/types), persistence model, delivery model, consumer semantics, partitions, retention, replay, DLQ, and auth.

---

## 1) Definitions

- **Domain event:** Immutable fact that *something happened* in the VentureOS domain (e.g., `idea.submitted`).
- **Integration event:** Domain event formatted/filtered for downstream systems (Obsidian/GitLab/Discord/webhooks). Often identical to the domain event, but may omit sensitive fields.
- **Event store:** Append-only store of events, queryable by sequence/time/type/entity, suitable for replay.
- **Outbox:** A reliable delivery queue derived from the event store (or written transactionally alongside the state change) to dispatch events to consumers.
- **Consumer:** A projection/indexer/webhook dispatcher that processes events and persists a checkpoint.
- **DLQ (dead-letter queue):** Storage for events/deliveries that permanently failed processing after retries.

---

## 2) Event Envelope (VentureOS Event v1)

### 2.1 Requirements
Events MUST be:
- **Immutable** once recorded.
- **Uniquely identified** (`event_id`).
- **Traceable** to a request/workflow (`correlation_id`, `request_id`, `causation_id`).
- **Partitionable** for parallel consumption (`partition_key`, `partition`).
- **Versioned** for schema evolution (`schema_version`, optional `schema_uri`).

### 2.2 Canonical JSON shape
> This envelope is CloudEvents-inspired, but intentionally kept minimal and Postgres-friendly.

```json
{
  "event_id": "2e8210c6-1c9b-4c93-8ee8-3ddc2e0d6b27",
  "type": "idea.submitted",
  "schema_version": 1,

  "occurred_at": "2026-02-08T19:35:12.123Z",
  "recorded_at": "2026-02-08T19:35:12.456Z",

  "producer": "ventureos-api",

  "aggregate": {
    "type": "idea",
    "id": "4c9b4b6a-2f45-4b63-8b65-c1a2c3d4e5f6",
    "version": 7
  },

  "actor": {
    "type": "user",
    "id": "keycloak:7f0f...",
    "roles": ["IdeaOwner"]
  },

  "correlation_id": "req_01H...",
  "causation_id": "2f71...previous-event-id...",
  "request_id": "b4b7b2f0-9d42-4c93-9f5c-3db2b28f0e9a",
  "idempotency_key": "Idempotency-Key header value (optional)",

  "partition_key": "4c9b4b6a-2f45-4b63-8b65-c1a2c3d4e5f6",
  "partition": 12,

  "data": {
    "status": "Submitted",
    "title": "AI meeting notes for founders"
  },

  "meta": {
    "traceparent": "00-...",
    "source_ip": "203.0.113.10",
    "user_agent": "...",
    "tags": {"risk": "medium"}
  }
}
```

### 2.3 Field semantics
- `event_id` (UUID, required): Producer-generated. Must be globally unique.
- `type` (string, required): See §3 naming.
- `schema_version` (int, required): Starts at `1`. Increment on **breaking** changes to `data`.
- `occurred_at` (RFC3339, required): When the domain fact happened.
- `recorded_at` (RFC3339, required): When appended to the event store.
- `producer` (string, required): Service/app emitting event (e.g., `ventureos-api`, `temporal-worker`).
- `aggregate.type|id` (required): Equivalent to `entity_type/entity_id` in M0.
- `aggregate.version` (optional but recommended): Aggregate version after the command. Enables optimistic concurrency and per-aggregate ordering.
- `actor` (optional): The authenticated principal that caused the event (user/service). For background/system events, `actor.type=service`.
- `correlation_id` (recommended): Same across the full lifecycle of a request/workflow/mission.
- `causation_id` (optional): The immediate triggering event.
- `request_id` (recommended): Mirrors `X-Request-Id`.
- `idempotency_key` (optional): Mirrors `Idempotency-Key`.
- `partition_key` (required): Defaults to `aggregate.id`.
- `partition` (required): `hash(partition_key) % partition_count`.
- `data` (object, required): Event payload. Must be JSON-serializable.
- `meta` (object, optional): Additional transport/trace metadata. Do **not** put domain state here.

### 2.4 Compatibility with M0 Spec Pack
M0’s minimal schema:
```json
{ "id": "evt_...", "type": "idea.submitted", "ts": "ISO8601", "actor_id": "...", "entity_type": "idea", "entity_id": "...", "payload": {} }
```
Maps to M1 as:
- `id` → `event_id`
- `ts` → `occurred_at` (and also set `recorded_at`)
- `actor_id` → `actor.id`
- `entity_type/entity_id` → `aggregate.type/aggregate.id`
- `payload` → `data`

---

## 3) Event Type (Topic) Naming

### 3.1 Rules
- Use **lowercase** dot-separated tokens: `<bounded_context>.<noun>.<verb>`.
- Keep nouns singular where possible.
- Avoid past tense in nouns; verbs imply action.
- Do not encode schema version in the `type`; use `schema_version`.

**Examples**
- `idea.submitted`
- `validation.plan.created`
- `validation.started`
- `decision.approved`
- `venture.activated`
- `milestone.submitted`
- `portfolio.update.aggregated`
- `stakeholder.report.published`

### 3.2 Reserved / system event prefixes
- `policy.*` — gate/approval events
- `webhook.*` — delivery lifecycle
- `event_store.*` — replay/retention jobs, checkpoint resets

### 3.3 PII / sensitivity
If an event can contain sensitive data, either:
1) emit a **sanitized** domain event and keep sensitive fields in the SoR only, or
2) emit two events: `*.created` (safe) + `*.created.sensitive` (restricted consumers only).

---

## 4) Persistence Model (Postgres)

### 4.1 Design goals
- Append-only, queryable, partitionable.
- Support at-least-once delivery.
- Support consumer checkpoints and replay.
- Support operational audit (who/when/why).

### 4.2 Canonical tables (DDL-level spec)

#### 4.2.1 `event_store` (canonical)
- Stores the immutable stream.

**Columns (recommended)**
- `global_seq` (bigserial, PK) — total order across all events.
- `event_id` (uuid, unique, not null)
- `type` (text, not null)
- `schema_version` (int, not null, default 1)
- `occurred_at` (timestamptz, not null)
- `recorded_at` (timestamptz, not null, default now())
- `producer` (text, not null)
- `aggregate_type` (text, not null)
- `aggregate_id` (uuid, not null)
- `aggregate_version` (bigint, null)
- `partition_key` (text, not null)
- `partition` (int, not null)
- `correlation_id` (text, null)
- `causation_id` (uuid, null)
- `request_id` (text, null)
- `idempotency_key` (text, null)
- `actor_json` (jsonb, null)
- `data_json` (jsonb, not null)
- `meta_json` (jsonb, null)

**Indexes**
- `(aggregate_type, aggregate_id, global_seq)`
- `(type, global_seq)`
- `(correlation_id, global_seq)`
- `(recorded_at)`

**Partitioning (recommended)**
- Range partition by `recorded_at` (monthly) for retention and faster deletes/archives.

#### 4.2.2 `event_outbox` (delivery queue; derived)
M0 already defines `event_outbox`. In M1:
- Either keep it as a **compatibility view** over `event_store`, or
- Keep it as a separate table populated in the same transaction as the state change.

**If retained as a table, add:**
- `global_seq` (bigint, FK to `event_store.global_seq`) or `event_id` (uuid)
- `dedupe_key` (text, unique) — producer-controlled idempotency
- `available_at` (timestamptz) — for backoff scheduling
- `locked_at`, `locked_by`, `lock_expires_at` — for safe parallel workers
- `attempts`, `last_error`
- `status` (enum: `Pending|Delivering|Delivered|DeadLettered`)

#### 4.2.3 `event_consumer_checkpoint`
Tracks progress per consumer + partition.
- `consumer_id` (text)
- `partition` (int)
- `last_global_seq` (bigint)
- `updated_at` (timestamptz)

Primary key: `(consumer_id, partition)`

#### 4.2.4 `event_dead_letters`
Stores poison events or permanently failed deliveries.
- `dlq_id` (uuid, PK)
- `consumer_id` (text, null)
- `subscription_id` (uuid, null)
- `event_id` (uuid, not null)
- `global_seq` (bigint, not null)
- `failed_at` (timestamptz, not null)
- `attempts` (int, not null)
- `error` (text, not null)
- `event_json` (jsonb, not null)

#### 4.2.5 `webhook_subscriptions`
- `subscription_id` (uuid, PK)
- `name` (text)
- `url` (text)
- `event_types` (text[]) — empty means “all”
- `active` (bool)
- `secret_ref` (text) — store secrets in KMS/Keycloak vault if available; else encrypted at rest
- `created_at`, `updated_at`

---

## 5) Producer Semantics (How events get written)

### 5.1 Transaction boundary (non-negotiable)
When a command changes domain state in Postgres:
1) Write the state change (SoR tables)
2) Append the corresponding event(s) to `event_store`
3) Enqueue outbox delivery (`event_outbox`) if needed

All inside **one DB transaction**.

### 5.2 Idempotency (producer)
Producers MUST support safe retries.

**API-level**
- Commands accept `Idempotency-Key` (already in M0 conventions).
- The command handler stores `(producer, idempotency_key, request_fingerprint) → result` for a bounded time (recommended: 24h).

**Event-level**
- Each event also has an optional `dedupe_key`:
  - Recommended: `dedupe_key = sha256(producer + idempotency_key + type + aggregate_id)`
  - Enforce `UNIQUE (producer, dedupe_key)` either in `event_store` or `event_outbox`.

On duplicate inserts, return success with the original `event_id` (do not emit a second copy).

---

## 6) Consumer Semantics

### 6.1 Delivery guarantee
- **At-least-once** delivery is the default.
- Consumers MUST be **idempotent** (duplicates may occur).

### 6.2 Consumer categories
- **Projectors**: build read models (e.g., materialized views, search index docs).
- **Integrators**: dispatch webhooks to external systems.
- **Auditors**: append events to JSONL archive, metrics, dashboards.

### 6.3 Checkpointing
- Each consumer persists checkpoints in `event_consumer_checkpoint` per partition.
- A consumer is considered “caught up” when its `(max(global_seq) - last_global_seq)` lag is within an SLO-defined threshold.

### 6.4 Idempotency (consumer)
Consumers should dedupe by:
- Persisting the last `global_seq` processed per partition **and**
- Treating processing as idempotent for the same `event_id`.

If a consumer performs non-idempotent side effects (e.g., posting to Discord), it MUST persist a mapping:
- `(consumer_id, event_id) → side_effect_id` to prevent duplicates.

---

## 7) Partitions + Ordering

### 7.1 Ordering guarantees
- **Global order** exists via `global_seq`.
- **Per-aggregate order** exists via `aggregate_version` when populated.
- Delivery order is guaranteed **within a partition** for a given consumer.

### 7.2 Partitioning rule
- Default: `partition_key = aggregate_id`.
- `partition = hash(partition_key) % partition_count`.

**partition_count (default):** 32 (configurable).

### 7.3 Parallelism
A consumer can run N workers; each worker claims a subset of partitions.

---

## 8) Webhook Delivery (Integrations)

### 8.1 Subscription model
- Subscriptions are stored in `webhook_subscriptions`.
- Each subscription declares `event_types` (allowlist). Empty means all domain events.

### 8.2 Delivery protocol
Each delivery is an HTTP POST with:
- `Content-Type: application/json`
- Body: the full event envelope (or a sanitized projection)

**Headers (required)**
- `X-VentureOS-Event-Id: <uuid>`
- `X-VentureOS-Event-Type: <type>`
- `X-VentureOS-Event-Schema-Version: <int>`
- `X-VentureOS-Delivery-Id: <uuid>`
- `X-VentureOS-Signature: v1=<hex(hmac_sha256(secret, raw_body))>`

### 8.3 Retry policy
- Exponential backoff with jitter.
- Default retry schedule: 1m, 5m, 15m, 1h, 6h, 24h.
- Max attempts: 10.

A delivery is considered successful only on HTTP 2xx.

### 8.4 DLQ for webhooks
After `max_attempts`, move the delivery to `event_dead_letters` with `subscription_id` populated.

---

## 9) Replay

### 9.1 Replay modes
- **Projection replay:** Rebuild internal read models/search indexes.
- **Integration replay:** Redeliver events to webhooks/consumers.

### 9.2 Safety rules
Replays MUST be explicit and auditable:
- Require `event:admin` role.
- Require a `reason` string.
- Emit `event_store.replay.requested` and `event_store.replay.completed` events.

### 9.3 Replay boundaries
Support replay by:
- `global_seq` range
- time window (`recorded_at` range)
- `aggregate_id`
- `type` allowlist

### 9.4 “Replay” indicator
During replay deliveries set:
- `meta.tags.replay = true`
- `meta.tags.replay_id = <uuid>`

Consumers that trigger side effects MUST check this flag if they need different behavior.

---

## 10) Retention + Archival

### 10.1 Defaults (configurable)
- `event_store` (domain events): retain **24 months** online.
- `event_dead_letters`: retain **180 days**.
- `event_outbox` delivery records: retain **30–90 days** (operational logs).

### 10.2 Archival
Before dropping old `event_store` partitions:
- Export partitions to **MinIO** as compressed JSONL (`.jsonl.gz`) with checksum.
- Record archive manifests (partition, checksum, minio_uri).

### 10.3 Compliance / audit
If longer retention is required (financial/compliance contexts), increase online retention or retain archives indefinitely.

---

## 11) AuthN/AuthZ

### 11.1 Authentication
- All event store APIs require Keycloak JWT (Bearer).

### 11.2 Authorization (roles/scopes)
Recommended realm roles:
- `event:read` — can query events
- `event:write` — can append events (internal services)
- `event:admin` — can replay, reset checkpoints, view DLQ
- `webhook:admin` — can create/rotate webhook secrets and manage subscriptions

### 11.3 Least privilege guidance
- UI users typically get `event:read` only.
- Integration workers get `event:read` + `webhook:admin` (if they manage subscriptions) or a narrower service account.

---

## 12) Operational Requirements (SLOs + Observability)

### 12.1 Metrics
Emit metrics for:
- event append rate
- outbox backlog size
- per-consumer lag (by partition)
- webhook success rate / retry counts
- DLQ size

### 12.2 Alerts
- P0: event append failures, outbox worker down, DLQ growth spike
- P1: consumer lag above threshold for > N minutes

---

## 13) Acceptance Criteria (M1)
- Event envelope implemented and validated (schema checks + tests).
- Postgres event store supports: query by `global_seq`, `type`, `aggregate_id`, and time.
- At-least-once delivery with idempotent consumers and persisted checkpoints.
- DLQ exists with redrive tooling.
- Replay supports bounded ranges and requires admin role.
- Retention policy implemented via Postgres partitions + MinIO archive.
