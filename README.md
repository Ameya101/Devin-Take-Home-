# Internal Tools Kit (Devin take-home)

Proof of concept for a Series C fintech that runs internal tools on Microsoft Power Apps: can their engineers replace it with a shared internal-tools kit built with Devin?

The app in this repo is built by Devin. This README will be replaced with full run instructions once the build is done.

## How this repo was built

The `devin/` folder holds everything given to Devin:

| File | Where it goes in Devin |
|---|---|
| `devin/knowledge/01-architecture-rules.md` | Settings → Knowledge |
| `devin/knowledge/02-stack-and-commands.md` | Settings → Knowledge |
| `devin/playbook-new-internal-tool.md` | Playbooks |
| `devin/sessions/session-1-kit-and-refunds.md` | Session 1 prompt: shared kit (auth, RBAC, audit log, approvals) + Refunds app |
| `devin/sessions/session-2-feature-flags.md` | Session 2 prompt: Feature Flag admin from a short spec, using the playbook |
| `devin/sessions/session-3-fde-hardening.md` | Session 3 prompt: tests, CI, Docker, docs, security pass |

Each session ends in a pull request that is reviewed by a human before merging.
