import { Providers } from '../components/providers';
import './globals.css';

export const metadata = {
  title: 'Contax Demo',
  description: 'Local demo for voice agent scheduling'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          <div className="min-h-screen bg-background">
            <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="container flex h-14 items-center">
                <div className="mr-4 flex">
                  <h1 className="text-lg font-semibold">
                    <strong className="text-primary">Contax</strong> — Voice Scheduling Demo
                  </h1>
                </div>
              </div>
            </header>
            <main className="container py-6">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
