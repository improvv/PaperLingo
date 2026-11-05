"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
const options = {
  cMapUrl: "/pdf-assets/cmaps/",
  standardFontDataUrl: "/pdf-assets/standard_fonts/",
  wasmUrl: "/pdf-assets/wasm/",
  isEvalSupported: false,
};

function PaperPage({ number, width }: { number: number; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState(1.414);
  const [noText, setNoText] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "1000px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <section ref={ref} className="paper-page" data-page-number={number} id={`pdf-page-${number}`} style={{ width, minHeight: width * ratio + 34 }} aria-label={`PDF ${number}페이지`}>
    {visible ? <Page pageNumber={number} width={width} renderAnnotationLayer={false}
      onLoadSuccess={page => setRatio(page.height / page.width)}
      onGetTextSuccess={content => setNoText(!content.items.some(item => "str" in item && item.str.trim()))}
      loading={<div className="page-placeholder" style={{ height: width * ratio }}>페이지 불러오는 중…</div>}
      error={<p className="page-placeholder">이 페이지를 표시할 수 없습니다.</p>} />
      : <div className="page-placeholder" style={{ height: width * ratio }}>{number}페이지</div>}
    <footer>{number}{noText && <span> · 텍스트가 없는 페이지입니다. OCR은 지원하지 않습니다.</span>}</footer>
  </section>;
}

export default function PdfViewer({ data, width, onLoad, onError }: {
  data: { data: Uint8Array }; width: number; onLoad: (pages: number) => void; onError: () => void;
}) {
  const [pages, setPages] = useState(0);
  return <Document file={data} options={options} onLoadSuccess={({ numPages }) => { setPages(numPages); onLoad(numPages); }}
    onLoadError={onError} onSourceError={onError}
    loading={<div className="viewer-message" role="status">PDF를 불러오는 중…</div>}
    error={<div className="viewer-message">PDF를 열 수 없습니다. 파일이 손상되었거나 암호로 보호되었을 수 있습니다.</div>}
    onPassword={(_callback, reason) => { if (reason) onError(); }}>
    {Array.from({ length: pages }, (_, i) => <PaperPage key={i + 1} number={i + 1} width={width} />)}
  </Document>;
}
