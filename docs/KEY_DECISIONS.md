# Key Decisions: Internal Tools Kit built with Devin

**Repo:** [https://github.com/Ameya101/Devin-Take-Home-](https://github.com/Ameya101/Devin-Take-Home-)

## What I chose to build, and why

The client already has three Power Apps and plans ten more, so the question is not "can Devin build a refunds screen". It can. The question is whether their engineers can own the layer that makes Power Apps safe to use in a regulated company: Entra ID sign-in, roles, audit history, and approvals. That layer is what Power Apps charges for. So I scoped the prototype as one shared governance kit with two apps on top, instead of cloning all three apps. The kit has four parts: pluggable auth, server-side RBAC, a hash-chained audit log, and maker-checker approvals. The two apps are Refunds and Feature Flag Admin. The second app tests the claim that matters for the next ten: once the kit exists, a new app is mostly a spec plus review.

## Key architectural decisions

**Authorization lives on the server, in one wrapper.** Every server action and data loader goes through `withPermission(permission, handler)`. Roles map to permissions in one file. A guardrail test fails the build if any action runs for an anonymous caller. With 13+ apps written partly by an agent, I wanted a rule that is enforced mechanically and doesn't depend on reviewers noticing a missing check.

**Audit is written in the same transaction as the change, and hash-chained.** Each event stores before and after values and the hash of the previous event, so a direct edit to the table is detectable ("Verify integrity"). I kept it in the app database instead of an external log store. This is simpler for a proof of concept, but it means the chain head needs off-site anchoring before production.

**Maker-checker is a kit primitive, not app code.** Approval types register a permission and an `execute` function. The kit enforces approver ≠ requester on the server and runs the action in the same transaction as the decision. Refunds over $500 and every prod flag change use the same mechanism. A kill switch is marked urgent but still needs a second engineer.

**Boring stack.** Next.js, Prisma, SQLite locally, Postgres in Docker. I picked it because it is what Devin and most of their engineers can work in without ramp-up. Auth (OIDC) and payments sit behind interfaces with a dev and a mock implementation.

**How I used Devin.** Rules went into Devin Knowledge (permission checks, audit in the same transaction, money in cents). A Playbook covered "add a new app on the kit". I ran three sessions on stacked branches, one PR each, with Devin Review on every PR. Rules that Devin sees in every session were more effective than repeating them in prompts.

## What happened (approximate, from commit times)

- Session 1, kit and Refunds: first working commit about 20 minutes after the prompt. Then about 40 minutes of Devin Review flagging issues and Devin fixing them. Most were real money bugs: "1,00" parsed as $100, a failed approval stranding a refund, and a possible double refund when the processor's response is lost.
- Session 2, Feature Flags from a 10-line spec: a working app about 6 minutes after the prompt, following every kit rule without being told again.
- Session 3, hardening: CI, Playwright tests, Docker with Postgres, ADRs, and a Production gaps list in about 20 minutes. 88 unit tests pass and CI is green.

## Tradeoffs and what I left out

I skipped the KYC queue. A third app would add little evidence over the second. Real OIDC, a real processor, an outbox for the payment call, a deploy pipeline, and data retention are listed as gaps, not built. The most useful lesson was the review loop. An automated reviewer will keep finding real edge cases in payments code, including in a mock. A human had to decide when the prototype was good enough and write the rest down as known gaps. That judgment, plus owning the kit long term, is the real cost of building instead of buying.
