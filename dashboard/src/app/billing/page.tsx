"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type BillingInfo, type Invoice, type PaymentMethod } from "@/lib/api";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useToast } from "@/components/toast";
import { CardSkeleton, TableSkeleton } from "@/components/skeleton";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

const INVOICES_PER_PAGE = 5;

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpdateCard, setShowUpdateCard] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [billingEmail, setBillingEmail] = useState<string>("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const { toast } = useToast();

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.getBilling(), api.listInvoices()])
      .then(([b, i]) => {
        setBilling(b);
        setInvoices(i.invoices);
        if (b.stripe_publishable_key && !stripePromise) {
          setStripePromise(loadStripe(b.stripe_publishable_key));
        }
        // Load payment methods and customer details if they have a subscription
        if (b.has_payment_method) {
          api.listPaymentMethods().then(r => setPaymentMethods(r.payment_methods)).catch(() => {});
          api.getBillingCustomer().then(r => {
            setBillingEmail(r.email || "");
            setEmailDraft(r.email || "");
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [stripePromise]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll billing until status changes (for webhook-driven updates like checkout)
  const pollRefresh = useCallback(async () => {
    const currentStatus = billing?.subscription_status;
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const [b, inv] = await Promise.all([api.getBilling(), api.listInvoices()]);
        if (b.subscription_status !== currentStatus) {
          setBilling(b);
          setInvoices(inv.invoices);
          if (b.has_payment_method) {
            api.listPaymentMethods().then(r => setPaymentMethods(r.payment_methods)).catch(() => {});
            api.getBillingCustomer().then(r => { setBillingEmail(r.email || ""); setEmailDraft(r.email || ""); }).catch(() => {});
          }
          return;
        }
      } catch { /* retry */ }
    }
    refresh(); // fallback
  }, [billing?.subscription_status, refresh]);

  const handleSubscribe = async () => {
    setActionLoading(true);
    try {
      const { client_secret } = await api.createSubscription();
      setCheckoutSecret(client_secret);
      setShowCheckout(true);
    } catch {
      toast("Failed to start subscription. Please try again.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll retain access until the end of the billing period.")) return;
    setActionLoading(true);
    try {
      await api.cancelSubscription();
      toast("Subscription cancelled");
      refresh();
    } catch {
      toast("Failed to cancel. Please try again.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    try {
      await api.reactivateSubscription();
      toast("Subscription reactivated");
      refresh();
    } catch {
      toast("Failed to reactivate. Please try again.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateCard = async () => {
    setActionLoading(true);
    try {
      const { client_secret } = await api.createSetupIntent();
      setSetupSecret(client_secret);
      setShowUpdateCard(true);
    } catch {
      toast("Failed to start card update. Please try again.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePaymentMethod = async (pmId: string) => {
    if (!confirm("Remove this payment method?")) return;
    setActionLoading(true);
    try {
      await api.deletePaymentMethod(pmId);
      setPaymentMethods(prev => prev.filter(pm => pm.id !== pmId));
      toast("Payment method removed");
    } catch {
      toast("Failed to remove payment method.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!emailDraft || !emailDraft.includes("@")) {
      toast("Please enter a valid email.", "error");
      return;
    }
    setActionLoading(true);
    try {
      const { email } = await api.updateBillingEmail(emailDraft);
      setBillingEmail(email);
      setEditingEmail(false);
      toast("Billing email updated");
    } catch {
      toast("Failed to update email.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Billing</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <TableSkeleton rows={3} cols={4} />
      </div>
    );
  }

  if (!billing) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Billing</h1>
        <p className="text-zinc-500">Unable to load billing info.</p>
      </div>
    );
  }

  const isActive = billing.subscription_status === "active";
  const accessUntilDate = billing.access_until ? new Date(billing.access_until) : null;
  const accessUntilValid = accessUntilDate && !isNaN(accessUntilDate.getTime()) && accessUntilDate.getTime() > Date.now();
  const isCancelling = billing.subscription_status === "active" && accessUntilValid;
  const isPastDue = billing.subscription_status === "past_due";
  const isCancelled = billing.subscription_status === "cancelled";
  const isIncomplete = billing.subscription_status === "incomplete" || billing.subscription_status === "incomplete_expired";
  const isFree = billing.subscription_status === "none" || billing.subscription_status === "free" || !billing.subscription_status;
  const canSubscribe = isFree || isCancelled || isIncomplete;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      {/* Plan + Usage */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Plan" value={canSubscribe ? "Free" : "Pro"} />
        <StatCard label="Status" value={isCancelling ? "Cancelling" : isCancelled ? "Cancelled" : (isFree || isIncomplete) ? "Free" : isPastDue ? "Past due" : billing.subscription_status} />
        <StatCard label="Tokens this month" value={formatTokens(billing.current_period.total_tokens)} />
      </div>

      {/* Usage meters */}
      {isActive && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <UsageMeter
            label="Tokens"
            used={billing.current_period.total_tokens}
            included={billing.limits.tokens}
            overageCents={billing.limits.overage_per_1k_tokens_cents}
            unit="1K tokens"
          />
        </div>
      )}

      {/* Past due warning */}
      {isPastDue && (
        <div className="p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          Payment failed{billing.last_failure_reason ? `: ${billing.last_failure_reason}` : ""}. Please update your payment method.
        </div>
      )}

      {/* Cancelling notice */}
      {isCancelling && (
        <div className="p-4 mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
          Your subscription will end on {accessUntilDate!.toLocaleDateString()}.
          <button onClick={handleReactivate} disabled={actionLoading} className="ml-2 underline hover:no-underline">
            Undo cancellation
          </button>
        </div>
      )}

      {/* Cancelled notice */}
      {isCancelled && (
        <div className="p-4 mb-6 bg-zinc-500/10 border border-zinc-500/30 rounded-lg text-zinc-400 text-sm">
          Your subscription has ended. Subscribe again to continue using Coderhelm Pro.
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mb-6">
        {canSubscribe && !showCheckout && (
          <button
            onClick={handleSubscribe}
            disabled={actionLoading}
            className="px-5 py-2.5 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {actionLoading ? "..." : isCancelled ? "Re-subscribe to Pro — $199/mo" : "Subscribe to Pro — $199/mo"}
          </button>
        )}
        {(isActive || isPastDue) && !isCancelling && !showUpdateCard && (
          <>
            <button
              onClick={handleUpdateCard}
              disabled={actionLoading}
              className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              Update payment method
            </button>
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-lg text-sm font-medium hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50"
            >
              Cancel subscription
            </button>
          </>
        )}
      </div>

      {/* Inline subscribe form */}
      {showCheckout && checkoutSecret && stripePromise && (
        <div className="mb-6 border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">Subscribe to Pro</h2>
              <p className="text-zinc-400 text-sm">$199/mo · 5M tokens · cancel anytime</p>
            </div>
            <button onClick={() => { setShowCheckout(false); setCheckoutSecret(null); }} className="text-zinc-500 hover:text-zinc-300 text-sm">
              Cancel
            </button>
          </div>
          <Elements stripe={stripePromise} options={{ clientSecret: checkoutSecret, appearance: stripeAppearance, locale: "en", paymentMethodOrder: ["card"] } as any}>
            <SubscribeForm onSuccess={() => { setShowCheckout(false); setCheckoutSecret(null); toast("Subscription activated!", "success"); pollRefresh(); }} />
          </Elements>
        </div>
      )}

      {/* Inline update payment method form */}
      {showUpdateCard && setupSecret && stripePromise && (
        <div className="mb-6 border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Update payment method</h2>
            <button onClick={() => { setShowUpdateCard(false); setSetupSecret(null); }} className="text-zinc-500 hover:text-zinc-300 text-sm">
              Cancel
            </button>
          </div>
          <Elements stripe={stripePromise} options={{ clientSecret: setupSecret, appearance: stripeAppearance, locale: "en", paymentMethodOrder: ["card"] } as any}>
            <UpdateCardForm onSuccess={() => { setShowUpdateCard(false); setSetupSecret(null); refresh(); }} />
          </Elements>
        </div>
      )}

      {/* Payment methods on file */}
      {paymentMethods.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Payment methods</h2>
          <div className="space-y-2">
            {paymentMethods.map(pm => (
              <div key={pm.id} className={`flex items-center justify-between border rounded-lg p-4 bg-zinc-900/30 ${pm.is_default ? "border-blue-500/30" : "border-zinc-800"}`}>
                <div className="flex items-center gap-3">
                  {pm.type === "card" && pm.card && (
                    <>
                      <span className="text-zinc-200 font-medium capitalize">{pm.card.brand}</span>
                      <span className="text-zinc-400">····</span>
                      <span className="text-zinc-200 font-mono">{pm.card.last4}</span>
                      <span className="text-zinc-500 text-sm">
                        exp {String(pm.card.exp_month).padStart(2, "0")}/{pm.card.exp_year}
                      </span>
                      {pm.is_default && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Default</span>
                      )}
                    </>
                  )}

                </div>
                <div className="flex items-center gap-3">
                  {!pm.is_default && (
                    <button
                      onClick={async () => {
                        try {
                          await api.setDefaultPaymentMethod(pm.id);
                          setPaymentMethods(prev => prev.map(p => ({ ...p, is_default: p.id === pm.id })));
                          toast("Default payment method updated");
                        } catch {
                          toast("Failed to set default", "error");
                        }
                      }}
                      disabled={actionLoading}
                      className="text-zinc-500 hover:text-blue-400 text-sm transition-colors disabled:opacity-50"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => handleDeletePaymentMethod(pm.id)}
                    disabled={actionLoading}
                    className="text-zinc-500 hover:text-red-400 text-sm transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing email */}
      {billing.has_payment_method && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Billing email</h2>
          <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
            {editingEmail ? (
              <div className="flex items-center gap-3">
                <input
                  type="email"
                  value={emailDraft}
                  onChange={e => setEmailDraft(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                  placeholder="billing@coderhelm.com"
                />
                <button
                  onClick={handleSaveEmail}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditingEmail(false); setEmailDraft(billingEmail); }}
                  className="text-zinc-500 hover:text-zinc-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-zinc-200 text-sm">{billingEmail || "Not set"}</span>
                <button
                  onClick={() => setEditingEmail(true)}
                  className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monthly total */}
      {isActive && (
        <div className="mb-6 border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-zinc-100">This month</p>
            <span className="text-xs text-zinc-500">{billing.current_period.month}</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Base subscription</span>
              <span className="text-zinc-200">$199.00</span>
            </div>
            {billing.current_period.estimated_overage_cents > 0 && (
              <div className="flex justify-between text-zinc-400">
                <span>Token overage ({formatTokens(Math.max(billing.current_period.total_tokens - billing.limits.tokens, 0))} tokens)</span>
                <span className="text-yellow-400">${(billing.current_period.estimated_overage_cents / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-zinc-800 pt-2 flex justify-between font-medium">
              <span className="text-zinc-200">Estimated total</span>
              <span className="text-zinc-100">${((19900 + billing.current_period.estimated_overage_cents) / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Pricing info */}
      <div className="mb-8 border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
        {isActive ? (
          <>
            <p className="text-sm font-semibold text-zinc-100 mb-3">Pro — $199/mo includes</p>
            <p className="text-sm text-zinc-400">
              <span className="text-zinc-200 font-medium">{formatTokens(billing.limits.tokens)}</span> tokens/mo
              <span className="text-zinc-600 ml-1">— then ${(billing.limits.overage_per_1k_tokens_cents / 100).toFixed(2)}/1K tokens overage</span>
            </p>
            <p className="text-xs text-zinc-600 mt-2">
              All activity (plans, runs, analysis) counts towards token usage.
              <a href="/settings/budget" className="text-zinc-400 hover:text-zinc-200 ml-1 underline">Set a spending cap →</a>
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-zinc-100 mb-3">Free plan</p>
            <p className="text-sm text-zinc-400">
              <span className="text-zinc-200 font-medium">{formatTokens(500_000)}</span> tokens/mo
            </p>
            <p className="text-xs text-zinc-600 mt-2">
              <a href="/billing" onClick={handleSubscribe} className="text-zinc-400 hover:text-zinc-200 underline">Upgrade to Pro →</a> for {formatTokens(billing.limits.tokens)} tokens/mo + overage billing.
            </p>
          </>
        )}
      </div>

      {/* Invoices */}
      {invoices.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Invoices</h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Invoice</th>
                  <th className="px-4 py-2.5 font-medium">Period</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {invoices.slice((invoicePage - 1) * INVOICES_PER_PAGE, invoicePage * INVOICES_PER_PAGE).map((inv, i) => (
                  <tr key={i} className="hover:bg-zinc-900/50">
                    <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{inv.invoice_number || "—"}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{inv.period || "—"}</td>
                    <td className="px-4 py-2.5">
                      {inv.amount_cents ? `$${(inv.amount_cents / 100).toFixed(2)}` : "—"}
                      {inv.amount_refunded_cents ? (
                        <span className="text-emerald-400 text-xs ml-1.5">-${(inv.amount_refunded_cents / 100).toFixed(2)} refunded</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {inv.status === "refunded" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Refunded</span>
                      ) : inv.status === "partially_refunded" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Partial refund</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">Paid</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {inv.invoice_id && (
                        <button
                          onClick={async () => {
                              try {
                                const { pdf_url } = await api.getInvoicePdf(inv.invoice_id!);
                                window.open(pdf_url, "_blank");
                              } catch {
                                toast("Failed to download invoice", "error");
                              }
                          }}
                          className="text-blue-400 hover:underline text-xs cursor-pointer"
                        >
                          Download
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {invoices.length > INVOICES_PER_PAGE && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-zinc-500">
                {(invoicePage - 1) * INVOICES_PER_PAGE + 1}–{Math.min(invoicePage * INVOICES_PER_PAGE, invoices.length)} of {invoices.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setInvoicePage(p => Math.max(1, p - 1))}
                  disabled={invoicePage === 1}
                  className="px-3 py-1 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                >
                  Prev
                </button>
                <button
                  onClick={() => setInvoicePage(p => Math.min(Math.ceil(invoices.length / INVOICES_PER_PAGE), p + 1))}
                  disabled={invoicePage >= Math.ceil(invoices.length / INVOICES_PER_PAGE)}
                  className="px-3 py-1 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function UpdateCardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (result.error) {
      setError(result.error.message || "Failed to update card");
      setSubmitting(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-4 w-full px-4 py-2.5 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Update payment method"}
      </button>
    </form>
  );
}

function SubscribeForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (result.error) {
      setError(result.error.message || "Payment failed");
      setSubmitting(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-4 w-full px-4 py-2.5 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {submitting ? "Processing..." : "Subscribe — $199/mo"}
      </button>
    </form>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function UsageMeter({ label, used, included, overageCents, unit }: { label: string; used: number; included: number; overageCents: number; unit?: string }) {
  const pct = included > 0 ? Math.min((used / included) * 100, 100) : 0;
  const over = Math.max(used - included, 0);
  const isOver = used > included;
  const fmt = label === "Tokens" ? formatTokens : (n: number) => n.toString();
  const overageAmount = unit
    ? ((over / 1000) * overageCents) / 100
    : (over * overageCents) / 100;

  return (
    <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">
          {fmt(used)} / {fmt(included)}
          {isOver && <span className="text-yellow-400 ml-1">(+{fmt(over)} overage)</span>}
        </p>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isOver ? "bg-yellow-500" : pct > 80 ? "bg-orange-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isOver && (
        <p className="text-xs text-yellow-400/70 mt-1.5">
          +${overageAmount.toFixed(2)} overage
        </p>
      )}
    </div>
  );
}

const stripeAppearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#e4e4e7",
    colorBackground: "#09090b",
    colorText: "#e4e4e7",
    colorDanger: "#ef4444",
    colorTextSecondary: "#71717a",
    colorTextPlaceholder: "#52525b",
    borderRadius: "8px",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    spacingUnit: "4px",
    fontSizeBase: "14px",
  },
  rules: {
    ".Input": {
      backgroundColor: "#18181b",
      border: "1px solid #27272a",
      boxShadow: "none",
      color: "#e4e4e7",
      transition: "border-color 0.15s ease",
    },
    ".Input:focus": {
      border: "1px solid #3f3f46",
      boxShadow: "none",
    },
    ".Label": {
      color: "#a1a1aa",
      fontSize: "13px",
      fontWeight: "500",
    },
    ".Tab": {
      backgroundColor: "#18181b",
      border: "1px solid #27272a",
      color: "#a1a1aa",
      boxShadow: "none",
    },
    ".Tab:hover": {
      backgroundColor: "#27272a",
      color: "#e4e4e7",
    },
    ".Tab--selected": {
      backgroundColor: "#27272a",
      border: "1px solid #3f3f46",
      color: "#e4e4e7",
      boxShadow: "none",
    },
    ".TabIcon--selected": {
      fill: "#e4e4e7",
    },
  },
};
