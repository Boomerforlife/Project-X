"use client";

import { useEffect, useState } from "react";
import type { BillingMe, Order, PaymentLink } from "@projectx/contracts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { billingMe, createPaymentLink, formatInr, listOrders } from "@/lib/api/billing";
import { apiEnabled } from "@/lib/api/env";
import { track } from "@/lib/analytics";
import { useAuthStatus } from "@/lib/session/store";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const STATUS: Record<Order["status"], string> = { CREATED: "Not completed", PAID: "Paid", FAILED: "Failed", REFUNDED: "Refunded" };

/** Account → Billing. Renders nothing in mock mode (no fake billing data). */
export function BillingSection() {
  const { status } = useAuthStatus();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [failed, setFailed] = useState(false);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!apiEnabled() || status !== "ready") return;
    Promise.all([billingMe(), listOrders()])
      .then(([m, o]) => {
        setMe(m);
        setOrders(o);
      })
      .catch(() => setFailed(true));
  }, [status]);

  if (!apiEnabled()) return null;

  async function makeLink() {
    setLinkBusy(true);
    try {
      const l = await createPaymentLink("plus_quarterly");
      setLink(l);
      track("payment_link_created", { plan: l.plan.code });
    } catch {
      setFailed(true);
    } finally {
      setLinkBusy(false);
    }
  }
  const linkUrl = link ? (link.url ?? `${window.location.origin}/pay/${link.token}/`) : null;

  return (
    <Card className="p-6" id="billing">
      <h2 className="font-medium">Billing</h2>
      {failed ? (
        <p className="mt-2 text-sm text-fg-muted" role="alert">
          Billing details couldn&apos;t load. Your plan is unaffected; try again later.
        </p>
      ) : !me ? (
        <p className="mt-2 text-sm text-fg-muted">Loading…</p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            {me.tier === "PLUS" && me.plus_until ? (
              <>
                <strong>Plus</strong> until {fmt(me.plus_until)}. One-time pass; it does not renew.
              </>
            ) : (
              <>
                <strong>Free plan.</strong>{" "}
                {me.quota.full_papers.limit !== null
                  ? `${me.quota.full_papers.used} of ${me.quota.full_papers.limit} full papers used this month (resets ${fmt(me.quota.full_papers.resets_on)}).`
                  : "Practice is unlimited."}
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/pricing/" variant="secondary" size="sm">
              {me.tier === "PLUS" ? "Add more time" : "See Plus"}
            </ButtonLink>
            {me.payments_enabled ? (
              <Button variant="ghost" size="sm" onClick={() => void makeLink()} disabled={linkBusy}>
                Ask a parent to pay
              </Button>
            ) : null}
          </div>
          {linkUrl ? (
            <div className="mt-4 rounded-lg border border-line p-3 text-sm">
              <p>Share this link. It is valid for 7 days and pays for {link!.plan.name} ({formatInr(link!.plan.price_paise)}) on your account.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1">{linkUrl}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(linkUrl).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
          {orders.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Payment history</caption>
                <thead className="text-fg-muted">
                  <tr>
                    <th className="py-2 pr-4 font-normal">Date</th>
                    <th className="py-2 pr-4 font-normal">Plan</th>
                    <th className="py-2 pr-4 font-normal">Amount</th>
                    <th className="py-2 pr-4 font-normal">Status</th>
                    <th className="py-2 font-normal">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-4">{fmt(o.created_at)}</td>
                      <td className="py-2 pr-4">{o.plan_name}</td>
                      <td className="py-2 pr-4">{formatInr(o.amount_paise)}</td>
                      <td className="py-2 pr-4">{STATUS[o.status]}</td>
                      <td className="py-2 font-mono text-xs">{o.receipt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
