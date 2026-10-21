// Enquire screen header: the full page header on /admin/forms/*, a compact
// row inside the Dev Centre (whose shell already says "Enquire").

import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useEnquireEmbedded } from "@/lib/forms/enquireNav";

export function EnquireHead({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  const embedded = useEnquireEmbedded();
  if (!embedded) return <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} />;
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-3">
      <div className="min-w-0">
        {eyebrow && <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dim)]">{eyebrow}</p>}
        <h3 className="font-head text-[17px] font-medium tracking-[-0.01em]">{title}</h3>
        {subtitle && <p className="text-[12px] text-[var(--dim)]">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
