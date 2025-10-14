import type { ReactNode } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';

export default function AdminSection({ children }: { children: ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
