# ADR 003: Maker-checker approvals as a kit primitive

## Context
Large refunds and production flag changes need a second person to approve them. Building that per app leads to inconsistent rules (self-approval, double decisions, approval without execution) and audit gaps.

## Decision
- The kit owns `ApprovalRequest` and the lifecycle `pending → approved → executed | failed`, or `rejected`.
- Apps call `registerApprovalType(type, { permissionToApprove, execute(payload, tx), onReject?, onFailure?, urgent?, describe? })` and `requestApproval(...)`.
- The server enforces three rules: the approver differs from the requester, the approver has `permissionToApprove`, and the request is still pending (a conditional update, so two approvers can't both decide). `execute` runs in the same transaction as the approval, and the request, decision and execution are all audited.
- If execution throws, the request is marked `failed` and `onFailure` gets the error, so apps can release or keep reserved resources.
- One `/approvals` page serves every app ("My requests" and "Waiting for me", urgent requests first).

## Consequences
- New apps get correct maker-checker behaviour by registering a type, and auditors review one implementation.
- Payloads are JSON validated by each app; `execute` must re-check current state (e.g. remaining refundable amount, prod flag unchanged since the request).
- Side effects inside `execute` (such as a payment call) run while the transaction is open; an outbox is needed for real external calls (Production gaps).
- Multi-step approval chains and quorum rules aren't supported yet.
