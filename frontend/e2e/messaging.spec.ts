import { test, expect } from "./fixtures";
import { chatRow, history, messageRow, send, signIn, unique } from "./helpers";

test("two people chat in real time: typing, delivery, read receipts, reactions and replies", async ({ browser }) => {
  const alice = await signIn(browser, "Alice Chen");
  const bob = await signIn(browser, "Bob Martinez");
  const text = unique("See you at the trailhead");

  await chatRow(alice, "Bob Martinez").click();
  await chatRow(bob, "Alice Chen").click();

  // Bob sees Alice typing before she sends.
  await alice.getByLabel("Message", { exact: true }).pressSequentially(text.slice(0, 12), { delay: 20 });
  await expect(bob.getByText("typing…")).toBeVisible();
  await alice.getByLabel("Message", { exact: true }).fill(text);
  await alice.keyboard.press("Enter");

  // The message arrives, and because Bob has the chat open Alice sees "Read".
  await expect(messageRow(bob, text)).toBeVisible();
  await expect(messageRow(alice, text).getByRole("img", { name: "Read" })).toBeVisible();

  // Message details lists Bob under "Read by".
  await messageRow(alice, text).hover();
  await messageRow(alice, text).getByLabel("More actions").click();
  await alice.getByRole("menuitem", { name: "Message details" }).click();
  const details = alice.getByRole("dialog", { name: "Message details" });
  await expect(details.getByText("Read by")).toBeVisible();
  await expect(details.getByText("Bob Martinez")).toBeVisible();
  await alice.keyboard.press("Escape");

  // Bob reacts, then replies quoting the message.
  const row = messageRow(bob, text);
  await row.hover();
  await row.getByLabel("React").click();
  await bob.getByLabel("React with 👍").click();
  await expect(messageRow(alice, text).getByText("👍")).toBeVisible();

  await row.hover();
  await row.getByLabel("Reply").click();
  const reply = unique("Perfect 🙌");
  await send(bob, reply);
  const replyRow = messageRow(alice, reply);
  await expect(replyRow).toBeVisible();
  await expect(replyRow.getByText(text)).toBeVisible(); // the quoted original

  // The chat list preview follows the latest message.
  await expect(chatRow(alice, "Bob Martinez")).toContainText(reply);
});

test("unread messages are counted until the chat is opened", async ({ browser }) => {
  const priya = await signIn(browser, "Priya Sharma");
  const alice = await signIn(browser, "Alice Chen");

  // Priya catches up on Alice's chat, then switches to another one.
  await chatRow(priya, "Alice Chen").click();
  await chatRow(priya, "Weekend Hike 🥾").click();
  await chatRow(alice, "Priya Sharma").click();

  const first = unique("Are you free later?");
  await send(alice, first);
  await send(alice, unique("Call me"));

  await expect(chatRow(priya, "Alice Chen")).toContainText("Call me");
  await expect(chatRow(priya, "Alice Chen").getByLabel("2 unread")).toBeVisible();
  await expect(messageRow(alice, first).getByRole("img", { name: "Delivered" })).toBeVisible();

  // Opening the chat shows where the unread messages start and sends read receipts.
  await chatRow(priya, "Alice Chen").click();
  await expect(history(priya).getByText("2 unread messages")).toBeVisible();
  await expect(messageRow(alice, first).getByRole("img", { name: "Read" })).toBeVisible();
  await expect(chatRow(priya, "Alice Chen").getByLabel("2 unread")).toHaveCount(0);
});
