import { notFound } from 'next/navigation';
import { AdminApp } from '@/components/admin/AdminApp';
import { SECTIONS } from '@/components/admin/sections-config';

export default async function AdminSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTIONS.some((s) => s.key === section)) notFound();
  return <AdminApp section={section} />;
}
