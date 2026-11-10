import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/kit/auth/types";
import { prisma } from "@/kit/db";
import type { Role } from "@/kit/rbac/permissions";

export async function makeUser(role: Role): Promise<SessionUser> {
  const email = `${role}-${randomUUID().slice(0, 8)}@test.local`;
  const user = await prisma.user.create({ data: { email, name: email, role } });
  return { id: user.id, email: user.email, name: user.name, role };
}

export async function makePayment(amountCents: number) {
  const customer = await prisma.customer.create({ data: { name: "Test Customer", email: `${randomUUID()}@example.com` } });
  return prisma.payment.create({ data: { customerId: customer.id, amountCents, currency: "USD", status: "succeeded", cardLast4: "4242" } });
}
