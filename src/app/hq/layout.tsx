import { requireRole } from '@/lib/auth';
import { Header } from '@/components/ui';
import { ActButton } from '@/components/client';
import { syncShopify } from '@/app/actions/hq';
import { shopifyAdmin } from '@/lib/shopify-insights';

export default async function HQLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('HQ');
  return (
    <>
      <Header user={user} sub="Fulfilment Desk"
        tabs={[['/hq', 'Dashboard'], ['/hq/orders', 'Foundry orders'], ['/hq/deadlines', 'Deadlines'], ['/hq/ll', 'LL Manufacturing'], ['/hq/invoices', 'Invoices'], ['/hq/stock', 'Pot stock'], ['/hq/users', 'Logins']]}
        right={<>
          {shopifyAdmin() && <a className="btn ghost sm" href={shopifyAdmin()!} target="_blank" rel="noreferrer" title="Open Shopify admin in a new tab">Shopify ↗</a>}
          <ActButton action={syncShopify} className="btn ghost sm">Sync Shopify</ActButton>
        </>} />
      {children}
    </>
  );
}
