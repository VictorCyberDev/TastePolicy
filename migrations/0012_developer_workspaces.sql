BEGIN;
-- Owner-operated application namespaces. They do not grant access to another
-- person's Passport or imply multi-member organization RBAC.
CREATE TABLE tastepolicy.developer_workspaces (
 workspace_id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES tastepolicy.platform_auth_user(id) ON DELETE CASCADE,
 display_label text NOT NULL CHECK(length(display_label) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL,
 UNIQUE(user_id,workspace_id)
);
CREATE TABLE tastepolicy.developer_projects (
 project_id uuid PRIMARY KEY,
 user_id text NOT NULL,
 workspace_id uuid NOT NULL,
 display_label text NOT NULL CHECK(length(display_label) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL,
 UNIQUE(user_id,project_id),
 FOREIGN KEY(user_id,workspace_id) REFERENCES tastepolicy.developer_workspaces(user_id,workspace_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.developer_environments (
 environment_id uuid PRIMARY KEY,
 user_id text NOT NULL,
 project_id uuid NOT NULL,
 display_label text NOT NULL CHECK(length(display_label) BETWEEN 1 AND 80),
 kind text NOT NULL CHECK(kind IN ('DEVELOPMENT','PRODUCTION')),
 created_at timestamptz NOT NULL,
 UNIQUE(user_id,environment_id),
 FOREIGN KEY(user_id,project_id) REFERENCES tastepolicy.developer_projects(user_id,project_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.developer_agents (
 agent_id uuid PRIMARY KEY,
 user_id text NOT NULL,
 environment_id uuid NOT NULL,
 external_id text NOT NULL CHECK(external_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
 display_label text NOT NULL CHECK(length(display_label) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL,
 revoked_at timestamptz,
 UNIQUE(environment_id,external_id),
 UNIQUE(user_id,agent_id,environment_id),
 FOREIGN KEY(user_id,environment_id) REFERENCES tastepolicy.developer_environments(user_id,environment_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.credential_environments (
 credential_id uuid PRIMARY KEY,
 agent_id uuid NOT NULL,
 user_id text NOT NULL,
 environment_id uuid NOT NULL,
 created_at timestamptz NOT NULL,
 FOREIGN KEY(user_id,credential_id) REFERENCES tastepolicy.developer_credentials(user_id,credential_id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,agent_id,environment_id) REFERENCES tastepolicy.developer_agents(user_id,agent_id,environment_id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,environment_id) REFERENCES tastepolicy.developer_environments(user_id,environment_id) ON DELETE CASCADE
);
CREATE TABLE tastepolicy.workspace_subscriptions (
 workspace_id uuid NOT NULL REFERENCES tastepolicy.developer_workspaces(workspace_id) ON DELETE CASCADE,
 mode text NOT NULL CHECK(mode IN ('LIVE','SANDBOX')),
 plan text NOT NULL CHECK(plan IN ('FREE','PRO','ENTERPRISE')),
 state text NOT NULL CHECK(state IN ('ACTIVE','PAST_DUE','CANCELED','UNCONFIGURED')),
 provider text NOT NULL CHECK(provider IN ('NONE','INTERNAL_SANDBOX','STRIPE')),
 provider_customer_id text,
 provider_subscription_id text,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(workspace_id,mode),
 CHECK(mode<>'LIVE' OR plan='FREE' OR provider='STRIPE')
);
CREATE TABLE tastepolicy.workspace_billing_events (
 event_id text PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES tastepolicy.developer_workspaces(workspace_id) ON DELETE CASCADE,
 mode text NOT NULL CHECK(mode IN ('LIVE','SANDBOX')),
 kind text NOT NULL,
 amount_minor integer NOT NULL CHECK(amount_minor>=0),
 currency text NOT NULL CHECK(currency='usd'),
 at timestamptz NOT NULL,
 CHECK(mode='SANDBOX') -- live invoicing needs a separately reviewed provider integration
);
CREATE TRIGGER immutable_credential_environment BEFORE UPDATE ON tastepolicy.credential_environments FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
CREATE TRIGGER immutable_billing_event BEFORE UPDATE ON tastepolicy.workspace_billing_events FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
CREATE INDEX workspace_owner ON tastepolicy.developer_workspaces(user_id);
CREATE INDEX workspace_project ON tastepolicy.developer_projects(workspace_id);
CREATE INDEX environment_project ON tastepolicy.developer_environments(project_id);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['developer_workspaces','developer_projects','developer_environments','developer_agents','credential_environments','workspace_subscriptions','workspace_billing_events'] LOOP
 EXECUTE format('ALTER TABLE tastepolicy.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON tastepolicy.%I FROM PUBLIC',t);
 END LOOP;
END $$;
COMMIT;
