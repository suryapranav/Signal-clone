import { test, expect } from "./fixtures";
import { chatRow, history, send, signIn, unique } from "./helpers";

test("disappearing messages vanish when their timer runs out", async ({ browser }) => {
  test.setTimeout(90_000);
  const alice = await signIn(browser, "Alice Chen");
  await chatRow(alice, "Emma Wilson").click();

  await alice.locator("header button[title='Chat settings']").click();
  await alice.getByLabel("Disappearing messages timer").selectOption("30");
  await alice.getByLabel("Back to chat").click();
  await expect(history(alice).getByText("You set the disappearing message timer to 30 seconds.").last()).toBeVisible();

  const text = unique("This will vanish");
  await send(alice, text);
  await expect(history(alice).getByText(text)).toBeVisible();
  await expect(history(alice).getByText(text)).toHaveCount(0, { timeout: 45_000 });

  // Turn the timer back off so re-runs start from the same state.
  await alice.locator("header button[title='Chat settings']").click();
  await alice.getByLabel("Disappearing messages timer").selectOption("0");
  await alice.getByLabel("Back to chat").click();
});

test("search finds chats and messages in a chat; archive hides a chat until it is unarchived", async ({ browser }) => {
  const alice = await signIn(browser, "Alice Chen");

  await alice.keyboard.press("Control+k");
  await alice.keyboard.type("rahul");
  await expect(chatRow(alice, "Rahul Verma")).toBeVisible();
  await expect(chatRow(alice, "Bob Martinez")).toHaveCount(0);
  await alice.getByLabel("Clear search").click();

  // Search inside one chat highlights matches and steps through them.
  await chatRow(alice, "Bob Martinez").click();
  await alice.getByLabel("Search in chat").click();
  await alice.getByLabel("Search messages in this chat").fill("the");
  await expect(alice.getByText(/^1 of \d+$/)).toBeVisible();
  await expect(history(alice).locator("mark").first()).toBeVisible();
  await alice.getByLabel("Older match").click();
  await expect(alice.getByText(/^2 of \d+$/)).toBeVisible();
  await alice.getByLabel("Close search").click();
  await expect(history(alice).locator("mark")).toHaveCount(0);

  const row = chatRow(alice, "Rahul Verma");
  await row.hover();
  await row.getByLabel("Chat options").click();
  await alice.getByRole("menuitem", { name: "Archive" }).click();
  await expect(alice.getByText("Chat archived")).toBeVisible();
  await expect(chatRow(alice, "Rahul Verma")).toHaveCount(0);

  await alice.getByRole("button", { name: /Archived chats/ }).click();
  const archived = chatRow(alice, "Rahul Verma");
  await archived.hover();
  await archived.getByLabel("Chat options").click();
  await alice.getByRole("menuitem", { name: "Unarchive" }).click();
  await alice.getByRole("button", { name: "Back to chats" }).click(); // the visible one
  await expect(chatRow(alice, "Rahul Verma")).toBeVisible();
});
