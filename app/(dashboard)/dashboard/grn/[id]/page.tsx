import { redirect } from 'next/navigation';

// A goods receipt now opens on the Goods Receipt screen; old links (lineage, attachments, bookmarks) land here.
export default async function GrnRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/transactions/grn?id=${encodeURIComponent(id)}`);
}
