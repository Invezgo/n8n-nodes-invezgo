# Changelog

## 0.2.0 (2026-11-15)

- Add **Invezgo Trigger** node: receives Invezgo webhook events (`update.*`, `alert.*`, `quota.*`, `test.ping`), verifies the `X-Invezgo-Signature` HMAC and 5-minute timestamp window, and can filter by event.
- Add optional **Webhook Secret** field to the Invezgo API credential.
- Re-checked node operations against the latest OpenAPI spec (v1.2): no changes.
