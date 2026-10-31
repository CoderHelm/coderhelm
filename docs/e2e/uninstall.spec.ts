// The uninstall page (/self-host/uninstall/) end to end: the install comes
// from the address bar, the keep-data choice shows what goes and what stays,
// "Delete everything" first sends the person to set KeepDataOnDelete, every
// link and command names the install's stack, and the last step is the
// read-only leftover check. Phones too. E2E_SHOTS=<dir> saves screenshots.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await page.context().route(/console\.aws\.amazon\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<p>AWS</p>' }));
});

test('keep my data: delete the stack, then the check', async ({ page }) => {
  await page.goto('/self-host/uninstall/?stage=prod&region=eu-west-1');
  await expect(page.getByTestId('step-title')).toHaveText('Uninstall CoderHelm');
  await expect(page.locator('#stage')).toHaveValue('prod');
  await shot(page, 'uninstall-1-choose');
  await page.getByTestId('next-choose').click();
  await expect(page.getByTestId('next-data')).toBeDisabled();
  await page.getByTestId('mode-keep').click();
  await expect(page.getByTestId('stays')).toContainText('the tables');
  await expect(page.getByTestId('set-keep-false')).toHaveCount(0);
  await page.getByTestId('next-data').click();
  await expect(page.getByTestId('open-stack')).toHaveAttribute('href', 'https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/stackinfo?stackId=coderhelm-prod');
  await shot(page, 'uninstall-2-delete');
  await page.getByTestId('next-delete').click();
  await expect(page.getByTestId('leftovers-command')).toContainText('leftovers --stage prod --region eu-west-1');
  await expect(page.getByTestId('step-check')).toContainText('Your data is listed');
  await shot(page, 'uninstall-3-check');
  // The choice never goes in the address bar.
  expect(page.url()).not.toMatch(/mode|keep|everything/);
});

test('delete everything: set KeepDataOnDelete to false first', async ({ page }) => {
  await page.goto('/self-host/uninstall/?stage=prod&region=us-east-1');
  await page.getByTestId('next-choose').click();
  await page.getByTestId('mode-everything').click();
  await expect(page.getByTestId('set-keep-false')).toContainText('KeepDataOnDelete');
  await expect(page.getByTestId('stays')).toHaveText('Nothing.');
  await expect(page.getByTestId('goes')).toContainText('7-day wait');
  await page.getByText('Or from a terminal').click();
  await expect(page.getByTestId('keep-false-command')).toContainText('ParameterKey=KeepDataOnDelete,ParameterValue=false');
  await shot(page, 'uninstall-everything');
  await page.getByTestId('next-data').click();
  await expect(page.getByTestId('step-delete')).toContainText('deletes its tables itself');
});

test('the install name and region are required', async ({ page }) => {
  await page.goto('/self-host/uninstall/');
  await page.getByTestId('next-choose').click();
  await expect(page.getByText(/Enter the install name/)).toBeVisible();
  await expect(page.getByTestId('step-choose')).toBeVisible();
});

test('phones: no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/self-host/uninstall/?stage=prod&region=us-east-1');
  await page.getByTestId('next-choose').click();
  await page.getByTestId('mode-everything').click();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide).toBe(false);
  await shot(page, 'uninstall-phone');
});
