import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";

export const db = new PrismaClient({ datasourceUrl: "file:./e2e.db" });

export async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`${email.replace(/[.@]/g, "\\$&")}`) }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
