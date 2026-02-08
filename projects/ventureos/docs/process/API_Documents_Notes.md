# VentureOS Documents + Notes API (M1)

**Base URL:** `/api/v1`

This document defines the **Documents** and **Notes** REST APIs for M1. These APIs are intended to support:
- long‑form, versioned documents (e.g., decision memos, validation briefs, build plans) synced from tools like Obsidian
- short‑form notes/comments attached to any VentureOS entity
- tagging + search (full‑text + filters)
- soft delete (archive) + restore
- audit metadata suitable for compliance and workflow traceability

**Related:**
- Core conventions: `docs/process/API_Core_CRUD.md`
- OpenAPI: `docs/process/openapi-docs-notes.yaml`

---

## 1) Conventions (inherits core)
- **Auth:** Bearer JWT (Keycloak stub)
- **Content-Type:** `application/json`
- **Idempotency:** `Idempotency-Key` supported on create/update endpoints
- **Tracing:** `X-Request-Id` propagated end‑to‑end
- **Soft delete:** `DELETE` archives resources (does not hard delete)

### 1.1 Audit metadata (required)
All writeable resources include:
- `created_at`, `created_by`
- `updated_at`, `updated_by`
- `archived_at`, `archived_by` (set when archived)

`*_by` fields use the **Keycloak subject** (string).

---

## 2) Access Control (M1 RBAC stub)
VentureOS uses Keycloak for AuthN and RBAC. Exact realm role names are implementation‑defined, but the API must enforce the following semantics.

### 2.1 Roles / capabilities
- **Admin**: full access to all documents/notes
- **Editor**: may create/update/archive/restore documents and notes where visibility allows
- **Viewer**: read‑only access where visibility allows

### 2.2 Ownership + visibility
Documents and notes carry `visibility`:
- `private`: only `created_by` and Admin
- `team`: creator + users in the creator’s team (realm group) + Admin
- `org`: any authenticated user + Admin

**Rule of thumb:**
- `GET` requires both RBAC role AND visibility check
- `PATCH/DELETE/restore` requires Editor/Admin AND (owner OR explicit ACL in future)

> Future: explicit ACL tables (`document_acl`, `note_acl`) can extend this without changing endpoint shapes.

---

## 3) Entity Model

### 3.1 Document
A **Document** is a versioned, editable, searchable text artifact.

Key properties:
- **Versioning:** content is stored as immutable **DocumentRevisions**; Document points to the current revision.
- **Linking:** documents may be attached to any VentureOS entity via (`parent_type`, `parent_id`).
- **Tagging:** free‑form string tags.

**Document (response shape)**
```json
{
  "id": "uuid",
  "title": "Decision Memo — Go/No-Go",
  "description": "Why we are proceeding with the venture.",
  "status": "Draft",
  "visibility": "team",
  "tags": ["decision", "memo", "venture-x"],

  "parent_type": "idea",
  "parent_id": "uuid",

  "current_version": 3,
  "current_revision_id": "uuid",

  "created_at": "2026-02-08T18:00:00Z",
  "created_by": "user_123",
  "updated_at": "2026-02-08T18:30:00Z",
  "updated_by": "user_456",

  "archived_at": null,
  "archived_by": null
}
```

### 3.2 DocumentRevision
A **DocumentRevision** is immutable.

```json
{
  "id": "uuid",
  "document_id": "uuid",
  "version": 3,
  "content_markdown": "# Decision\n\nWe recommend...",
  "change_summary": "Added risk section",
  "source": "api",

  "created_at": "2026-02-08T18:30:00Z",
  "created_by": "user_456"
}
```

### 3.3 Note
A **Note** is a short comment attached to a parent entity (including documents).

```json
{
  "id": "uuid",
  "parent_type": "document",
  "parent_id": "uuid",

  "body": "We should add evidence links before approval.",
  "body_format": "markdown",
  "visibility": "team",
  "tags": ["review"],

  "reply_to_note_id": null,

  "created_at": "2026-02-08T18:31:00Z",
  "created_by": "user_789",
  "updated_at": null,
  "updated_by": null,
  "archived_at": null,
  "archived_by": null
}
```

---

## 4) Endpoints — Documents

### 4.1 List documents
`GET /documents`

**Filters (query params):**
- `q` — full‑text query (title/description + current revision content)
- `tag` — filter by a single tag (repeatable if desired)
- `parent_type`, `parent_id`
- `created_by`
- `status` — `Draft|Active|Archived` (implementation may support the global Status taxonomy)
- `include_archived` — default `false`
- standard pagination: `page`, `page_size`, `sort`, `order`

### 4.2 Create document
`POST /documents`

Creates a document **and** an initial revision (version = 1).

**Request**
```json
{
  "title": "Validation Plan — Market Test",
  "description": "Initial plan for validating demand",
  "visibility": "team",
  "tags": ["validation", "plan"],
  "parent_type": "idea",
  "parent_id": "uuid",
  "content_markdown": "# Hypothesis\n..."
}
```

### 4.3 Get document
`GET /documents/{id}`

By default returns the document metadata. Implementations may support `include_content=true` to also return the current revision content.

### 4.4 Update document metadata
`PATCH /documents/{id}`

Updates metadata only (e.g., title/description/tags/visibility/status). Does **not** create a new revision.

### 4.5 Create a new revision (update content)
`POST /documents/{id}/revisions`

Creates a new revision and atomically updates `current_version` and `current_revision_id`.

**Optimistic concurrency (recommended):** pass `expected_version` to prevent lost updates.

**Request**
```json
{
  "expected_version": 3,
  "content_markdown": "# Decision\n...",
  "change_summary": "Added budget cap section",
  "source": "api"
}
```

**Errors**
- `409 Conflict` if `expected_version` does not match `current_version`

### 4.6 List revisions
`GET /documents/{id}/revisions`

### 4.7 Get a revision
`GET /documents/{id}/revisions/{revision_id}`

### 4.8 Archive / restore
- `DELETE /documents/{id}` — archive (soft delete)
- `POST /documents/{id}/restore` — restore from archive

---

## 5) Endpoints — Notes

### 5.1 List notes
`GET /notes`

**Filters:**
- `parent_type`, `parent_id` (most common)
- `q` (full‑text over note body)
- `tag`
- `created_by`
- `include_archived` (default `false`)
- pagination: `page`, `page_size`, `sort`, `order`

### 5.2 Create note
`POST /notes`
```json
{
  "parent_type": "decision",
  "parent_id": "uuid",
  "body": "Need more evidence for compliance.",
  "body_format": "markdown",
  "visibility": "team",
  "tags": ["compliance"],
  "reply_to_note_id": null
}
```

### 5.3 Get / update / archive / restore
- `GET /notes/{id}`
- `PATCH /notes/{id}` (body/tags/visibility)
- `DELETE /notes/{id}` (archive)
- `POST /notes/{id}/restore`

---

## 6) Tag discovery endpoints
To support UX auto‑complete and reporting, provide distinct tag lists:
- `GET /documents/tags?q=pre&limit=20`
- `GET /notes/tags?q=pre&limit=20`

---

## 7) Search semantics (implementation notes)
- **Full‑text search:** recommended via Meilisearch (fast relevance + highlights).
- **Filter + sorting:** implemented in Postgres and/or search engine filters.
- `q` should search:
  - Documents: title, description, current revision content
  - Notes: body

> Vector search (Qdrant) is optional for M1; if enabled, expose separate endpoints later (e.g., `/documents/semantic-search`).

---

## 8) Events (outbox)
When used with the outbox pattern, emit:
- `document.created|updated|archived|restored`
- `document.revision.created`
- `note.created|updated|archived|restored`

Event payload must include `actor_id`, `entity_type`, `entity_id`, and minimal diff/context.
