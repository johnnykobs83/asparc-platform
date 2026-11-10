import { deleteCustomerData } from '@/lib/admin/service';
import { handler, json, requireAdmin } from '@/lib/http/respond';

export const dynamic = 'force-dynamic';
/** Privacy request – permanently delete a customer's data (owner only). */
export const DELETE = handler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin(req, 'data:delete');
  return json({ deleted: await deleteCustomerData((await params).id) });
});
