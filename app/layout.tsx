import type { Metadata } from 'next'
// import './globals.css'

export const metadata: Metadata = {
  title: 'Who Is The Spy?',
  description: 'A real-time multiplayer word guessing game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  )
}