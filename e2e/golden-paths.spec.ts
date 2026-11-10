import { expect, test } from "@playwright/test";
import { db, signInAs } from "./helpers";

test.afterAll(() => db.$disconnect());

test("large refund: agent requests, a different approver approves, audit chain verifies", async ({ page }) => {
  const payment = await db.payment.findFirstOrThrow({
    where: { status: "succeeded", amountCents: { gte: 200_000 }, refunds: { none: {} } },
    orderBy: { createdAt: "desc" },
  });

  await signInAs(page, "agent@acme.test");
  await page.goto(`/refunds/${payment.id}`);
  await page.getByLabel("Amount (USD)").fill("900");
  await page.getByLabel("Reason").selectOption("requested_by_customer");
  await page.getByRole("button", { name: /issue refund/i }).click();
  await expect(page.getByText(/sent for approval/i)).toBeVisible();

  await page.goto("/approvals");
  await expect(page.getByText("Nothing is waiting for you.")).toBeVisible();

  await signInAs(page, "approver@acme.test");
  await page.goto("/approvals");
  const row = page.getByRole("row").filter({ hasText: payment.id.slice(-6) }).filter({ hasText: "$900.00" });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0);
  await expect.poll(async () => (await db.refund.findFirst({ where: { paymentId: payment.id } }))?.status).toBe("processed");

  await signInAs(page, "admin@acme.test");
  await page.goto("/admin/audit");
  await page.getByRole("button", { name: "Verify integrity" }).click();
  await expect(page.getByText(/Chain intact/)).toBeVisible();
});

test("prod flag change: eng@ requests, eng2@ approves", async ({ page }) => {
  const flag = await db.featureFlag.findUniqueOrThrow({ where: { key: "ledger.async-reconciliation" } });

  await signInAs(page, "eng@acme.test");
  await page.goto(`/flags/${flag.id}`);
  const prod = page.getByTestId("env-form-prod");
  await prod.getByLabel("Enabled").check();
  await prod.getByLabel("Rollout").fill("10");
  await prod.getByPlaceholder(/why/i).fill("Start the canary");
  await prod.getByRole("button", { name: "Request prod change" }).click();
  await expect(prod.getByRole("status")).toHaveText(/sent for approval/i);

  await signInAs(page, "eng2@acme.test");
  await page.goto("/approvals");
  const row = page.getByRole("row").filter({ hasText: "ledger.async-reconciliation" });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0);

  await expect
    .poll(async () => db.flagEnvironment.findUniqueOrThrow({ where: { flagId_environment: { flagId: flag.id, environment: "prod" } } }))
    .toMatchObject({ enabled: true, rolloutPercent: 10 });
});
