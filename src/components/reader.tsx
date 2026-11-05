"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Upload, Link as LinkIcon, ArrowUpRight, X, Minus, Plus, Languages, Copy, Check, Trash2, FileText, LoaderCircle, ChevronRight } from "lucide-react";
import { characterCount, MAX_TEXT_LENGTH, normalizeText } from "@/lib/text";
import { MAX_PDF_BYTES, readPdfUrl, validatePdf } from "@/lib/pdf";

const PdfViewer = dynamic(() => import("./pdf-viewer"), { ssr: false, loading: () => <div className="viewer-message">PDF 뷰어 준비 중…</div> });
type Paper = { id: number; title: string; file: { data: Uint8Array } };
type SelectionInfo = { text: string; page: number; range: Range; x: number; y: number };
type Translation = { id: string; original: string; translated: string; page: number; cached: boolean };

export default function Reader() {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [url, setUrl] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Translation[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"pdf" | "translation">("pdf");
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(800);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const floatingButton = useRef<HTMLButtonElement>(null);
  const cache = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const translationAbort = useRef<AbortController | null>(null);
  const loadAbort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const loadGeneration = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { translationAbort.current?.abort(); loadAbort.current?.abort(); }, []);

  const installPaper = (bytes: Uint8Array, title: string) => {
    translationAbort.current?.abort();
    generation.current += 1;
    inFlight.current = false;
    setBusy(false);
    setPaper({ id: generation.current, title, file: { data: bytes } });
    setHistory([]); setSelection(null); setError(""); setPages(0); setPage(1); setZoom(1); setTab("pdf"); setOpenDialog(false);
    window.getSelection()?.removeAllRanges();
    viewer.current?.scrollTo({ top: 0, left: 0 });
  };

  const openFile = async (file?: File) => {
    if (!file) return;
    loadAbort.current?.abort();
    const operation = ++loadGeneration.current;
    setOpening(true); setError("");
    try {
      if (file.size > MAX_PDF_BYTES) throw new Error("PDF는 20MB 이하만 열 수 있습니다.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      validatePdf(bytes);
      if (operation === loadGeneration.current) installPaper(bytes, file.name);
    } catch (cause) { if (operation === loadGeneration.current) setError(cause instanceof Error ? cause.message : "PDF를 읽을 수 없습니다."); }
    finally { if (operation === loadGeneration.current) setOpening(false); }
  };

  const openUrl = async (event: React.FormEvent) => {
    event.preventDefault();
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    const operation = ++loadGeneration.current;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setOpening(true); setError("");
    try {
      const result = await readPdfUrl(url, controller.signal);
      if (operation === loadGeneration.current) installPaper(result.bytes, result.title);
    } catch (cause) {
      if (operation === loadGeneration.current) setError(controller.signal.aborted ? "PDF 요청이 취소되었거나 30초를 초과했습니다. 파일 업로드를 이용해 주세요." : cause instanceof Error ? cause.message : "PDF URL을 열 수 없습니다.");
    } finally { clearTimeout(timeout); if (operation === loadGeneration.current) setOpening(false); }
  };

  useEffect(() => {
    const element = viewer.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [paper, tab]);

  useEffect(() => {
    if (!openDialog) return;
    returnFocus.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDialog(false);
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => { document.removeEventListener("keydown", trapFocus); returnFocus.current?.focus(); };
  }, [openDialog]);

  useEffect(() => {
    if (!paper) return;
    let frame = 0;
    const update = () => {
      const selected = window.getSelection();
      const host = viewer.current;
      if (!selected || selected.isCollapsed || !selected.rangeCount || !host) { setSelection(null); return; }
      const range = selected.getRangeAt(0);
      const start = range.startContainer.parentElement?.closest(".textLayer");
      const end = range.endContainer.parentElement?.closest(".textLayer");
      if (!start || !end || !host.contains(start) || !host.contains(end)) { setSelection(null); return; }
      const text = normalizeText(selected.toString());
      if (!text) { setSelection(null); return; }
      const bounds = host.getBoundingClientRect();
      const rect = [...range.getClientRects()].find(r => r.width > 0 && r.height > 0 && r.bottom > bounds.top && r.top < bounds.bottom && r.right > bounds.left && r.left < bounds.right);
      if (!rect) { setSelection(null); return; }
      const buttonWidth = 140;
      const x = Math.max(8, Math.min(rect.left + rect.width / 2 - buttonWidth / 2, window.innerWidth - buttonWidth - 8));
      const y = rect.top - 46 >= Math.max(8, bounds.top) ? rect.top - 46 : Math.min(rect.bottom + 8, window.innerHeight - 52);
      setSelection({ text, page: Number(start.closest("[data-page-number]")?.getAttribute("data-page-number")) || 1, range: range.cloneRange(), x, y });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const dismiss = (event: PointerEvent) => {
      if (!viewer.current?.contains(event.target as Node) && !floatingButton.current?.contains(event.target as Node)) {
        setSelection(null); window.getSelection()?.removeAllRanges();
      }
    };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelection(null); window.getSelection()?.removeAllRanges(); } };
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("pointerup", schedule);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", schedule); document.removeEventListener("pointerup", schedule);
      document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", keyboard);
      window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule);
    };
  }, [paper]);

  const translate = async () => {
    if (!selection || inFlight.current) return;
    const { text, page: selectedPage, range } = selection;
    if (characterCount(text) > MAX_TEXT_LENGTH) { setError("선택한 문장이 2,000자를 넘습니다. 더 짧게 선택해 주세요."); return; }
    const browserSelection = window.getSelection();
    browserSelection?.removeAllRanges(); browserSelection?.addRange(range);
    setError("");
    const operation = generation.current;
    const add = (translated: string, cached: boolean) => {
      setHistory(items => [{ id: crypto.randomUUID(), original: text, translated, page: selectedPage, cached }, ...items].slice(0, 200));
      setTab("translation");
    };
    const cached = cache.current.get(text);
    if (cached !== undefined) { add(cached, true); return; }
    inFlight.current = true; setBusy(true);
    const controller = new AbortController(); translationAbort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: controller.signal });
      const result = await response.json().catch(() => { throw new Error("서버 응답을 읽을 수 없습니다. Vercel 로그인과 네트워크 상태를 확인해 주세요."); });
      if (!response.ok) throw new Error(result.error || "번역 요청에 실패했습니다.");
      if (typeof result.translated !== "string") throw new Error("올바른 번역 응답이 아닙니다.");
      if (operation !== generation.current) return;
      cache.current.set(text, result.translated);
      if (cache.current.size > 500) cache.current.delete(cache.current.keys().next().value!);
      add(result.translated, false);
    } catch (cause) {
      if (operation === generation.current) setError(controller.signal.aborted ? "번역 요청 시간이 초과되었습니다. 다시 시도해 주세요." : cause instanceof Error ? cause.message : "번역 요청 중 네트워크 오류가 발생했습니다.");
    } finally {
      clearTimeout(timeout);
      if (operation === generation.current) { inFlight.current = false; setBusy(false); }
    }
  };

  const onPdfLoad = useCallback((count: number) => setPages(count), []);
  const onPdfError = useCallback(() => setError("PDF를 읽을 수 없습니다. 손상되었거나 암호화된 PDF는 지원하지 않습니다. 다른 파일을 선택해 주세요."), []);
  const jumpTo = (target: number) => {
    setTab("pdf");
    requestAnimationFrame(() => document.getElementById(`pdf-page-${target}`)?.scrollIntoView({ behavior: "instant", block: "start" }));
    setPage(target);
  };
  const copy = async (item: Translation) => {
    try { await navigator.clipboard.writeText(item.translated); setCopied(item.id); window.setTimeout(() => setCopied(null), 1800); }
    catch { setError("복사 권한이 없습니다. 번역문을 직접 선택해 복사해 주세요."); }
  };
  const sourceForm = (dialog = false) => <div className="source-options">
    <button className="upload-zone" onClick={() => fileInput.current?.click()} disabled={opening}>
      <span className="upload-icon"><Upload size={24} strokeWidth={1.6} /></span>
      <strong>Upload PDF <ArrowUpRight size={16} /></strong>
      <span>파일을 선택하거나 이곳에 놓으세요</span><small>PDF · 최대 20MB · 기기에만 보관</small>
    </button>
    <div className="source-divider"><span>또는 링크로 열기</span></div>
    <form onSubmit={openUrl} className="url-form">
      <label htmlFor={dialog ? "dialog-url" : "pdf-url"}><LinkIcon size={15} /> Open PDF URL</label>
      <div className="url-row"><input id={dialog ? "dialog-url" : "pdf-url"} type="url" placeholder="https://arxiv.org/abs/1706.03762" value={url} onChange={e => setUrl(e.target.value)} required disabled={opening} /><button type="submit" className="primary" disabled={opening || !url.trim()}>열기 <ChevronRight size={16} /></button></div>
      <p>HTTPS PDF 링크와 arXiv 논문 주소를 지원합니다.</p>
    </form>
  </div>;

  return <div className="app-shell" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); void openFile(event.dataTransfer.files[0]); }}>
    <input className="sr-only" ref={fileInput} type="file" accept="application/pdf,.pdf" aria-label="PDF 파일 선택" onChange={e => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
    <header className="app-header">
      <Link href="/" className="brand" aria-label="PaperLingo 홈"><span className="brand-mark"><BookOpen size={21} /></span>PaperLingo<span className="brand-dot">.</span></Link>
      {paper ? <div className="document-title" title={paper.title}><FileText size={15} /><span>{paper.title}</span></div> : <span className="header-caption">A little help. A deeper understanding.</span>}
      <button className="new-pdf" onClick={() => { setError(""); setOpenDialog(true); }}><Plus size={16} /><span>새 PDF 열기</span></button>
    </header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="오류 닫기" onClick={() => setError("")}><X size={17} /></button></div>}
    {opening && <div className="opening-status" role="status"><LoaderCircle className="spin" size={17} /> PDF를 읽는 중… <button onClick={() => { ++loadGeneration.current; loadAbort.current?.abort(); setOpening(false); }}>취소</button></div>}
    {!paper ? <main className="welcome">
      <div className="welcome-copy"><span className="eyebrow"><span /> YOUR PERSONAL READING SPACE</span><h1>논문 읽기에 집중하세요.<br /><span>언어의 장벽은 가볍게.</span></h1><p>영어 논문을 읽다가, 막히는 문장은 드래그.<br />필요한 만큼만 번역하고 생각의 흐름을 이어가세요.</p></div>
      <div className="welcome-card">{sourceForm()}</div>
      <div className="welcome-notes"><span><FileText size={15} /> 원본 그대로 읽기</span><span><Languages size={16} /> 선택한 문장만 번역</span><span><BookOpen size={15} /> 나만의 공부 공간</span></div>
      <p className="privacy-note">PDF는 서버에 저장되지 않습니다. 번역 버튼을 누른 문장만 Google 번역으로 전송됩니다.</p>
    </main> : <>
      <nav className="mobile-tabs" aria-label="읽기 화면"><button className={tab === "pdf" ? "active" : ""} onClick={() => setTab("pdf")}>논문</button><button className={tab === "translation" ? "active" : ""} onClick={() => setTab("translation")}>Translation {history.length > 0 && `(${history.length})`}</button></nav>
      <main className="reading-layout" data-mobile-tab={tab}>
        <section className="pdf-panel" aria-label="PDF 뷰어">
          <div className="viewer-toolbar"><div className="page-control"><input aria-label="이동할 페이지" type="number" min={1} max={pages || 1} value={page} onChange={e => setPage(Number(e.target.value))} onKeyDown={e => { if (e.key === "Enter") jumpTo(Math.min(pages, Math.max(1, page))); }} onBlur={() => jumpTo(Math.min(pages || 1, Math.max(1, page)))} /><span>/ {pages || "–"}</span></div><span className="selection-hint">문장을 선택하고 번역을 눌러 보세요</span><div className="zoom-control"><button aria-label="축소" disabled={zoom <= .6} onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges(); setZoom(z => Math.max(.6, +(z - .2).toFixed(1))); }}><Minus size={16} /></button><span>{Math.round(zoom * 100)}%</span><button aria-label="확대" disabled={zoom >= 2} onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges(); setZoom(z => Math.min(2, +(z + .2).toFixed(1))); }}><Plus size={16} /></button></div></div>
          <div ref={viewer} className="pdf-scroll" onScroll={() => {
            const host = viewer.current;
            if (!host) return;
            const top = host.getBoundingClientRect().top;
            const sections = [...host.querySelectorAll<HTMLElement>("[data-page-number]")];
            const current = sections.find(section => section.getBoundingClientRect().bottom > top + 60);
            if (current) setPage(Number(current.dataset.pageNumber));
          }}><PdfViewer key={paper.id} data={paper.file} width={Math.max(240, Math.floor(Math.min(containerWidth - 48, 920) * zoom))} onLoad={onPdfLoad} onError={onPdfError} /></div>
        </section>
        <aside className="translation-panel" aria-label="번역 사이드바">
          <div className="sidebar-header"><div><Languages size={18} /><h2>Translation</h2><span className="count">{history.length}</span></div><button title="번역 기록 전체 삭제" aria-label="번역 기록 전체 삭제" disabled={!history.length} onClick={() => setHistory([])}><Trash2 size={16} /></button></div>
          <div className="translation-list" aria-live="polite" aria-busy={busy}>
            {busy && <div className="translation-pending" role="status"><LoaderCircle className="spin" size={19} /><div><strong>한국어로 번역하는 중…</strong><p>선택한 문장을 Google 번역으로 보냈습니다.</p></div></div>}
            {!history.length && !busy && <div className="translation-empty"><span className="empty-icon"><Languages size={28} strokeWidth={1.4} /></span><h3>이해가 필요한 순간에</h3><p>논문에서 영어 문장을 드래그하고<br /><strong>번역</strong> 버튼을 눌러 주세요.</p><div className="steps"><span>문장 선택</span><ChevronRight size={13} /><span>번역</span><ChevronRight size={13} /><span>이해</span></div><small>스캔된 PDF는 텍스트 선택이<br />지원되지 않을 수 있습니다.</small></div>}
            {history.map(item => <article className="translation-card" key={item.id}>
              <header><button className="page-link" onClick={() => jumpTo(item.page)}>p. {item.page} <ArrowUpRight size={12} /></button><div>{item.cached && <span className="cache-label">캐시</span>}<button aria-label="번역 복사" title="한국어 번역 복사" onClick={() => void copy(item)}>{copied === item.id ? <Check size={15} /> : <Copy size={15} />}</button><button aria-label="번역 삭제" title="삭제" onClick={() => setHistory(items => items.filter(entry => entry.id !== item.id))}><X size={15} /></button></div></header>
              <p className="language-label">ENGLISH</p><p className="original">{item.original}</p><div className="translation-divider" /><p className="language-label korean-label">한국어</p><p className="translated">{item.translated}</p>
            </article>)}
          </div><footer className="sidebar-footer"><span className="status-dot" /> EN → KO <span>Google Translation · NMT</span><small>기록은 현재 탭의 메모리에만 보관됩니다.</small></footer>
        </aside>
      </main>
    </>}
    {selection && <button ref={floatingButton} className="floating-translate" style={{ left: selection.x, top: selection.y }} onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={() => void translate()} disabled={busy} aria-label="선택 문장 번역">{busy ? <LoaderCircle className="spin" size={16} /> : <Languages size={16} />} {busy ? "번역 중…" : characterCount(selection.text) > MAX_TEXT_LENGTH ? "2,000자 초과" : "번역"}</button>}
    {openDialog && <div className="dialog-backdrop" onClick={e => { if (e.target === e.currentTarget) setOpenDialog(false); }}><div ref={dialogRef} className="source-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><h2 id="dialog-title">새 PDF 열기</h2><button aria-label="PDF 열기 닫기" onClick={() => setOpenDialog(false)}><X size={20} /></button></header><p className="dialog-description">다른 PDF를 열면 현재 번역 기록이 초기화됩니다.</p>{sourceForm(true)}{error && <p className="dialog-error" role="alert">{error}</p>}</div></div>}
    {dragging && <div className="drop-overlay"><Upload size={40} /><h2>PDF를 여기에 놓으세요</h2><p>최대 20MB · 서버에 업로드하지 않습니다</p></div>}
  </div>;
}
