import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperLingo · 논문 읽기에 집중하세요",
  description: "A personal PDF research paper reader with instant English-to-Korean translation.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
