import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '青山城 | 城西泥潭',
  description: '一個聚焦青山城城西的冷硬市井江湖文字冒險遊戲。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant" className="dark">
      <body className="bg-zinc-950 text-zinc-300 antialiased">
        {children}
      </body>
    </html>
  );
}
