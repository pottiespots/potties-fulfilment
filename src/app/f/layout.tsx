import { requireRole } from '@/lib/auth';
import { Header } from '@/components/ui';

export default async function FoundryLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('FOUNDRY');
  return (
    <>
      <Header user={user} sub="Foundry Orders" tabs={[['/f', 'My orders'], ['/f/deadlines', 'Deadlines'], ['/f/invoices', 'My invoices']]} />
      {children}
    </>
  );
}
