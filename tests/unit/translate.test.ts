import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/translate/route";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/translate", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
describe("POST /api/translate (Google calls are mocked)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-server-key"); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
  it.each([{}, { text: "  " }, { text: 5 }, null, [], { text: "a".repeat(2001) }])("rejects invalid text: %j", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not fabricate success without a key", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    const result = await POST(request({ text: "Hello" }));
    expect(result.status).toBe(503);
    expect((await result.json()).code).toBe("NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends only text with explicit NMT settings and decodes entities", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { translations: [{ translatedText: "모델 &amp; &#39;연구&#39; &lt;script&gt;" }] } }));
    const result = await POST(request({ text: "The model & research." }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ original: "The model & research.", translated: "모델 & '연구' <script>" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://translation.googleapis.com/language/translate/v2");
    expect(options.headers["X-Goog-Api-Key"]).toBe("test-server-key");
    expect(JSON.parse(options.body)).toEqual({ q: "The model & research.", source: "en", target: "ko", format: "text", model: "nmt" });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it.each([429, 403])("maps Google quota failure (%i) to 429", async status => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: "Daily Limit Exceeded", errors: [{ reason: "dailyLimitExceeded" }] } }, { status }));
    const result = await POST(request({ text: "Test" }));
    expect(result.status).toBe(429); expect((await result.json()).code).toBe("QUOTA_EXCEEDED");
  });
  it("distinguishes configuration failures", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: "API key not valid" } }, { status: 400 }));
    const result = await POST(request({ text: "Test" }));
    expect(result.status).toBe(502); expect((await result.json()).code).toBe("GOOGLE_CONFIGURATION");
  });
  it("explains API key service restrictions", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] } }, { status: 403 }));
    const result = await POST(request({ text: "Test" }));
    expect(result.status).toBe(502); expect((await result.json()).error).toContain("API restrictions");
  });
  it.each([500, 503])("maps upstream service failure %i", async status => {
    fetchMock.mockResolvedValue(Response.json({ error: {} }, { status }));
    expect((await POST(request({ text: "Test" }))).status).toBe(502);
  });
  it("distinguishes network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network failed"));
    expect((await (await POST(request({ text: "Test" }))).json()).code).toBe("NETWORK_ERROR");
  });
  it("distinguishes timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("Timeout", "TimeoutError"));
    expect((await POST(request({ text: "Test" }))).status).toBe(504);
  });
  it("rejects malformed upstream success", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: {} }));
    expect((await (await POST(request({ text: "Test" }))).json()).code).toBe("INVALID_RESPONSE");
  });
  it("rejects foreign origins", async () => {
    expect((await POST(request({ text: "Test" }, { origin: "https://other.example" }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects oversized bodies without trusting content-length", async () => {
    expect((await POST(request({ text: "a".repeat(17000) }))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON", async () => {
    expect((await POST(new Request("http://localhost:3000/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
  });
});
