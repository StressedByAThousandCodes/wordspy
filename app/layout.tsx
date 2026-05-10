import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'
//@ts-ignore
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-syne',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'WordSpy — Who is the Spy?',
  description: 'A real-time multiplayer word guessing game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="min-h-screen bg-[#0a0a0f] text-white antialiased font-sans">
        {children}
      </body>
    </html>
  )
}