"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addPayment,
  addSaleItem,
  applySaleDiscount,
  createSale,
  deletePayment,
  finalizeSale,
  removeSaleItem,
  type SalePaymentMethod,
} from "@/app/actions/sales";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { moneyBRL } from "@/lib/utils";

type Unit = { id: string; name: string };
type Customer = { id: string; name: string; phone: string | null };
type CatalogItem = { id: string; name: string; type: "service" | "product"; price_cents: number };
type Profile = { id: string; name: string; role: "admin" | "caixa" | "profissional" };

type Sale = {
  id: string;
  status: "open" | "paid" | "cancelled";
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  customer_id: string | null;
  professional_id: string | null;
};

type SaleItem = {
  id: string;
  qty: number;
  unit_price_cents: number;
  discount_cents: number;
  total_cents: number;
  notes: string | null;
  professional_id: string | null;
  catalog_items: { name: string; type: "service" | "product" };
};

type SalePayment = {
  id: string;
  method: SalePaymentMethod;
  amount_cents: number;
  status: "authorized" | "captured" | "voided" | "refunded";
  created_at: string;
};

function parseCents(input: string) {
  const s = String(input ?? "").trim();
  if (!s) return 0;
  if (s.includes(",") || s.includes(".")) {
    const normalized = s.replaceAll(".", "").replace(",", ".");
    const v = Number(normalized);
    return Number.isFinite(v) ? Math.round(v * 100) : 0;
  }
  const v = Number(s);
  return Number.isFinite(v) ? Math.round(v) : 0;
}

export default function PdvPanel() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [isPending, startTransition] = useTransition();

  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState<string>("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<string>("");

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogItemId, setCatalogItemId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [price, setPrice] = useState<string>("");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [professionalId, setProfessionalId] = useState<string>("");

  const [saleId, setSaleId] = useState<string>("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<SalePayment[]>([]);

  const [discount, setDiscount] = useState<string>("0");
  const [payMethod, setPayMethod] = useState<SalePaymentMethod>("pix");
  const [payAmount, setPayAmount] = useState<string>("");

  const [err, setErr] = useState<string>("");
  const [ok, setOk] = useState<string>("");

  async function loadBootstrap() {
    setErr("");
    const [{ data: u, error: uErr }, { data: c, error: cErr }, { data: cat, error: catErr }, { data: p, error: pErr }] =
      await Promise.all([
        supabase.from("units").select("id,name").eq("is_active", true).order("name"),
        supabase.from("customers").select("id,name,phone").order("name").limit(200),
        supabase
          .from("catalog_items")
          .select("id,name,type,price_cents")
          .eq("is_active", true)
          .order("type")
          .order("name")
          .limit(300),
        supabase.from("profiles").select("id,name,role").eq("is_active", true).order("name").limit(200),
      ]);

    if (uErr || cErr || catErr || pErr) {
      setErr(uErr?.message || cErr?.message || catErr?.message || pErr?.message || "Falha ao carregar dados");
      return;
    }

    setUnits(u ?? []);
    setCustomers(c ?? []);
    setCatalog(cat ?? []);
    setProfiles(p ?? []);

    if (!unitId && u?.[0]?.id) setUnitId(u[0].id);
  }

  // Se vier da Agenda (ex.: /app/pdv?sale=<id>), carrega automaticamente.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const incomingSale = sp.get("sale");
      if (incomingSale && incomingSale !== saleId) {
        setSaleId(incomingSale);
        void loadSale(incomingSale);
      }
    } catch {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSale(id: string) {
    if (!id) return;
    setErr("");

    const [{ data: s, error: sErr }, { data: si, error: siErr }, { data: sp, error: spErr }] = await Promise.all([
      supabase
        .from("sales")
        .select("id,status,subtotal_cents,discount_cents,total_cents,customer_id,professional_id")
        .eq("id", id)
        .single(),
      supabase
        .from("sale_items")
        .select(
          "id,qty,unit_price_cents,discount_cents,total_cents,notes,professional_id,catalog_items(name,type)"
        )
        .eq("sale_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("sale_payments")
        .select("id,method,amount_cents,status,created_at")
        .eq("sale_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (sErr || siErr || spErr) {
      setErr(sErr?.message || siErr?.message || spErr?.message || "Falha ao carregar comanda");
      return;
    }

    setSale(s as any);
    setSaleItems((si ?? []) as any);
    setPayments((sp ?? []) as any);
    setDiscount(String((s as any).discount_cents ?? 0));
    setCustomerId((s as any).customer_id ?? "");
    setProfessionalId((s as any).professional_id ?? "");
  }

  useEffect(() => {
    void loadBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (catalogItemId) {
      const it = catalog.find((x) => x.id === catalogItemId);
      if (it) setPrice(String(it.price_cents));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItemId]);

  const paidSum = useMemo(() => payments.reduce((acc, p) => acc + (p.amount_cents ?? 0), 0), [payments]);
  const remaining = useMemo(() => Math.max((sale?.total_cents ?? 0) - paidSum, 0), [sale, paidSum]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Comanda / Venda</h2>
            <p className="muted mt-1 text-sm">Crie uma comanda, adicione itens e finalize com múltiplos pagamentos.</p>
          </div>

          <button
            className="btn"
            disabled={!unitId || isPending}
            onClick={() =>
              startTransition(async () => {
                setErr("");
                setOk("");
                try {
                  const id = await createSale({
                    unitId,
                    customerId: customerId || null,
                    professionalId: professionalId || null,
                    notes: null,
                  });
                  setSaleId(id);
                  await loadSale(id);
                  setOk("Comanda criada.");
                } catch (e: any) {
                  setErr(e?.message ?? "Falha ao criar comanda");
                }
              })
            }
          >
            Nova comanda
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Unidade</span>
            <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={isPending}>
              <option value="" disabled>
                Selecione…
              </option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">Cliente (opcional)</span>
            <select
              className="input"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={isPending}
            >
              <option value="">Sem cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` — ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">Profissional (opcional)</span>
            <select
              className="input"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              disabled={isPending}
            >
              <option value="">Sem profissional</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </label>
        </div>

        {!units.length ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
            Não há unidades cadastradas. Crie pelo menos 1 registro na tabela <b>units</b> para operar o PDV.
          </div>
        ) : null}

        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid flex-1 gap-1 min-w-[220px]">
                <span className="text-sm font-medium">Item</span>
                <select
                  className="input"
                  value={catalogItemId}
                  onChange={(e) => setCatalogItemId(e.target.value)}
                  disabled={!saleId || isPending}
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {catalog.map((it) => (
                    <option key={it.id} value={it.id}>
                      [{it.type}] {it.name} — {moneyBRL(it.price_cents)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 w-[110px]">
                <span className="text-sm font-medium">Qtd</span>
                <input className="input" value={qty} onChange={(e) => setQty(e.target.value)} disabled={!saleId || isPending} />
              </label>

              <label className="grid gap-1 w-[160px]">
                <span className="text-sm font-medium">Preço (R$ ou centavos)</span>
                <input
                  className="input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={!saleId || isPending}
                />
              </label>

              <button
                className="btn"
                disabled={!saleId || !catalogItemId || isPending}
                onClick={() =>
                  startTransition(async () => {
                    setErr("");
                    setOk("");
                    try {
                      const q = Math.max(Number(qty || 1), 0.01);
                      const unitPriceCents = parseCents(price);
                      await addSaleItem({
                        saleId,
                        catalogItemId,
                        qty: q,
                        unitPriceCents,
                        discountCents: 0,
                        professionalId: professionalId || null,
                      });
                      await loadSale(saleId);
                      setOk("Item adicionado.");
                    } catch (e: any) {
                      setErr(e?.message ?? "Falha ao adicionar item");
                    }
                  })
                }
              >
                Adicionar
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-[1fr_90px_120px_44px] gap-2 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
                <span>Item</span>
                <span className="text-right">Qtd</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              <div className="max-h-[360px] overflow-auto">
                {saleItems.length ? (
                  saleItems.map((it) => (
                    <div
                      key={it.id}
                      className="grid grid-cols-[1fr_90px_120px_44px] gap-2 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
                    >
                      <div>
                        <div className="font-medium">{it.catalog_items?.name ?? "(item)"}</div>
                        <div className="muted text-xs">
                          {it.catalog_items?.type} • Unit: {moneyBRL(it.unit_price_cents)}
                        </div>
                      </div>
                      <div className="text-right">{it.qty}</div>
                      <div className="text-right font-semibold">{moneyBRL(it.total_cents)}</div>
                      <button
                        className="rounded-xl border border-zinc-200 p-2 text-xs font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                        disabled={isPending}
                        title="Remover"
                        onClick={() =>
                          startTransition(async () => {
                            setErr("");
                            try {
                              await removeSaleItem(it.id);
                              await loadSale(saleId);
                            } catch (e: any) {
                              setErr(e?.message ?? "Falha ao remover item");
                            }
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-sm muted">Adicione itens para compor a venda.</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold">Resumo</h3>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="muted">Subtotal</span>
                  <span className="font-medium">{moneyBRL(sale?.subtotal_cents ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="muted">Desconto</span>
                  <span className="font-medium">{moneyBRL(sale?.discount_cents ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900/40">
                  <span className="font-semibold">Total</span>
                  <span className="font-semibold">{moneyBRL(sale?.total_cents ?? 0)}</span>
                </div>

                <label className="grid gap-1 mt-2">
                  <span className="text-sm font-medium">Aplicar desconto (R$ ou centavos)</span>
                  <div className="flex gap-2">
                    <input className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={!saleId || isPending} />
                    <button
                      className="btn"
                      disabled={!saleId || isPending}
                      onClick={() =>
                        startTransition(async () => {
                          setErr("");
                          setOk("");
                          try {
                            await applySaleDiscount(saleId, parseCents(discount));
                            await loadSale(saleId);
                            setOk("Desconto aplicado.");
                          } catch (e: any) {
                            setErr(e?.message ?? "Falha ao aplicar desconto");
                          }
                        })
                      }
                    >
                      Aplicar
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold">Pagamentos</h3>
              <p className="muted mt-1 text-sm">Adicione pagamentos e finalize quando atingir o total.</p>

              <div className="mt-3 grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Método</span>
                    <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value as any)} disabled={!saleId || isPending}>
                      <option value="pix">PIX</option>
                      <option value="card">Cartão</option>
                      <option value="cash">Dinheiro</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Valor (R$ ou centavos)</span>
                    <input className="input" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} disabled={!saleId || isPending} />
                  </label>
                </div>

                <button
                  className="btn"
                  disabled={!saleId || isPending}
                  onClick={() =>
                    startTransition(async () => {
                      setErr("");
                      setOk("");
                      try {
                        const cents = parseCents(payAmount || "0");
                        if (cents <= 0) throw new Error("Informe um valor de pagamento válido");
                        await addPayment(saleId, payMethod, cents);
                        setPayAmount("");
                        await loadSale(saleId);
                        setOk("Pagamento adicionado.");
                      } catch (e: any) {
                        setErr(e?.message ?? "Falha ao adicionar pagamento");
                      }
                    })
                  }
                >
                  Adicionar pagamento
                </button>

                <div className="mt-2 grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="muted">Pago</span>
                    <span className="font-medium">{moneyBRL(paidSum)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="muted">Restante</span>
                    <span className="font-semibold">{moneyBRL(remaining)}</span>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <div className="grid grid-cols-[90px_1fr_44px] gap-2 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
                    <span>Método</span>
                    <span className="text-right">Valor</span>
                    <span />
                  </div>
                  <div className="max-h-[200px] overflow-auto">
                    {payments.length ? (
                      payments.map((p) => (
                        <div
                          key={p.id}
                          className="grid grid-cols-[90px_1fr_44px] gap-2 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
                        >
                          <div className="font-medium">{p.method}</div>
                          <div className="text-right font-semibold">{moneyBRL(p.amount_cents)}</div>
                          <button
                            className="rounded-xl border border-zinc-200 p-2 text-xs font-semibold hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                            disabled={isPending}
                            title="Remover"
                            onClick={() =>
                              startTransition(async () => {
                                setErr("");
                                try {
                                  await deletePayment(p.id);
                                  await loadSale(saleId);
                                } catch (e: any) {
                                  setErr(e?.message ?? "Falha ao remover pagamento");
                                }
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-sm muted">Nenhum pagamento registrado.</div>
                    )}
                  </div>
                </div>

                <button
                  className="btn"
                  disabled={!saleId || !sale || remaining > 0 || sale.status !== "open" || isPending}
                  onClick={() =>
                    startTransition(async () => {
                      setErr("");
                      setOk("");
                      try {
                        await finalizeSale(saleId);
                        await loadSale(saleId);
                        setOk("Venda finalizada.");
                      } catch (e: any) {
                        setErr(e?.message ?? "Falha ao finalizar venda");
                      }
                    })
                  }
                >
                  Finalizar venda
                </button>

                {sale?.status === "paid" ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                    Venda paga e registrada no caixa.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {(err || ok) ? (
          <div className="mt-4 grid gap-2">
            {ok ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                {ok}
              </div>
            ) : null}
            {err ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-100">
                {err}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="card p-6">
        <h2 className="text-base font-semibold">Comandas recentes</h2>
        <p className="muted mt-1 text-sm">Selecione uma comanda para continuar (últimas 20).</p>

        <div className="mt-4 grid gap-2">
          <button className="btn" disabled={!unitId || isPending} onClick={() => loadBootstrap()}>
            Atualizar dados
          </button>
        </div>

        <RecentSales
          unitId={unitId}
          currentSaleId={saleId}
          onPick={(id) => {
            setSaleId(id);
            void loadSale(id);
          }}
        />
      </aside>
    </div>
  );
}

function RecentSales({
  unitId,
  currentSaleId,
  onPick,
}: {
  unitId: string;
  currentSaleId: string;
  onPick: (saleId: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Array<{ id: string; status: string; total_cents: number; created_at: string }>>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!unitId) return;
    (async () => {
      setErr("");
      const { data, error } = await supabase
        .from("sales")
        .select("id,status,total_cents,created_at")
        .eq("unit_id", unitId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        setErr(error.message);
        return;
      }
      setRows((data ?? []) as any);
    })();
  }, [supabase, unitId]);

  return (
    <div className="mt-4">
      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="grid grid-cols-[1fr_90px] gap-2 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
          <span>Comanda</span>
          <span className="text-right">Total</span>
        </div>
        <div className="max-h-[560px] overflow-auto">
          {rows.length ? (
            rows.map((r) => (
              <button
                key={r.id}
                className={`grid w-full grid-cols-[1fr_90px] gap-2 border-t border-zinc-200 px-4 py-3 text-left text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40 ${
                  r.id === currentSaleId ? "bg-zinc-50 dark:bg-zinc-900/40" : ""
                }`}
                onClick={() => onPick(r.id)}
              >
                <div>
                  <div className="font-medium">{r.status}</div>
                  <div className="muted text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="text-right font-semibold">{moneyBRL(r.total_cents)}</div>
              </button>
            ))
          ) : (
            <div className="p-4 text-sm muted">Sem vendas nesta unidade.</div>
          )}
        </div>
      </div>
    </div>
  );
}
