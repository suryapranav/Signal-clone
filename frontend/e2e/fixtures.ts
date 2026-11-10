import { test as base, expect } from "@playwright/test";
import { pageErrors } from "./helpers";

/** Every test also fails if any page logged an error or threw. */
export const test = base.extend<{ noPageErrors: void }>({
  noPageErrors: [
    async ({}, use) => {
      pageErrors.length = 0;
      await use();
      expect(pageErrors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
