import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** "postgresql" when DATABASE_URL points at Postgres (docker compose / prod-like), else "sqlite" (local dev, tests). */
export const dbProvider: "postgresql" | "sqlite" = /^postgres(ql)?:/.test(process.env.DATABASE_URL ?? "") ? "postgresql" : "sqlite";

// SQLite allows one writer at a time. With several pooled connections, transactions waiting on the
// write lock can stall Prisma's query engine on low-core machines (e.g. 2-vCPU CI runners), so
// SQLite gets a single connection and transactions queue instead. Postgres keeps its pool.
function sqliteSingleConnection(url: string | undefined): string | undefined {
  if (!url || dbProvider !== "sqlite" || /[?&]connection_limit=/.test(url)) return undefined;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=1`;
}

const datasourceUrl = sqliteSingleConnection(process.env.DATABASE_URL);

export const prisma = globalForPrisma.prisma ?? new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** A Prisma interactive-transaction client. Kit functions that write take one of these. */
export type Tx = Prisma.TransactionClient;

