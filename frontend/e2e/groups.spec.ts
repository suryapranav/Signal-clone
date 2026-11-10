import { test, expect } from "./fixtures";
import { chatRow, history, send, signIn, unique } from "./helpers";

test("create a group, message it, and remove a member", async ({ browser }) => {
  const alice = await signIn(browser, "Alice Chen");
  const bob = await signIn(browser, "Bob Martinez");
  const name = unique("Launch Party");

  await alice.getByLabel("New chat").click();
  await alice.getByText("New group").click();
  await alice.getByRole("checkbox", { name: "Bob Martinez" }).click();
  await alice.getByRole("checkbox", { name: "Priya Sharma" }).click();
  await alice.getByRole("button", { name: "Next" }).click();
  await alice.getByLabel("Group name").fill(name);
  await alice.getByRole("button", { name: "Create" }).click();
  await expect(history(alice).getByText("You created the group.")).toBeVisible();

  // The new group appears in Bob's list without a refresh.
  await expect(chatRow(bob, name)).toBeVisible();
  await send(alice, "Welcome everyone 🎉");
  await chatRow(bob, name).click();
  await expect(history(bob).getByText("Welcome everyone 🎉")).toBeVisible();
  await expect(history(bob).getByText("Alice Chen", { exact: true }).first()).toBeVisible(); // sender name in a group

  // Alice (admin) removes Bob; Bob's composer is replaced and he is told why.
  await alice.locator("header button[title='Group settings']").click();
  await expect(alice.getByText("3 members").first()).toBeVisible();
  await alice.getByLabel("Options for Bob Martinez").click();
  await alice.getByRole("menuitem", { name: "Remove from group" }).click();
  await alice.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(alice.getByText("2 members").first()).toBeVisible();

  await expect(bob.getByText("You can't send messages to this group")).toBeVisible();
  await expect(history(bob).getByText("Alice Chen removed you.")).toBeVisible();
});
