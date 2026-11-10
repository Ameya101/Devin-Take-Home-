import { registerApprovalType } from "@/kit/approvals/registry";
import { FLAG_KILL_SWITCH_APPROVAL, FLAG_PROD_CHANGE_APPROVAL } from "./config";
import { formatState } from "./policy";
import { executeProdChange, recordProdChangeFailed, recordProdChangeRejected, type ProdChangePayload } from "./service";

registerApprovalType<ProdChangePayload>(FLAG_PROD_CHANGE_APPROVAL, {
  permissionToApprove: "flags.approve_prod",
  describe: (p) => `Prod change ${p.flagKey}: ${formatState(p.from)} → ${formatState(p.to)}${p.reason ? ` (${p.reason})` : ""}`,
  execute: (p, tx, { approver, request }) => executeProdChange(tx, p, approver, request),
  onReject: (p, tx, { approver, request }) => recordProdChangeRejected(tx, p, approver, request),
  onFailure: (p, tx, { approver, request }) => recordProdChangeFailed(tx, p, approver, request),
});

registerApprovalType<ProdChangePayload>(FLAG_KILL_SWITCH_APPROVAL, {
  permissionToApprove: "flags.approve_prod",
  urgent: true,
  describe: (p) => `Kill switch ${p.flagKey}: turn OFF in prod (now ${formatState(p.from)}). Reason: ${p.reason ?? "none"}`,
  execute: (p, tx, { approver, request }) => executeProdChange(tx, p, approver, request),
  onReject: (p, tx, { approver, request }) => recordProdChangeRejected(tx, p, approver, request),
  onFailure: (p, tx, { approver, request }) => recordProdChangeFailed(tx, p, approver, request),
});
