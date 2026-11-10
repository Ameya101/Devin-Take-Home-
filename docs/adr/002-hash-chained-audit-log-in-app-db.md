# ADR 002: Hash-chained audit log in the app database

## Context
SOC 2 and internal audit need a complete, tamper-evident record of who changed what. Options were (a) shipping events to an external log store / SIEM, or (b) writing them to the application database.

An external store written after the business transaction can miss events (the write commits, the log call fails) or record changes that rolled back.

## Decision
- `audit.record(tx, event)` writes an `AuditEvent` row inside the caller's transaction, so an event exists if and only if the change committed.
- Each row stores `hash = sha256(prevHash + canonical JSON of the event)`. `prevHash` is unique, so concurrent writers can't fork the chain.
- `audit.verifyChain()` reports the first broken row and returns the chain head. An optional externally kept anchor (head id + hash) also detects deleted tail rows.
- `/admin/audit` (platform_admin only) offers filtering, before/after diffs, "Verify integrity" and CSV export.

## Consequences
- Atomic with the business data, no extra infrastructure, and verifiable by anyone with read access.
- A DB superuser can rewrite the whole chain consistently. Detecting that requires anchoring the head outside the DB (e.g. periodic export to WORM storage or a SIEM), which is listed under Production gaps.
- Audit writes serialize on the chain head, which limits write throughput. That's acceptable for internal tools but not for high-volume event streams.
- A retention policy and SIEM export are still needed.
