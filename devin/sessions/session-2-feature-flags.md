# Session 2: Feature Flag admin from a short spec

Start a new Devin session with the "New internal tool on the kit" playbook attached, then paste the spec below.

Using the "New internal tool on the kit" playbook, build a Feature Flag Admin app in Devin-Take-Home- repo.

Spec:
- Engineers manage feature flags per environment (dev, staging, prod).
- A flag has a key, description, owner team, and per-environment state: enabled on/off and a rollout percentage (0-100).
- eng_admin can create flags and change dev/staging directly.
- Any change to prod requires approval from a different eng_admin (use the kit's maker-checker approvals).
- Show a per-flag change history from the audit log.
- Add a "kill switch" on prod that sets enabled=false. It still needs approval, but shows up at the top of the approvals queue as urgent.
- Seed 12 realistic flags.
