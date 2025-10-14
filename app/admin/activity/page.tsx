export default function AdminActivityPage() {
  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold text-gray-900">Activity Log</h2>
        <p className="mt-1 text-sm text-gray-600">
          Audit super admin actions, filter by account, and surface anomalies.
        </p>
      </header>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Audit log explorer coming soon. Connect to `admin_audit_log` once data is flowing.
      </div>
    </section>
  );
}
