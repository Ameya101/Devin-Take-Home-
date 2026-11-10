import type { ApprovalRequest } from "@prisma/client";
import type { SessionUser } from "@/kit/auth/types";
import type { Tx } from "@/kit/db";
import { can } from "@/kit/rbac/can";
import type { Permission } from "@/kit/rbac/permissions";

export type ApprovalContext = { request: ApprovalRequest; approver: SessionUser };

export type ApprovalTypeDefinition<P> = {
  /** Permission an approver must hold. The requester can never approve their own request. */
  permissionToApprove: Permission;
  /** Runs inside the approval transaction. Throwing rolls back and marks the request "failed". */
  execute: (payload: P, tx: Tx, ctx: ApprovalContext) => Promise<unknown>;
  /** Optional hook run inside the rejection transaction (e.g. to update the domain row). */
  onReject?: (payload: P, tx: Tx, ctx: ApprovalContext) => Promise<void>;
  /** Optional hook run in the transaction that marks the request "failed". Only release reservations when `error` proves no side effect happened. */
  onFailure?: (payload: P, tx: Tx, ctx: ApprovalContext & { error: unknown }) => Promise<void>;
  /** Urgent requests are sorted to the top of approvers' queues and badged. Default false. */
  urgent?: boolean;
  /** Optional one-line human summary for the approvals queue. */
  describe?: (payload: P) => string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ApprovalTypeDefinition<any>>();

export function registerApprovalType<P>(type: string, definition: ApprovalTypeDefinition<P>): void {
  registry.set(type, definition);
}

export function getApprovalType<P = unknown>(type: string): ApprovalTypeDefinition<P> {
  const definition = registry.get(type);
  if (!definition) throw new Error(`Unknown approval type "${type}". Did you import src/apps/approval-types?`);
  return definition;
}

export function approvalTypesApprovableBy(user: SessionUser): string[] {
  return [...registry.entries()].filter(([, d]) => can(user, d.permissionToApprove)).map(([type]) => type);
}

export function describeApproval(type: string, payload: unknown): string {
  const definition = registry.get(type);
  return definition?.describe ? definition.describe(payload) : JSON.stringify(payload);
}
