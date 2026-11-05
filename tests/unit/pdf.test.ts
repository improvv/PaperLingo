import { describe, expect, it, afterEach, vi } from "vitest";
import { MAX_PDF_BYTES, pdfUrl, readPdfUrl, validatePdf } from "../../src/lib/pdf";
import { characterCount, normalizeText } from "../../src/lib/text";

afterEach(() => vi.unstubAllGlobals());
describe("PDF handling", () => {
  it.each(["http://example.com/test.pdf", "file:///test.pdf", "javascript:alert(1)", "https://user:password@example.com/x.pdf", "invalid"])("rejects unsafe URL %s", input => expect(() => pdfUrl(input)).toThrow());
  it("converts modern and legacy arXiv abstract URLs", () => {
    expect(pdfUrl("https://arxiv.org/abs/1706.03762")).toBe("https://arxiv.org/pdf/1706.03762");
    expect(pdfUrl("https://arxiv.org/abs/hep-th/9901001v2")).toBe("https://arxiv.org/pdf/hep-th/9901001v2");
    expect(pdfUrl("https://arxiv.org/pdf/1706.03762.pdf")).toBe("https://arxiv.org/pdf/1706.03762.pdf");
  });
  it("rejects non-PDF, empty and oversized bytes", () => {
    expect(() => validatePdf(new TextEncoder().encode("<html>Login</html>"))).toThrow("PDF 형식");
    expect(() => validatePdf(new Uint8Array())).toThrow("빈 PDF");
    expect(() => validatePdf(new Uint8Array(MAX_PDF_BYTES + 1))).toThrow("20MB");
  });
  it("reads PDF bytes in the browser without an API proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("%PDF-1.7\nfixture")); vi.stubGlobal("fetch", fetchMock);
    const result = await readPdfUrl("https://arxiv.org/abs/1706.03762", new AbortController().signal);
    expect(result.title).toBe("1706.03762"); expect(result.bytes.length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls[0][0]).toBe("https://arxiv.org/pdf/1706.03762");
  });
  it("explains CORS and access failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(readPdfUrl("https://example.com/a.pdf", new AbortController().signal)).rejects.toThrow("CORS");
  });
  it("enforces streaming size limit even without a content-length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(MAX_PDF_BYTES + 1))));
    await expect(readPdfUrl("https://example.com/a.pdf", new AbortController().signal)).rejects.toThrow("20MB");
  });
});
describe("selection cleanup", () => {
  it("joins line-broken words and preserves inline terminology, math and brackets", () => {
    expect(normalizeText("The compu-\ntational model (BERT-based)\nuses x = y + 2; [1].")).toBe("The computational model (BERT-based) uses x = y + 2; [1].");
    expect(normalizeText("  \n \t ")).toBe("");
  });
  it("counts Unicode code points", () => expect(characterCount("a😀한")).toBe(3));
});
