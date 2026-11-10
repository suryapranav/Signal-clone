import { devices } from "@playwright/test";
import { test, expect } from "./fixtures";
import { chatRow, history, messageRow, signIn } from "./helpers";

// iPhone 13 screen, touch and user agent, rendered by Chromium.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType, ...iPhone } = devices["iPhone 13"];

test("phone layout: one pane at a time, and the reaction picker stays on screen", async ({ browser }) => {
  const bob = await signIn(browser, "Bob Martinez", { ...iPhone, colorScheme: "dark" });

  await chatRow(bob, "Alice Chen").tap();
  await expect(bob.getByRole("heading", { name: "Chats" })).toBeHidden();
  const log = history(bob);
  const logBox = (await log.boundingBox())!;

  // Tap a message to show its actions, then open the picker.
  const row = messageRow(bob, "Yes! 10am at the trailhead?");
  await row.locator("p").first().tap();
  await row.getByLabel("React").tap();
  const picker = bob.getByRole("menu", { name: "React" });
  await expect(picker).toBeVisible();
  const box = (await picker.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(logBox.x);
  expect(box.x + box.width).toBeLessThanOrEqual(logBox.x + logBox.width + 0.5);
  expect(box.y).toBeGreaterThanOrEqual(logBox.y);

  await picker.getByLabel("React with 😂").tap();
  await expect(row.getByText("😂")).toBeVisible();

  // The "more actions" menu of an outgoing message stays inside the screen too.
  const own = messageRow(bob, "You're the best");
  await own.locator("p").first().tap();
  await own.getByLabel("More actions").tap();
  const menu = bob.getByRole("menu").filter({ has: bob.getByRole("menuitem", { name: "Message details" }) });
  await expect(menu).toBeVisible();
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(bob.viewportSize()!.width);
  await bob.keyboard.press("Escape");

  // Back returns to the list.
  await bob.getByLabel("Back to chats").tap();
  await expect(bob.getByRole("heading", { name: "Chats" })).toBeVisible();
});
