import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Opt-in only: this suite consumes real Google Translation quota.
test.skip(process.env.PAPERLINGO_LIVE !== "1", "Run npm run test:live to contact Google and external PDF sites.");

test("LIVE Google: real PDF selection → Next API → NMT → Korean sidebar", async ({ page }) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  doc.addPage([612, 792]).drawText("The proposed model reduces computational complexity.", { x: 50, y: 700, size: 13, font });
  await page.goto("/");
  await page.getByLabel("PDF 파일 선택").setInputFiles({ name: "live-check.pdf", mimeType: "application/pdf", buffer: Buffer.from(await doc.save()) });
  const line = page.locator(".textLayer span").filter({ hasText: "The proposed model" });
  await expect(line).toBeVisible();
  const rect = (await line.boundingBox())!;
  await page.mouse.move(rect.x + 1, rect.y + rect.height / 2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 1, rect.y + rect.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(page.getByLabel("선택 문장 번역")).toBeVisible();
  const responsePromise = page.waitForResponse("**/api/translate");
  await page.getByLabel("선택 문장 번역").click();
  const response = await responsePromise;
  const result = await response.json();
  console.log("LIVE Google result:", response.status(), JSON.stringify(result));
  expect(response.status(), JSON.stringify(result)).toBe(200);
  await expect(page.locator(".translated")).toContainText(/[가-힣]/);
  await page.screenshot({ path: "test-results/live-google.png", fullPage: true });
});

for (const url of ["https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", "https://arxiv.org/abs/1706.03762"]) {
  test(`LIVE external PDF or explicit CORS guidance: ${url}`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Open PDF URL").fill(url);
    await page.getByRole("button", { name: "열기", exact: true }).click();
    await expect(page.locator(".textLayer, .error-banner").first()).toBeVisible({ timeout: 45_000 });
    if (await page.locator(".error-banner").count()) {
      const error = await page.locator(".error-banner").innerText();
      console.log("LIVE external PDF blocked:", url, error);
      expect(error).toMatch(/CORS|접근|네트워크|30초|PDF 형식/);
      test.info().annotations.push({ type: "external-site-limitation", description: error });
    } else {
      console.log("LIVE external PDF rendered:", url);
      await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible();
    }
  });
}
