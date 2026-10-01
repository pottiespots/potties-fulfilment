import { requireRole } from '@/lib/auth';
import { Header } from '@/components/ui';
import { ActButton } from '@/components/client';
import { syncShopify } from '@/app/actions/hq';

export default async function HQLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('HQ');
  return (
    <>
      <Header user={user} sub="Fulfilment Desk"
        tabs={[['/hq', 'Today'], ['/hq/orders', 'Foundry orders'], ['/hq/deadlines', 'Deadlines'], ['/hq/ll', 'LL Manufacturing'], ['/hq/invoices', 'Invoices'], ['/hq/stock', 'Pot stock'], ['/hq/users', 'Logins']]}
        right={<ActButton action={syncShopify} className="btn ghost sm">Sync Shopify</ActButton>} />
      {children}
    </>
  );
}
