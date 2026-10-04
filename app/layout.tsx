import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '鳴森樓 | Ming Sum Pavilion',
  description: '一個硬派武俠 TRPG 文字冒險遊戲。青山城，江湖路遠，步步為營。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-300 antialiased`}>
        {children}
      </body>
    </html>
  );
}
