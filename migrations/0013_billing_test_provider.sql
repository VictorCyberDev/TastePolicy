BEGIN;
-- A commissioned provider sandbox remains separate from LIVE entitlements.
CREATE TABLE tastepolicy.billing_test_customers (
 workspace_id uuid PRIMARY KEY REFERENCES tastepolicy.developer_workspaces(workspace_id) ON DELETE CASCADE,
 provider_customer_id text NOT NULL UNIQUE CHECK(provider_customer_id ~ '^cus_[A-Za-z0-9_]{1,160}$'),
 created_at timestamptz NOT NULL
);
CREATE TABLE tastepolicy.billing_test_checkouts (
 checkout_id text PRIMARY KEY CHECK(checkout_id ~ '^cs_test_[A-Za-z0-9_]{1,180}$'),
 workspace_id uuid NOT NULL REFERENCES tastepolicy.billing_test_customers(workspace_id) ON DELETE CASCADE,
 idempotency_key text NOT NULL,
 payload_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 checkout_url text NOT NULL CHECK(checkout_url LIKE 'https://checkout.stripe.com/%'),
 subscription_id text CHECK(subscription_id ~ '^sub_[A-Za-z0-9_]{1,160}$'),
 created_at timestamptz NOT NULL,
 UNIQUE(workspace_id,idempotency_key)
);
CREATE TABLE tastepolicy.billing_test_events (
 event_id text PRIMARY KEY CHECK(event_id ~ '^evt_[A-Za-z0-9_]{1,160}$'),
 workspace_id uuid NOT NULL REFERENCES tastepolicy.developer_workspaces(workspace_id) ON DELETE CASCADE,
 event_type text NOT NULL,
 payload_hash text NOT NULL,
 provider_created bigint NOT NULL,
 processed_at timestamptz NOT NULL
);
CREATE INDEX billing_test_subscription ON tastepolicy.billing_test_checkouts(subscription_id);
CREATE TRIGGER immutable_billing_test_events BEFORE UPDATE ON tastepolicy.billing_test_events FOR EACH ROW EXECUTE FUNCTION tastepolicy.immutable_snapshot();
ALTER TABLE tastepolicy.billing_test_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tastepolicy.billing_test_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tastepolicy.billing_test_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tastepolicy.billing_test_customers,tastepolicy.billing_test_checkouts,tastepolicy.billing_test_events FROM PUBLIC;
COMMIT;
