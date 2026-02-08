BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  display_name text,
  avatar_url text,
  auth_provider text,
  auth_subject text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_provider_subject_idx
  ON users (auth_provider, auth_subject)
  WHERE auth_provider IS NOT NULL AND auth_subject IS NOT NULL;

-- Orgs
CREATE TABLE IF NOT EXISTS orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS orgs_slug_lower_idx ON orgs (lower(slug));

-- Org members
CREATE TABLE IF NOT EXISTS org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_members_role_chk CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  CONSTRAINT org_members_status_chk CHECK (status IN ('active', 'invited', 'removed')),
  CONSTRAINT org_members_unique UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_members_user_idx ON org_members (user_id);

-- Ventures
CREATE TABLE IF NOT EXISTS ventures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  priority text NOT NULL DEFAULT 'P2',
  risk_level text NOT NULL DEFAULT 'Medium',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ventures_status_chk CHECK (status IN ('draft', 'active', 'paused', 'completed', 'failed', 'archived')),
  CONSTRAINT ventures_priority_chk CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  CONSTRAINT ventures_risk_chk CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  CONSTRAINT ventures_unique UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS ventures_org_idx ON ventures (org_id);
CREATE INDEX IF NOT EXISTS ventures_owner_idx ON ventures (owner_id);
CREATE INDEX IF NOT EXISTS ventures_status_idx ON ventures (status);

-- Venture members
CREATE TABLE IF NOT EXISTS venture_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venture_members_role_chk CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  CONSTRAINT venture_members_status_chk CHECK (status IN ('active', 'invited', 'removed')),
  CONSTRAINT venture_members_unique UNIQUE (venture_id, user_id)
);

CREATE INDEX IF NOT EXISTS venture_members_user_idx ON venture_members (user_id);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  start_date date,
  due_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_status_chk CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  CONSTRAINT projects_unique UNIQUE (venture_id, name)
);

CREATE INDEX IF NOT EXISTS projects_venture_idx ON projects (venture_id);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_id);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'P2',
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date date,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_status_chk CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'archived')),
  CONSTRAINT tasks_priority_chk CHECK (priority IN ('P0', 'P1', 'P2', 'P3'))
);

CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks (project_id);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  venture_id uuid REFERENCES ventures(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  doc_type text,
  content text,
  source_uri text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_org_idx ON documents (org_id);
CREATE INDEX IF NOT EXISTS documents_venture_idx ON documents (venture_id);
CREATE INDEX IF NOT EXISTS documents_project_idx ON documents (project_id);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  venture_id uuid REFERENCES ventures(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_org_idx ON notes (org_id);
CREATE INDEX IF NOT EXISTS notes_venture_idx ON notes (venture_id);
CREATE INDEX IF NOT EXISTS notes_project_idx ON notes (project_id);
CREATE INDEX IF NOT EXISTS notes_task_idx ON notes (task_id);
CREATE INDEX IF NOT EXISTS notes_author_idx ON notes (author_id);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_org_name_lower_idx ON tags (org_id, lower(name));

-- Taggables (polymorphic)
CREATE TABLE IF NOT EXISTS taggables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taggables_unique UNIQUE (tag_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS taggables_entity_idx ON taggables (entity_type, entity_id);

-- Integrations
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text,
  status text NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integrations_status_chk CHECK (status IN ('active', 'disabled', 'error'))
);

CREATE INDEX IF NOT EXISTS integrations_org_idx ON integrations (org_id);
CREATE INDEX IF NOT EXISTS integrations_provider_idx ON integrations (provider);
CREATE UNIQUE INDEX IF NOT EXISTS integrations_org_provider_ext_idx
  ON integrations (org_id, provider, external_id)
  WHERE external_id IS NOT NULL;

-- External links (polymorphic)
CREATE TABLE IF NOT EXISTS external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  provider text,
  url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_links_entity_idx ON external_links (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS external_links_org_provider_idx ON external_links (org_id, provider);

-- Events (generic/event outbox)
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_type_idx ON events (event_type);
CREATE INDEX IF NOT EXISTS events_entity_idx ON events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS events_idempotency_key_idx
  ON events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);

COMMIT;
