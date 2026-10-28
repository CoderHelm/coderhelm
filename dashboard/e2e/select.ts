import { expect, type Locator } from "@playwright/test";

// Driving the dashboard's own <Select> (components/select.tsx), which replaced
// the browser's select box: open it, then click the choice.

/**
 * Opens a <Select> and returns its list. The open trigger is found by CSS
 * (`aria-expanded`), not by role or name: on a phone the open sheet hides the
 * page from the accessibility tree, a role locator for the trigger then
 * finds nothing, and only one select is open at a time.
 */
async function openList(control: Locator): Promise<Locator> {
  const page = control.page();
  await control.click();
  const open = page.locator('[role="combobox"][aria-haspopup="listbox"][aria-expanded="true"]');
  await expect(open).toHaveCount(1);
  const listId = await open.getAttribute("aria-controls");
  const list = page.locator(`[id="${listId}"]`);
  await expect(list).toBeVisible();
  return list;
}

/**
 * Picks a choice in a <Select>, by its value or its label (like Playwright's
 * `selectOption` on a native select). `control` is the trigger, e.g.
 * `page.getByRole("combobox", { name: "Sort" })` or `page.getByLabel("Role")`.
 */
export async function pickOption(control: Locator, choice: string | RegExp): Promise<void> {
  const page = control.page();
  // Once open, the listbox carries the same name, so `getByLabel` would match both.
  // A CSS match, not getByRole: on a phone the open sheet hides the page
  // (aria-hidden), and the trigger must still be found.
  control = control.and(page.locator('[role="combobox"]'));
  const list = await openList(control);
  if (typeof choice === "string") {
    const byValue = list.locator(`[role="option"][data-value="${choice.replace(/"/g, '\\"')}"]`);
    if (await byValue.count()) {
      await byValue.click();
      await expect(list).toBeHidden();
      return;
    }
  }
  await list.getByRole("option", { name: choice, exact: typeof choice === "string" }).first().click();
  await expect(list).toBeHidden();
}

/** The value a <Select> holds (its `data-value`), like `toHaveValue` on a native select. */
export async function expectSelectValue(control: Locator, value: string): Promise<void> {
  await expect(control).toHaveAttribute("data-value", value);
}

/** The labels a <Select> offers, in order (opens and closes it). */
export async function selectLabels(control: Locator): Promise<string[]> {
  const page = control.page();
  control = control.and(page.locator('[role="combobox"]'));
  const list = await openList(control);
  const labels = await list.locator('[role="option"] [data-option-label]').allTextContents();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  return labels.map((t) => t.trim());
}
