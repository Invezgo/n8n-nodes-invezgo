# Changelog

## Unreleased

- Invezgo Trigger now registers itself: activating the workflow sets the account webhook through `/users/webhook` and stores the signing secret; deactivating disables it. The credential's **Webhook Secret** field is removed.
- All parameter descriptions are now in English (translated in `scripts/translations.json`; the generator fails on an untranslated description).
- README is English only.

## 0.2.0 (2026-11-15)

- Add **Invezgo Trigger** node: receives Invezgo webhook events (`update.*`, `alert.*`, `quota.*`, `test.ping`), verifies the `X-Invezgo-Signature` HMAC and 5-minute timestamp window, and can filter by event.
- Add optional **Webhook Secret** field to the Invezgo API credential.
- Re-checked node operations against the latest OpenAPI spec (v1.2): no changes.
