import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** A Prisma interactive-transaction client. Kit functions that write take one of these. */
export type Tx = Prisma.TransactionClient;

/** "postgresql" when DATABASE_URL points at Postgres (docker compose / prod-like), else "sqlite" (local dev, tests). */
export const dbProvider: "postgresql" | "sqlite" = /^postgres(ql)?:/.test(process.env.DATABASE_URL ?? "") ? "postgresql" : "sqlite";
