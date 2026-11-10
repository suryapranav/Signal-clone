import { expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

/** Errors logged by any page opened through `signIn`, checked after each test. */
export const pageErrors: string[] = [];

function watch(page: Page, who: string) {
  page.on("pageerror", (e) => pageErrors.push(`[${who}] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(`[${who}] ${m.text()}`);
  });
}

/** Opens a fresh browser context and signs in as a seeded demo account
 *  (the welcome screen lists them; every number accepts code 123456). */
export async function signIn(browser: Browser, name: string, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  const page = await context.newPage();
  watch(page, name);
  await page.goto("/");
  await page.getByRole("button", { name }).click();
  await page.getByLabel("Digit 1").fill("123456");
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible({ timeout: 15_000 });
  return page;
}

/** A row in the chat list, matched on its exact title. */
export function chatRow(page: Page, title: string) {
  return page.locator("[role=button]").filter({ has: page.getByText(title, { exact: true }) }).first();
}

/** The message history of the open conversation. */
export function history(page: Page) {
  return page.getByRole("log");
}

/** A single message row in the open conversation. */
export function messageRow(page: Page, text: string) {
  return history(page).locator("[id^=msg-]", { hasText: text });
}

export async function send(page: Page, text: string) {
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.keyboard.press("Enter");
}

/** Text unique to this run, so tests can be re-run against the same data. */
export function unique(label: string) {
  return `${label} ${Date.now().toString(36)}`;
}

/** Smallest valid PNG (1×1 pixel), for upload tests. */
export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);
