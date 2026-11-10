import { approve } from "@/kit/approvals/service";
import type { SessionUser } from "@/kit/auth/types";
import type { OwnerTeam } from "./config";
import type { EnvState } from "./policy";
import { createFlag, requestKillSwitch, requestProdChange, setDirectState } from "./service";

type SeedFlag = {
  key: string;
  description: string;
  ownerTeam: OwnerTeam;
  dev: EnvState;
  staging: EnvState;
  /** Applied through a real prod_change approval (requested by one eng_admin, approved by the other). */
  prod?: EnvState;
  /** Left pending in the approvals queue. */
  pendingProd?: EnvState & { reason: string };
  /** Approved kill switch after prod was turned on. */
  killed?: string;
};

const on = (rolloutPercent: number): EnvState => ({ enabled: true, rolloutPercent });
const off: EnvState = { enabled: false, rolloutPercent: 0 };

const FLAGS: SeedFlag[] = [
  { key: "checkout.new-payment-sheet", ownerTeam: "payments", description: "New one-page payment sheet in web checkout, replacing the legacy 3-step flow.", dev: on(100), staging: on(100), prod: on(25) },
  { key: "payments.3ds2-frictionless", ownerTeam: "payments", description: "Send extra device data to the issuer so more 3DS2 challenges are frictionless.", dev: on(100), staging: on(100), prod: on(100) },
  { key: "ledger.async-reconciliation", ownerTeam: "ledger", description: "Reconcile processor settlement files asynchronously via the job queue instead of the nightly batch.", dev: on(100), staging: on(50) },
  { key: "onboarding.kyc-doc-autocapture", ownerTeam: "onboarding", description: "Auto-capture ID documents in the KYC flow once the frame is sharp, instead of a manual shutter.", dev: on(100), staging: on(100), prod: on(10) },
  { key: "risk.velocity-rules-v2", ownerTeam: "risk", description: "Second-generation card velocity rules (per-merchant + per-device windows) for fraud scoring.", dev: on(100), staging: on(100), prod: on(50), killed: "False-positive declines spiked to 4% after rollout" },
  { key: "cards.virtual-card-issuance", ownerTeam: "cards", description: "Let business customers issue single-use virtual cards from the dashboard.", dev: on(100), staging: on(100), prod: on(100) },
  { key: "transfers.instant-ach", ownerTeam: "money-movement", description: "Same-day ACH for outgoing transfers under $25k, priced as an add-on.", dev: on(100), staging: on(100), pendingProd: { ...on(10), reason: "Partner bank certified same-day window; start with 10%" } },
  { key: "web.dashboard-redesign", ownerTeam: "growth", description: "Redesigned home dashboard with cash-flow chart and quick actions.", dev: on(100), staging: on(75) },
  { key: "notifications.weekly-digest", ownerTeam: "growth", description: "Weekly email digest of account activity, replacing per-event emails for low-value events.", dev: on(100), staging: on(100), prod: on(100) },
  { key: "api.per-tenant-rate-limits", ownerTeam: "platform", description: "Enforce public API rate limits per tenant instead of per API key.", dev: on(100), staging: { enabled: false, rolloutPercent: 100 } },
  { key: "mobile.biometric-step-up", ownerTeam: "mobile", description: "Require Face ID / fingerprint step-up before adding a new payee in the mobile app.", dev: on(100), staging: on(100), prod: on(5) },
  { key: "support.in-app-chat", ownerTeam: "support-tools", description: "In-app support chat for logged-in customers, routed to the Tier 1 queue.", dev: on(50), staging: off },
];

/** Seeds 12 flags through the real service + approvals so every state is in the audit chain. */
export async function seedFeatureFlags(eng: SessionUser, eng2: SessionUser): Promise<number> {
  for (const [i, f] of FLAGS.entries()) {
    const [maker, checker] = i % 2 ? [eng2, eng] : [eng, eng2];
    const flag = await createFlag(maker, { key: f.key, description: f.description, ownerTeam: f.ownerTeam });
    for (const environment of ["dev", "staging"] as const) {
      const s = f[environment];
      if (s.enabled || s.rolloutPercent) await setDirectState(maker, { flagId: flag.id, environment, ...s });
    }
    if (f.prod) {
      const { approval } = await requestProdChange(maker, { flagId: flag.id, ...f.prod, reason: "Staging soak complete" });
      await approve(approval.id, checker, "Dashboards look healthy");
    }
    if (f.killed) {
      const { approval } = await requestKillSwitch(checker, { flagId: flag.id, reason: f.killed });
      await approve(approval.id, maker, "Confirmed on the risk dashboard");
    }
    if (f.pendingProd) {
      const { reason, ...to } = f.pendingProd;
      await requestProdChange(maker, { flagId: flag.id, ...to, reason });
    }
  }
  return FLAGS.length;
}
