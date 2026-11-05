import { decode } from "he";
import { characterCount, MAX_TEXT_LENGTH } from "@/lib/text";

export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_BODY_BYTES = 16_384;

function failure(message: string, code: string, status: number) {
  return Response.json({ error: message, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return failure("허용되지 않은 요청 출처입니다.", "FORBIDDEN", 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failure("JSON 요청만 허용됩니다.", "INVALID_INPUT", 415);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return failure("요청이 너무 큽니다.", "TOO_LARGE", 413);
  let body: unknown;
  if (!request.body) return failure("텍스트를 입력해 주세요.", "INVALID_INPUT", 400);
  const reader = request.body.getReader();
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return failure("요청이 너무 큽니다.", "TOO_LARGE", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return failure("올바른 JSON 요청이 아닙니다.", "INVALID_INPUT", 400); }
  finally { reader.releaseLock(); }
  if (!body || typeof body !== "object" || !("text" in body) || typeof body.text !== "string" || !body.text.trim()) {
    return failure("번역할 텍스트를 입력해 주세요.", "INVALID_INPUT", 400);
  }
  if (characterCount(body.text) > MAX_TEXT_LENGTH) return failure("한 번에 최대 2,000자까지 번역할 수 있습니다.", "TOO_LONG", 400);
  const text = body.text.trim();
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return failure("Google 번역 API 키 설정이 필요합니다. 서버의 GOOGLE_TRANSLATE_API_KEY를 확인해 주세요.", "NOT_CONFIGURED", 503);
  try {
    const response = await fetch("https://translation.googleapis.com/language/translate/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({ q: text, source: "en", target: "ko", format: "text", model: "nmt" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    if (!response.ok) {
      const reasons = JSON.stringify(data.error ?? {}).toLowerCase();
      if (reasons.includes("api_key_service_blocked")) {
        return failure("API 키에서 Cloud Translation API 사용이 차단되어 있습니다. Google Cloud Console → Credentials → 해당 키 → API restrictions에서 Cloud Translation API를 허용해 주세요.", "GOOGLE_CONFIGURATION", 502);
      }
      if (response.status === 429 || /quota|limitexceeded|limit exceeded|rate.?limit|resource_exhausted/.test(reasons)) {
        return failure("Google 번역 사용량 또는 요청 속도 한도를 초과했습니다. Cloud Console의 할당량을 확인하고 나중에 다시 시도해 주세요.", "QUOTA_EXCEEDED", 429);
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) return failure("Google API 키, API 제한, 결제 연결 및 Cloud Translation API 활성화 상태를 확인해 주세요.", "GOOGLE_CONFIGURATION", 502);
      return failure("Google 번역 서비스 오류입니다. 잠시 후 다시 시도해 주세요.", "GOOGLE_ERROR", 502);
    }
    const translated = data.data?.translations?.[0]?.translatedText;
    if (typeof translated !== "string" || !translated.trim()) return failure("Google 번역 응답 형식이 올바르지 않습니다.", "INVALID_RESPONSE", 502);
    return Response.json({ original: text, translated: decode(translated) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return failure("Google 번역 요청 시간이 초과되었습니다. 다시 시도해 주세요.", "TIMEOUT", 504);
    return failure("Google 번역 서버 연결에 실패했습니다. 네트워크 상태를 확인해 주세요.", "NETWORK_ERROR", 502);
  }
}
