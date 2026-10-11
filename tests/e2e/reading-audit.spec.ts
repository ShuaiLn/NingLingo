import { expect, test, type Page } from "@playwright/test";

async function createReading(page: Page, title: string, body: string) {
  await page.goto("/es/reading");
  await page.getByRole("button", { name: "New reading", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("textbox", { name: "Text", exact: true }).fill(body);
  await page.getByRole("button", { name: "Save reading", exact: true }).click();
  await expect(page.locator(".reading-body")).toHaveText(body);
}

test("arbitrary cross-token selections preserve offsets and take manual lookup priority", async ({ page }) => {
  await createReading(page, "Selection audit", "El café está aquí.");
  await page.evaluate(() => {
    const tokens = [...document.querySelectorAll(".reading-token")];
    const first = tokens.find(token => token.textContent === "café")!.firstChild!;
    const last = tokens.find(token => token.textContent === "está")!.firstChild!;
    const range = document.createRange(); range.setStart(first, 0); range.setEnd(last, 4);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.querySelector(".reading-body")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.locator(".reading-lookup h2")).toHaveText("café está");
  await expect(page.getByText("Development translation placeholder", { exact: true })).toBeVisible();
  await page.getByLabel("English meaning", { exact: true }).fill("coffee is");
  await page.getByRole("button", { name: "Save annotation", exact: true }).click();
  await expect(page.getByText("Manual annotation", { exact: true })).toBeVisible();
  const annotation = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("ninglingo:development:v1")!) as { annotations: { start: number; end: number; text: string; translation: string }[] };
    return data.annotations.find(row => row.text === "café está");
  });
  expect(annotation).toMatchObject({ start: 3, end: 12, text: "café está", translation: "coffee is" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByRole("button", { name: "Look up café", exact: true }).click();
  await expect(page.getByLabel("English meaning", { exact: true })).toHaveValue("coffee is");
});

test("a body change in another tab invalidates an open lookup before annotation save", async ({ page, context }) => {
  await createReading(page, "Version conflict audit", "El café está aquí.");
  await page.getByRole("button", { name: "Look up café", exact: true }).click();
  await expect(page.getByText("Development translation placeholder", { exact: true })).toBeVisible();
  await page.getByLabel("English meaning", { exact: true }).fill("coffee");
  const secondTab = await context.newPage();
  await secondTab.goto("/es/reading");
  await secondTab.locator(".reading-library-item").filter({ hasText: "Version conflict audit" }).click();
  await secondTab.getByRole("button", { name: "Edit text", exact: true }).click();
  await secondTab.getByRole("textbox", { name: "Text", exact: true }).fill("El café está aquí. Nuevo texto.");
  await secondTab.getByRole("button", { name: "Save reading", exact: true }).click();
  await expect(page.locator(".reading-body")).toContainText("Nuevo texto.");
  await expect(page.getByText("This reading changed in another tab. Select the text again before saving an annotation.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save annotation", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Look up café", exact: true }).click();
  await page.getByLabel("English meaning", { exact: true }).fill("coffee");
  await page.getByRole("button", { name: "Save annotation", exact: true }).click();
  await expect(page.getByText("Manual annotation", { exact: true })).toBeVisible();
  await secondTab.close();
});

test("short hover cancels lookup and a delayed mock result preserves manual input", async ({ page }) => {
  await createReading(page, "Hover audit", "zzunknown yyunknown.");
  const first = page.getByRole("button", { name: "Look up zzunknown", exact: true });
  await first.hover();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(450);
  await expect(page.locator(".reading-lookup")).toHaveCount(0);
  await first.focus();
  await page.getByLabel("English meaning", { exact: true }).fill("manual draft");
  await expect(page.getByText("Development translation placeholder", { exact: true })).toBeVisible();
  await expect(page.getByLabel("English meaning", { exact: true })).toHaveValue("manual draft");
  await page.getByRole("button", { name: "Look up yyunknown", exact: true }).focus();
  await expect(page.locator(".reading-lookup h2")).toHaveText("yyunknown");
  await expect(page.getByText("Development translation placeholder", { exact: true })).toBeVisible();
  await expect(page.getByLabel("English meaning", { exact: true })).toHaveValue("");
});

