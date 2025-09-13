export default function AuthLayout({ children }: React.PropsWithChildren) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        <div className="bg-card shadow-xl rounded-lg p-8 border">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-foreground">
              <strong className="text-primary">Contax</strong>
            </h1>
            <p className="text-muted-foreground mt-2">Voice Scheduling Platform</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}