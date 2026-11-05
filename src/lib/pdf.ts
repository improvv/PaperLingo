export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function pdfUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("올바른 PDF URL을 입력해 주세요."); }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("인증 정보가 없는 HTTPS URL만 사용할 수 있습니다.");
  }
  if (url.hostname === "arxiv.org" || url.hostname === "www.arxiv.org") {
    url.hostname = "arxiv.org";
    url.pathname = url.pathname.replace(/^\/abs\//, "/pdf/");
  }
  url.hash = "";
  return url.href;
}

export function validatePdf(bytes: Uint8Array): void {
  if (!bytes.length) throw new Error("빈 PDF 파일입니다.");
  if (bytes.length > MAX_PDF_BYTES) throw new Error("PDF는 20MB 이하만 열 수 있습니다.");
  const signature = new TextDecoder("ascii").decode(bytes.subarray(0, 1024));
  if (!signature.includes("%PDF-")) throw new Error("PDF 형식이 아닙니다. PDF 파일을 선택해 주세요.");
}

export async function readPdfUrl(input: string, signal: AbortSignal): Promise<{ bytes: Uint8Array; title: string }> {
  const url = pdfUrl(input);
  let response: Response;
  try {
    response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("PDF를 가져오지 못했습니다. 외부 사이트의 CORS 정책, 접근 제한 또는 네트워크 문제일 수 있습니다. PDF를 내려받아 Upload PDF로 열어 주세요.");
  }
  if (!response.ok) throw new Error(`PDF 서버 응답 오류 (${response.status}). 접근 권한을 확인하거나 파일을 내려받아 업로드해 주세요.`);
  if (response.url && new URL(response.url).protocol !== "https:") throw new Error("HTTPS PDF만 열 수 있습니다.");
  if (Number(response.headers.get("content-length")) > MAX_PDF_BYTES) throw new Error("PDF는 20MB 이하만 열 수 있습니다.");
  if (!response.body) throw new Error("PDF 응답을 읽을 수 없습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PDF_BYTES) throw new Error("PDF는 20MB 이하만 열 수 있습니다.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  validatePdf(bytes);
  const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "Research paper";
  let title = last;
  try { title = decodeURIComponent(last); } catch { /* Keep malformed URL segment readable. */ }
  return { bytes, title };
}
