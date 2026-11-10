import { PrismaClient } from "@prisma/client";
import "../src/apps/approval-types";
import { issueRefund } from "../src/apps/refunds/service";
import { audit } from "../src/kit/audit/audit";
import { toSessionUser } from "../src/kit/auth/user";

const prisma = new PrismaClient();

// Deterministic PRNG so every db:reset produces the same data.
let seed = 42;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

const USERS = [
  { email: "viewer@acme.test", name: "Vera Viewer", role: "viewer" },
  { email: "agent@acme.test", name: "Alex Agent", role: "support_agent" },
  { email: "agent2@acme.test", name: "Sam Second-Agent", role: "support_agent" },
  { email: "approver@acme.test", name: "Fiona Finance", role: "finance_approver" },
  { email: "eng@acme.test", name: "Eli Engineer", role: "eng_admin" },
  { email: "admin@acme.test", name: "Pat Platform", role: "platform_admin" },
];

const CUSTOMERS = [
  "Olivia Martin", "Liam Chen", "Emma Rodriguez", "Noah Patel", "Ava Johnson", "Ethan Kim", "Sophia Nguyen",
  "Mason Brown", "Isabella Garcia", "Lucas Wilson", "Mia Thompson", "Elijah Davis", "Amelia Lopez", "James Lee",
  "Harper Clark", "Benjamin Walker", "Evelyn Hall", "Henry Young", "Abigail King", "Alexander Wright",
  "Emily Scott", "Daniel Green", "Ella Adams", "Michael Baker", "Grace Nelson",
];

async function main() {
  // Fixtures are inserted with a system actor and audited in the same transaction, like any other write.
  const { users, customers, payments } = await prisma.$transaction(
    async (tx) => {
      const created = async <T extends { id: string }>(entityType: string, row: Promise<T>) => {
        const after = await row;
        await audit.record(tx, { actor: null, action: "seed.created", entityType, entityId: after.id, before: null, after });
        return after;
      };
      const users = [];
      for (const u of USERS) users.push(await created("User", tx.user.create({ data: u })));
      const customers = [];
      for (const name of CUSTOMERS) {
        customers.push(await created("Customer", tx.customer.create({ data: { name, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com` } })));
      }
      const now = Date.now();
      const payments = [];
      for (let i = 0; i < 80; i++) {
        // Log-uniform between $5 and $4,000 so there is a realistic mix of small and large payments.
        const amountCents = Math.round(Math.exp(Math.log(500) + rand() * (Math.log(400_000) - Math.log(500))));
        payments.push(
          await created(
            "Payment",
            tx.payment.create({
              data: {
                customerId: pick(customers).id,
                amountCents,
                currency: "USD",
                status: rand() < 0.07 ? "failed" : "succeeded",
                cardLast4: String(Math.floor(rand() * 10_000)).padStart(4, "0"),
                createdAt: new Date(now - Math.floor(rand() * 90 * 24 * 3600 * 1000)),
              },
            }),
          ),
        );
      }
      return { users, customers, payments };
    },
    { timeout: 60_000 },
  );
  const byEmail = Object.fromEntries(users.map((u) => [u.email, toSessionUser(u)]));

  // Existing refunds go through the real service so they are audited like any other write.
  const succeeded = payments.filter((p) => p.status === "succeeded");
  const small = succeeded.filter((p) => p.amountCents >= 3_000 && p.amountCents <= 40_000).slice(0, 4);
  for (const [i, p] of small.entries()) {
    const amountCents = i === 0 ? p.amountCents : Math.round(p.amountCents / 2);
    await issueRefund(byEmail[i % 2 ? "agent2@acme.test" : "agent@acme.test"], { paymentId: p.id, amountCents, reason: pick(["duplicate", "requested_by_customer", "product_not_received"] as const) });
  }

  const large = succeeded.filter((p) => p.amountCents >= 120_000).slice(0, 2);
  await issueRefund(byEmail["agent@acme.test"], { paymentId: large[0].id, amountCents: 75_000, reason: "product_not_received", note: "Customer says the order never arrived." });
  await issueRefund(byEmail["agent2@acme.test"], { paymentId: large[1].id, amountCents: large[1].amountCents, reason: "fraudulent", note: "Card reported stolen." });

  const check = await audit.verifyChain(prisma);
  console.log(`Seeded ${users.length} users, ${customers.length} customers, ${payments.length} payments; audit chain ok=${check.ok} (${check.checked} events)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
