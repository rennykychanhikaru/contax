export default function AdminDashboard() {
  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-sm text-gray-600">
          Overview of platform health, usage, and recent administrative actions.
        </p>
      </header>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Metrics dashboard coming soon. Hook into observability once data sources are finalized.
      </div>
    </section>
  );
}
