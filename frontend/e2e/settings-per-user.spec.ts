import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { signIn } from "./helpers";

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true });
const settingsPage = (page: Page, name: string) => page.getByRole("complementary").getByRole("button", { name, exact: true });
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? "system");

async function signOut(page: Page) {
  await tab(page, "Settings").click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Phone number" })).toBeVisible();
}

async function signInAs(page: Page, name: string) {
  await page.getByRole("button", { name }).click();
  await page.getByLabel("Digit 1").fill("123456");
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
}

test("each account keeps its own settings in a shared browser", async ({ browser }) => {
  const page = await signIn(browser, "Alice Chen");

  // Alice picks dark mode and turns off "Enter key sends".
  await tab(page, "Settings").click();
  await settingsPage(page, "Appearance").click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await settingsPage(page, "Chats").click();
  await page.getByRole("switch", { name: "Enter key sends" }).click();
  expect(await theme(page)).toBe("dark");

  // Bob signs in on the same browser and gets his own (default) settings.
  await signOut(page);
  expect(await theme(page)).toBe("system");
  await signInAs(page, "Bob Martinez");
  expect(await theme(page)).toBe("system");
  await tab(page, "Settings").click();
  await settingsPage(page, "Chats").click();
  await expect(page.getByRole("switch", { name: "Enter key sends" })).toHaveAttribute("aria-checked", "true");

  // Alice's choices are still there when she comes back, even after a reload.
  await signOut(page);
  await signInAs(page, "Alice Chen");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
  expect(await theme(page)).toBe("dark");
  await tab(page, "Settings").click();
  await settingsPage(page, "Chats").click();
  await expect(page.getByRole("switch", { name: "Enter key sends" })).toHaveAttribute("aria-checked", "false");
});
