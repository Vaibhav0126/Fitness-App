import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const OUTBOX = path.resolve(".e2e/outbox/outbox.jsonl");

/** Polls the dev outbox for the newest email to `to` and returns the first link in it. */
async function verificationLink(to: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const lines = readFileSync(OUTBOX, "utf8").trim().split("\n").reverse();
      for (const l of lines) {
        const m = JSON.parse(l) as { to: string; text: string };
        const url = m.to === to ? m.text.match(/https?:\/\/\S+/)?.[0] : undefined;
        if (url) return url;
      }
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no email to ${to}`);
}

test("sign up → verify → onboard → import Hevy CSV → see the next workout", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;

  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Lifter");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: /sign up|create account/i }).click();
  await expect(page).toHaveURL(/\/verify/);

  await page.goto(await verificationLink(email));
  await page.goto("/app");
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Tokyo");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/app\/import/);

  await page.getByLabel("Strength CSV").setInputFiles(path.resolve("test/fixtures/hevy.csv"));
  await expect(page.getByText("(detected: Hevy)")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Squat (Barbell)");
  await page.getByRole("button", { name: /Import \d+ sets/ }).click();
  await expect(page.getByText("Import complete.")).toBeVisible();
  await expect(page.getByText(/Sets: \d+ new, 0 updated/)).toBeVisible();

  await page.goto("/app/next");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("ol li").first()).toBeVisible();

  await page.goto("/app/strength");
  await expect(page.getByText("Squat (Barbell)").first()).toBeVisible();

  // Health Auto Export: parsed in a Web Worker, then uploaded in chunks.
  await page.goto("/app/import?tab=hae");
  await page
    .getByLabel("Health Auto Export JSON (v2)")
    .setInputFiles([
      path.resolve("test/fixtures/hae-metrics.json"),
      path.resolve("test/fixtures/hae-workouts.json"),
    ]);
  await expect(page.getByText(/workouts \(1 runs, \d+ intervals\)/)).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete.")).toBeVisible();
  await page.goto("/app/runs");
  await expect(page.getByText("Recent runs")).toBeVisible();
});

test("the demo is read-only", async ({ page }) => {
  await page.goto("/demo");
  if (page.url().includes("demo=unavailable")) test.skip(true, "demo not seeded in this database");
  await expect(page.getByText("Demo account")).toBeVisible();
  const res = await page.request.post("/api/import/batch", {
    data: { kind: "metrics", source: "manual", rows: [] },
  });
  expect(res.status()).toBe(403);
});
