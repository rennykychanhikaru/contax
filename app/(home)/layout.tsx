import Header from '../../components/Header';

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6">
        {children}
      </main>
    </div>
  );
}