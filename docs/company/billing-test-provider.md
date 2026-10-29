# Stripe test billing commissioning

Status: implementation verified locally; provider account and end-to-end Stripe commissioning incomplete. No LIVE paid entitlement or real charge is enabled. The $49/month USD Pro price remains a commercial hypothesis, not observed willingness to pay.

The owner dashboard supports a deliberate Stripe-hosted TEST checkout, signed webhook reconciliation, paid test invoice recording and test cancellation. Migration 0013 is additive, references the workspace owner model and cascades on account deletion. Customer, checkout, event and invoice IDs are retained for billing reconciliation; raw webhooks and payment-card details are not stored. Stripe becomes a proposed billing subprocessor only if enabled; no provider account has been verified in this release.

Server-only configuration:

- BILLING_TEST_ENABLED=true
- STRIPE_TEST_SECRET_KEY: sk_test_ credential only
- STRIPE_TEST_WEBHOOK_SECRET: endpoint signing secret
- STRIPE_TEST_PRO_PRICE_ID: active recurring monthly USD 4900-minor-unit price

Configure a test webhook at `https://tastepolicy.vercel.app/api/billing/test/webhook` for checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.paid and invoice.payment_failed. Keep preview and production provider secrets/endpoints separate. Never place keys in browser variables, source files, screenshots or CI output.

Before commissioning, create/verify the free provider account through the authorized identity, create the TEST product/price and webhook, add server-only secrets, deploy the exact green release and test from an outside browser. Use Stripe's documented test payment details only. Confirm webhook signature acceptance; one customer/open checkout under concurrent retries; one invoice under duplicate deliveries; canonical canceled state under reordered events; no LIVE plan change; deliberate cancellation and account cleanup. Save sanitized event/request IDs and exact SHA. This document does not substitute for that acceptance.

Owner operations require a cookie session and canonical same-origin request; mutations require authentication within five minutes and revalidate after provider calls. Provider calls have a five-second deadline and zero SDK retries. The billing workspace row is locked during checkout/subscription reconciliation to serialize duplicate activity; these locks are separate from the Qloo decision path. Provider outage maps to PROVIDER_UNAVAILABLE, without guessing an entitlement. Webhooks have a 128 KiB body limit, three-second read budget and per-instance four-request admission cap; no distributed throughput claim is made.

Actual Stripe SDK HMAC validation is tested with synthetic secrets. SQL-backed integration tests cover ownership, expired/revoked sessions, invoice/event idempotency, current provider state, wrong price/customer, and deletion cascades. Real PostgreSQL CI additionally covers concurrent checkout/event delivery and in-flight session revocation. These synthetic adapter tests prove application behavior, not connectivity to a Stripe account.

Rollback: disable BILLING_TEST_ENABLED to stop new provider operations. Already-created test subscriptions must be canceled in Stripe or through the configured authenticated test cancellation path; disabling the application does not cancel provider subscriptions. Preserve the additive tables and existing checksum ledger. Investigate webhook failures using sanitized request IDs, then redeliver signed events after repair. Account deletion removes local records; it does not assert that Stripe's legally retained records are erased.
