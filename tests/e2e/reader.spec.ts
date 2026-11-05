import { test, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

let pdf: Buffer;
test.beforeAll(async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.TimesRoman);
  for (let i = 1; i <= 3; i++) {
    const page = document.addPage([612, 792]);
    page.drawText(`PaperLingo Research - Page ${i}`, { x: 46, y: 740, size: 18, font });
    const lines = ["The proposed model reduces computational", "complexity while preserving accuracy.", "A BERT-based method uses x = y + 2 [1]."];
    for (const x of [46, 318]) {
      lines.forEach((line, index) => page.drawText(line, { x, y: 690 - index * 19, size: 11, font, color: rgb(.1, .1, .1) }));
      for (let row = 0; row < 24; row++) page.drawText(`Research findings support our hypothesis ${row + 1}.`, { x, y: 605 - row * 18, size: 10, font });
    }
  }
  pdf = Buffer.from(await document.save());
});

async function upload(page: Page) {
  await page.goto("/");
  await page.getByLabel("PDF 파일 선택").setInputFiles({ name: "two-column-paper.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.locator("#pdf-page-1 .textLayer span").first()).toBeVisible();
}
async function selectLines(page: Page, number = 1) {
  const section = page.locator(`#pdf-page-${number}`);
  await section.evaluate(element => element.scrollIntoView({ block: "start" }));
  const start = section.locator(".textLayer span").filter({ hasText: /^The proposed model/ }).first();
  const end = section.locator(".textLayer span").filter({ hasText: /^complexity while/ }).first();
  await expect(start).toBeVisible(); await expect(end).toBeVisible();
  const a = (await start.boundingBox())!; const b = (await end.boundingBox())!;
  await page.mouse.move(a.x + 1, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2, { steps: 18 });
  await page.mouse.up();
  await expect(page.getByLabel("선택 문장 번역")).toBeVisible();
  return page.evaluate(() => window.getSelection()?.toString() || "");
}

test("real PDF drag → explicit request → sidebar, preservation, cache, zoom, scroll and deletion (translation mocked)", async ({ page }) => {
  let requests = 0; let sent = "";
  await page.route("**/api/translate", async route => {
    requests++; sent = route.request().postDataJSON().text;
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.fulfill({ json: { original: sent, translated: "제안된 모델은 정확도를 유지하면서 계산 복잡도를 줄입니다." } });
  });
  await upload(page);
  await page.screenshot({ path: "test-results/reader-desktop.png", fullPage: true });
  const raw = await selectLines(page);
  expect(raw).toContain("The proposed model"); expect(raw).toContain("complexity while"); expect(requests).toBe(0);
  await page.getByLabel("선택 문장 번역").click();
  await expect(page.getByLabel("선택 문장 번역")).toBeDisabled();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(raw);
  await expect(page.locator(".translation-card")).toHaveCount(1);
  expect(sent).toBe(raw.replace(/\s+/g, " ").trim());
  await expect(page.locator(".translated")).toContainText("계산 복잡도");
  await page.getByLabel("선택 문장 번역").click();
  await expect(page.locator(".translation-card")).toHaveCount(2);
  expect(requests).toBe(1); await expect(page.locator(".cache-label")).toHaveCount(1);
  await page.getByLabel("확대", { exact: true }).click();
  await expect(page.locator(".zoom-control")).toContainText("120%");
  await selectLines(page);
  const button = (await page.getByLabel("선택 문장 번역").boundingBox())!;
  expect(button.x).toBeGreaterThanOrEqual(0); expect(button.y).toBeGreaterThan(0);
  await page.getByLabel("선택 문장 번역").click();
  expect(requests).toBe(1);
  await selectLines(page, 2);
  await page.getByLabel("선택 문장 번역").click();
  await expect(page.locator(".translation-card").first().getByRole("button", { name: "p. 2" })).toBeVisible();
  await page.locator(".translation-card").last().getByRole("button", { name: "p. 1" }).click();
  await expect(page.getByLabel("이동할 페이지")).toHaveValue("1");
  await page.screenshot({ path: "test-results/reader-translations.png", fullPage: true });
  await page.getByLabel("번역 삭제", { exact: true }).first().click();
  await expect(page.locator(".translation-card")).toHaveCount(3);
  await page.getByLabel("번역 기록 전체 삭제").click(); await expect(page.locator(".translation-card")).toHaveCount(0);
});

test("URL/arXiv conversion, bad URL and file errors (PDF network mocked)", async ({ page }) => {
  let requested = "";
  await page.route("https://arxiv.org/pdf/1706.03762", async route => { requested = route.request().url(); await route.fulfill({ contentType: "application/pdf", body: pdf, headers: { "Access-Control-Allow-Origin": "*" } }); });
  await page.goto("/");
  await page.getByLabel("Open PDF URL").fill("http://example.com/test.pdf");
  await page.getByRole("button", { name: "열기", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("HTTPS");
  await page.getByLabel("PDF 파일 선택").setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>Not a PDF</html>") });
  await expect(page.locator(".error-banner")).toContainText("PDF 형식");
  await page.getByLabel("Open PDF URL").fill("https://arxiv.org/abs/1706.03762");
  await page.getByRole("button", { name: "열기", exact: true }).click();
  await expect(page.locator("#pdf-page-1 .textLayer span").first()).toBeVisible();
  expect(requested).toBe("https://arxiv.org/pdf/1706.03762");
});

test("API quota error is visible, no fabricated result; outside-PDF selection ignored", async ({ page }) => {
  await page.route("**/api/translate", route => route.fulfill({ status: 429, json: { error: "Google 번역 사용량 한도를 초과했습니다.", code: "QUOTA_EXCEEDED" } }));
  await upload(page); await selectLines(page); await page.getByLabel("선택 문장 번역").click();
  await expect(page.locator(".error-banner")).toContainText("사용량 한도"); await expect(page.locator(".translation-card")).toHaveCount(0);
  await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.querySelector(".sidebar-header h2")!);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await expect(page.getByLabel("선택 문장 번역")).toHaveCount(0);
});

test("mobile tabs, selected text, safe text rendering and new PDF history reset (translation mocked)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/translate", route => route.fulfill({ json: { original: "English", translated: "한국어 <script>alert('x')</script>" } }));
  await upload(page); await selectLines(page); await page.getByLabel("선택 문장 번역").click();
  await expect(page.locator(".translation-card")).toBeVisible();
  await expect(page.locator(".translated")).toContainText("<script>"); await expect(page.locator(".translated script")).toHaveCount(0);
  await page.screenshot({ path: "test-results/reader-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "p. 1" }).click();
  await expect(page.locator(".pdf-panel")).toBeVisible();
  await page.getByRole("button", { name: "새 PDF 열기" }).click();
  await page.getByLabel("PDF 파일 선택").setInputFiles({ name: "new.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.locator(".document-title")).toContainText("new.pdf");
  await page.getByRole("button", { name: "Translation", exact: true }).click();
  await expect(page.locator(".translation-card")).toHaveCount(0);
});

test("oversized selection never calls API, escape dismisses and PDF drag-drop opens", async ({ page }) => {
  let requests = 0;
  page.on("request", request => { if (request.url().endsWith("/api/translate")) requests++; });
  await page.goto("/");
  const transfer = await page.evaluateHandle(bytes => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "dropped.pdf", { type: "application/pdf" }));
    return transfer;
  }, [...pdf]);
  await page.locator(".app-shell").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator("#pdf-page-1 .textLayer span").first()).toBeVisible();
  await expect(page.locator(".document-title")).toContainText("dropped.pdf");
  await page.evaluate(() => {
    const spans = document.querySelectorAll("#pdf-page-1 .textLayer span");
    const first = spans[0].firstChild!; const last = spans[spans.length - 1].firstChild!;
    const range = document.createRange(); range.setStart(first, 0); range.setEnd(last, last.textContent!.length);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await expect(page.getByLabel("선택 문장 번역")).toHaveText(/2,000자 초과/);
  await page.getByLabel("선택 문장 번역").click();
  await expect(page.locator(".error-banner")).toContainText("2,000자"); expect(requests).toBe(0);
  await page.keyboard.press("Escape"); await expect(page.getByLabel("선택 문장 번역")).toHaveCount(0);
});
