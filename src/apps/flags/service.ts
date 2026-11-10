import { Prisma, type ApprovalRequest, type FeatureFlag, type FlagChangeRequest, type FlagEnvironment } from "@prisma/client";
import { requestApproval } from "@/kit/approvals/service";
import { audit } from "@/kit/audit/audit";
import type { SessionUser } from "@/kit/auth/types";
import { prisma, type Tx } from "@/kit/db";
import { ConflictError, NotFoundError, ValidationError } from "@/kit/errors";
import { ENVIRONMENTS, FLAG_ENTITY, FLAG_KILL_SWITCH_APPROVAL, FLAG_PROD_CHANGE_APPROVAL, type Environment } from "./config";
import { canApplyProdChange, formatState, routeFlagChange, sameState, stateOf, type EnvState, type FlagChangeKind } from "./policy";
import { createFlagSchema, envStateSchema, type CreateFlagInput } from "./schema";

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export type FlagWithEnvironments = FeatureFlag & { environments: FlagEnvironment[] };

/** Payload stored on both flag approval types. */
export type ProdChangePayload = {
  flagId: string;
  flagKey: string;
  kind: FlagChangeKind;
  from: EnvState;
  to: EnvState;
  reason: string | null;
};

function envSnapshot(e: FlagEnvironment) {
  return { environment: e.environment, enabled: e.enabled, rolloutPercent: e.rolloutPercent };
}

function flagSnapshot(f: FlagWithEnvironments) {
  return {
    id: f.id,
    key: f.key,
    description: f.description,
    ownerTeam: f.ownerTeam,
    environments: Object.fromEntries(f.environments.map((e) => [e.environment, stateOf(e)])),
  };
}

/** Creates a flag with every environment off at 0%. Turning it on anywhere is a separate, audited change. */
export async function createFlag(user: SessionUser, input: CreateFlagInput): Promise<FlagWithEnvironments> {
  const data = createFlagSchema.parse(input);
  const duplicate = () => new ConflictError(`A flag with key "${data.key}" already exists`);
  return prisma
    .$transaction(async (tx) => {
      if (await tx.featureFlag.findUnique({ where: { key: data.key } })) throw duplicate();
      const flag = await tx.featureFlag.create({
        data: { ...data, environments: { create: ENVIRONMENTS.map((environment) => ({ environment })) } },
        include: { environments: true },
      });
      await audit.record(tx, { actor: user, action: "flag.created", entityType: FLAG_ENTITY, entityId: flag.id, before: null, after: flagSnapshot(flag) });
      return flag;
    })
    .catch((err) => {
      throw isUniqueViolation(err) ? duplicate() : err;
    });
}

async function loadEnvironment(tx: Tx, flagId: string, environment: Environment) {
  const env = await tx.flagEnvironment.findUnique({ where: { flagId_environment: { flagId, environment } }, include: { flag: true } });
  if (!env) throw new NotFoundError("Flag not found");
  return env;
}

async function applyState(
  tx: Tx,
  actor: SessionUser,
  env: FlagEnvironment & { flag: FeatureFlag },
  to: EnvState,
  action: string,
  metadata: Record<string, unknown>,
): Promise<FlagEnvironment> {
  const after = await tx.flagEnvironment.update({ where: { id: env.id }, data: stateOf(to) });
  await audit.record(tx, {
    actor,
    action,
    entityType: FLAG_ENTITY,
    entityId: env.flagId,
    before: envSnapshot(env),
    after: envSnapshot(after),
    metadata: { flagKey: env.flag.key, environment: env.environment, ...metadata },
  });
  return after;
}

/** dev/staging only: applies immediately. */
export async function setDirectState(
  user: SessionUser,
  input: { flagId: string; environment: Environment } & EnvState,
): Promise<FlagEnvironment> {
  if (routeFlagChange(input.environment) !== "apply_directly") {
    throw new ValidationError(`${input.environment} changes need approval; request a prod change instead`);
  }
  const to = envStateSchema.parse({ enabled: input.enabled, rolloutPercent: input.rolloutPercent });
  return prisma.$transaction(async (tx) => {
    const env = await loadEnvironment(tx, input.flagId, input.environment);
    if (sameState(env, to)) throw new ValidationError(`No change: ${input.environment} is already ${formatState(env)}`);
    return applyState(tx, user, env, to, "flag.env_updated", { route: "direct" });
  });
}

/** Prod change requests for a flag whose approval is still pending. */
export async function pendingProdRequests(db: Tx | typeof prisma, flagIds: string[]): Promise<FlagChangeRequest[]> {
  const requests = await db.flagChangeRequest.findMany({ where: { flagId: { in: flagIds } } });
  if (requests.length === 0) return [];
  const pending = await db.approvalRequest.findMany({
    where: { id: { in: requests.map((r) => r.approvalRequestId) }, status: "pending" },
    select: { id: true },
  });
  const pendingIds = new Set(pending.map((p) => p.id));
  return requests.filter((r) => pendingIds.has(r.approvalRequestId));
}

async function createProdRequest(
  tx: Tx,
  user: SessionUser,
  env: FlagEnvironment & { flag: FeatureFlag },
  kind: FlagChangeKind,
  to: EnvState,
  reason: string | null,
): Promise<{ changeRequest: FlagChangeRequest; approval: ApprovalRequest }> {
  const from = stateOf(env);
  const payload: ProdChangePayload = { flagId: env.flagId, flagKey: env.flag.key, kind, from, to, reason };
  const approval = await requestApproval(tx, {
    type: kind === "kill_switch" ? FLAG_KILL_SWITCH_APPROVAL : FLAG_PROD_CHANGE_APPROVAL,
    payload,
    requestedBy: user,
  });
  const changeRequest = await tx.flagChangeRequest.create({
    data: {
      flagId: env.flagId,
      kind,
      environment: "prod",
      fromEnabled: from.enabled,
      fromRolloutPercent: from.rolloutPercent,
      toEnabled: to.enabled,
      toRolloutPercent: to.rolloutPercent,
      reason,
      requestedById: user.id,
      approvalRequestId: approval.id,
      pendingSlot: `${env.flagId}:${kind}`,
    },
  });
  await audit.record(tx, {
    actor: user,
    action: kind === "kill_switch" ? "flag.kill_switch_requested" : "flag.prod_change_requested",
    entityType: FLAG_ENTITY,
    entityId: env.flagId,
    before: null,
    after: changeRequest,
    metadata: { flagKey: env.flag.key, environment: "prod", approvalRequestId: approval.id },
  });
  return { changeRequest, approval };
}

/** Frees the flag's pending slot once the approval is decided (runs inside the decision transaction). */
async function releasePendingSlot(tx: Tx, approvalRequestId: string) {
  await tx.flagChangeRequest.update({ where: { approvalRequestId }, data: { pendingSlot: null } });
}

/** The pending slot's unique index makes "one pending request per flag and kind" hold even for concurrent requests. */
async function withPendingSlot<T>(kind: FlagChangeKind, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    throw new ConflictError(kind === "kill_switch" ? "A kill switch for this flag is already waiting for approval" : "This flag already has a prod change waiting for approval");
  }
}

/** Any prod change becomes a "flag.prod_change" approval request. One pending change per flag at a time. */
export async function requestProdChange(user: SessionUser, input: { flagId: string; reason?: string } & EnvState) {
  const to = envStateSchema.parse({ enabled: input.enabled, rolloutPercent: input.rolloutPercent });
  return withPendingSlot("change", () => prisma.$transaction(async (tx) => {
    const env = await loadEnvironment(tx, input.flagId, "prod");
    if (sameState(env, to)) throw new ValidationError(`No change: prod is already ${formatState(env)}`);
    const pending = await pendingProdRequests(tx, [input.flagId]);
    if (pending.some((r) => r.kind === "change")) {
      throw new ConflictError("This flag already has a prod change waiting for approval");
    }
    return createProdRequest(tx, user, env, "change", to, input.reason || null);
  }));
}

/** Kill switch: request enabled=false in prod. Still needs approval, but the approval type is urgent. */
export async function requestKillSwitch(user: SessionUser, input: { flagId: string; reason: string }) {
  return withPendingSlot("kill_switch", () => prisma.$transaction(async (tx) => {
    const env = await loadEnvironment(tx, input.flagId, "prod");
    if (!env.enabled) throw new ValidationError("Prod is already off");
    const pending = await pendingProdRequests(tx, [input.flagId]);
    if (pending.some((r) => r.kind === "kill_switch")) {
      throw new ConflictError("A kill switch for this flag is already waiting for approval");
    }
    return createProdRequest(tx, user, env, "kill_switch", { enabled: false, rolloutPercent: env.rolloutPercent }, input.reason);
  }));
}

/** Approval execute(): runs in the approval transaction, as the approver. */
export async function executeProdChange(tx: Tx, payload: ProdChangePayload, approver: SessionUser, request: ApprovalRequest) {
  const env = await loadEnvironment(tx, payload.flagId, "prod");
  if (!canApplyProdChange(payload.kind, payload.from, env)) {
    throw new ConflictError(
      `prod changed since this was requested (requested from ${formatState(payload.from)}, now ${formatState(env)}); request a new change`,
    );
  }
  // A kill switch only turns prod off; it keeps whatever rollout prod has now (it may have changed since the request).
  const to = payload.kind === "kill_switch" ? { enabled: false, rolloutPercent: env.rolloutPercent } : payload.to;
  await releasePendingSlot(tx, request.id);
  const after = await applyState(tx, approver, env, to, payload.kind === "kill_switch" ? "flag.kill_switch_executed" : "flag.env_updated", {
    route: "approval",
    approvalRequestId: request.id,
    requestedById: request.requestedById,
  });
  return envSnapshot(after);
}

/** Approval onFailure(): execute() threw (e.g. prod changed since the request), so record that on the flag's history. */
export async function recordProdChangeFailed(tx: Tx, payload: ProdChangePayload, approver: SessionUser, request: ApprovalRequest, error: unknown) {
  await releasePendingSlot(tx, request.id);
  await audit.record(tx, {
    actor: approver,
    action: payload.kind === "kill_switch" ? "flag.kill_switch_failed" : "flag.prod_change_failed",
    entityType: FLAG_ENTITY,
    entityId: payload.flagId,
    before: null,
    after: null,
    metadata: { flagKey: payload.flagKey, environment: "prod", approvalRequestId: request.id, error: error instanceof Error ? error.message : String(error) },
  });
}

/** Approval onReject(): records the rejection on the flag's history. */
export async function recordProdChangeRejected(tx: Tx, payload: ProdChangePayload, approver: SessionUser, request: ApprovalRequest) {
  await releasePendingSlot(tx, request.id);
  await audit.record(tx, {
    actor: approver,
    action: payload.kind === "kill_switch" ? "flag.kill_switch_rejected" : "flag.prod_change_rejected",
    entityType: FLAG_ENTITY,
    entityId: payload.flagId,
    before: null,
    after: null,
    metadata: { flagKey: payload.flagKey, environment: "prod", approvalRequestId: request.id, note: request.decisionNote },
  });
}
