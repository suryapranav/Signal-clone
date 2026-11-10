import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { chatRow, history, messageRow, send, signIn, unique } from "./helpers";

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true });
const settingsPage = (page: Page, name: string) => page.getByRole("complementary").getByRole("button", { name, exact: true });

test("edit a message and delete it for everyone, live on both sides", async ({ browser }) => {
  const alice = await signIn(browser, "Alice Chen");
  const bob = await signIn(browser, "Bob Martinez");
  await chatRow(alice, "Bob Martinez").click();
  await chatRow(bob, "Alice Chen").click();

  const original = unique("Meet at 9");
  await send(alice, original);
  await expect(messageRow(bob, original)).toBeVisible();

  // Edit: the composer switches to edit mode with the old text loaded.
  const edited = original.replace("9", "10");
  const row = messageRow(alice, original);
  await row.hover();
  await row.getByLabel("More actions").click();
  await alice.getByRole("menuitem", { name: "Edit" }).click();
  await expect(alice.getByText("Edit message")).toBeVisible();
  await expect(alice.getByLabel("Message", { exact: true })).toHaveValue(original);
  await alice.getByLabel("Message", { exact: true }).fill(edited);
  await alice.keyboard.press("Enter");

  const bobsCopy = messageRow(bob, edited);
  await expect(bobsCopy).toBeVisible();
  await expect(bobsCopy.getByText("Edited")).toBeVisible();
  await expect(messageRow(bob, original)).toHaveCount(0);
  await expect(alice.getByText("Edit message")).toHaveCount(0);

  // Delete for everyone, after a confirmation.
  const mine = messageRow(alice, edited);
  await mine.hover();
  await mine.getByLabel("More actions").click();
  await alice.getByRole("menuitem", { name: "Delete for everyone" }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

  await expect(history(alice).getByText("You deleted this message")).toBeVisible();
  await expect(history(bob).getByText("Alice Chen deleted this message")).toBeVisible();
  await expect(messageRow(bob, edited)).toHaveCount(0);
  await expect(chatRow(bob, "Alice Chen")).toContainText("This message was deleted");

  // Bob can't edit or delete Alice's messages.
  await send(alice, unique("Still here"));
  const theirs = bob.getByRole("log").locator("[id^=msg-]").last();
  await theirs.hover();
  await theirs.getByLabel("More actions").click();
  await expect(bob.getByRole("menuitem", { name: "Message details" })).toBeVisible();
  await expect(bob.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
  await expect(bob.getByRole("menuitem", { name: "Delete for everyone" })).toHaveCount(0);
});

test("settings switches change behaviour: Enter key sends, read receipts", async ({ browser }) => {
  const alice = await signIn(browser, "Alice Chen");
  const bob = await signIn(browser, "Bob Martinez");

  // Enter key sends off → Enter is a new line, Ctrl+Enter sends.
  await tab(alice, "Settings").click();
  await settingsPage(alice, "Chats").click();
  await alice.getByRole("switch", { name: "Enter key sends" }).click();
  await tab(alice, "Chats").click();
  await chatRow(alice, "Bob Martinez").click();
  const box = alice.getByLabel("Message", { exact: true });
  const line = unique("two lines");
  await box.fill(line);
  await box.press("Enter");
  await expect(box).toHaveValue(`${line}\n`);
  await box.press("Control+Enter");
  await expect(messageRow(alice, line)).toBeVisible();
  await expect(box).toHaveValue("");

  // Bob turns read receipts off: Alice's next message stops at "Delivered" even though he reads it.
  await tab(bob, "Settings").click();
  await settingsPage(bob, "Privacy").click();
  const receipts = bob.getByRole("switch", { name: "Read receipts" });
  await receipts.click();
  await expect(receipts).toHaveAttribute("aria-checked", "false");
  await tab(bob, "Chats").click();
  await chatRow(bob, "Alice Chen").click();

  const quiet = unique("Did you read this?");
  await box.fill(quiet);
  await box.press("Control+Enter");
  await expect(messageRow(bob, quiet)).toBeVisible();
  await expect(messageRow(alice, quiet).getByRole("img", { name: "Delivered" })).toBeVisible();
  await alice.waitForTimeout(1000);
  await expect(messageRow(alice, quiet).getByRole("img", { name: "Read" })).toHaveCount(0);

  // Put both settings back for later tests.
  await tab(bob, "Settings").click();
  await settingsPage(bob, "Privacy").click();
  await bob.getByRole("switch", { name: "Read receipts" }).click();
  await expect(bob.getByRole("switch", { name: "Read receipts" })).toHaveAttribute("aria-checked", "true");
});
