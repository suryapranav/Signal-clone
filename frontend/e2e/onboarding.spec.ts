import { test, expect } from "./fixtures";

test("a new number signs up, sets a profile and lands on the chat list", async ({ page }) => {
  const phone = `9${String(Date.now()).slice(-9)}`; // a fresh +91 number every run

  await page.goto("/");
  await page.getByRole("combobox").selectOption("+91");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Verification code" })).toBeVisible();
  await page.getByLabel("Digit 1").fill("000000");
  await expect(page.getByText("Incorrect code. Try again.")).toBeVisible();
  await page.getByLabel("Digit 1").fill("123456");

  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill("User");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();

  // The session survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
});
