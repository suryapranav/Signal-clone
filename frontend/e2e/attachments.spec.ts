import { test, expect } from "./fixtures";
import { chatRow, history, messageRow, signIn, tinyPng, unique } from "./helpers";

test("photos and files are uploaded, delivered live and downloadable", async ({ browser }) => {
  const alice = await signIn(browser, "Alice Chen");
  const bob = await signIn(browser, "Bob Martinez");
  await chatRow(alice, "Bob Martinez").click();
  await chatRow(bob, "Alice Chen").click();

  // A photo with a caption.
  const caption = unique("Trail preview!");
  await alice.getByLabel("Choose file").setInputFiles({ name: "trail.png", mimeType: "image/png", buffer: tinyPng });
  await expect(alice.getByLabel("Remove attachment")).toBeVisible();
  await alice.getByLabel("Message", { exact: true }).fill(caption);
  await alice.keyboard.press("Enter");
  const photo = messageRow(bob, caption);
  await expect(photo.getByRole("button", { name: "Open image trail.png" })).toBeVisible();

  // It opens in the viewer.
  await photo.getByRole("button", { name: "Open image trail.png" }).click();
  await expect(bob.getByRole("dialog", { name: "trail.png" })).toBeVisible();
  await bob.keyboard.press("Escape");

  // A file with no text is a download link, and the chat list names it.
  const fileName = `${unique("notes").replace(" ", "-")}.txt`;
  await bob.getByLabel("Choose file").setInputFiles({ name: fileName, mimeType: "text/plain", buffer: Buffer.from("meeting notes\n") });
  await bob.getByLabel("Send").click();
  const link = history(alice).locator("a", { hasText: fileName });
  await expect(link).toBeVisible();
  expect(await link.getAttribute("href")).toContain("/api/attachments/");
  await expect(chatRow(alice, "Bob Martinez")).toContainText(fileName);

  // Files over 5 MB are refused before upload.
  await alice.getByLabel("Choose file").setInputFiles({
    name: "huge.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(6 * 1024 * 1024),
  });
  await expect(alice.getByText("Files can be up to 5.0 MB")).toBeVisible();
});
