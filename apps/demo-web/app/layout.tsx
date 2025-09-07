export const metadata = {
  title: 'Contax Demo',
  description: 'Local demo for voice agent scheduling'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui', margin: 0 }}>
        {/* Makerkit UI styles */}
        <link rel="stylesheet" href="/mk-styles.css" />
        <div className="mk-header"><strong>Contax</strong> — Voice Scheduling Demo</div>
        <div className="mk-container">{children}</div>
      </body>
    </html>
  )
}
