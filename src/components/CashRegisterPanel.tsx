"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { openCashRegister, closeCashRegister } from "@/app/actions/cash";
import { moneyBRL } from "@/lib/utils";

type Unit = { id: string; name: string };
type CashRegister = {
  id: string;
  unit_id: string;
  status: "open" | "closed";
  opened_at: string;
  opening_balance_cents: number;
  closed_at: string | null;
  closing_balance_cents: number | null;
};

type CashMovement = {
  id: string;
  type: "supply" | "withdraw" | "sale_payment" | "refund";
  amount_cents: number;
  notes: string | null;
  created_at: string;
};

export default function CashRegisterPanel() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState<string>("");
  const [openRegister, setOpenRegister] = useState<CashRegister | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [openingBalance, setOpeningBalance] = useState<string>("0");
  const [closingBalance, setClosingBalance] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  async function loadUnits() {
    const { data, error } = await supabase.from("units").select("id,name").eq("is_active", true).order("name");
    if (error) {
      setErr(error.message);
      return;
    }
    setUnits(data ?? []);
    if (!unitId && data?.[0]?.id) setUnitId(data[0].id);
  }

  async function loadOpenRegister(uId: string) {
    if (!uId) return;
    const { data, error } = await supabase
      .from("cash_registers")
      .select("id,unit_id,status,opened_at,opening_balance_cents,closed_at,closing_balance_cents")
      .eq("unit_id", uId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1);

    if (error) {
      setErr(error.message);
      return;
    }

    const reg = data?.[0] ?? null;
    setOpenRegister(reg);
    if (reg) {
      setClosingBalance(String(reg.opening_balance_cents));
      await loadMovements(reg.id);
    } else {
      setMovements([]);
    }
  }

  async function loadMovements(cashRegisterId: string) {
    const { data, error } = await supabase
      .from("cash_movements")
      .select("id,type,amount_cents,notes,created_at")
      .eq("cash_register_id", cashRegisterId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      setErr(error.message);
      return;
    }
    setMovements(data ?? []);
  }

  useEffect(() => {
    void loadUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setErr("");
    void loadOpenRegister(unitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const totals = useMemo(() => {
    const byType = movements.reduce(
      (acc, m) => {
        acc[m.type] = (acc[m.type] ?? 0) + m.amount_cents;
        return acc;
      },
      {} as Record<string, number>
    );
    return {
      sale_payment: byType.sale_payment ?? 0,
      supply: byType.supply ?? 0,
      withdraw: byType.withdraw ?? 0,
      refund: byType.refund ?? 0,
    };
  }, [movements]);

  function parseCents(input: string) {
    // aceita "12345" como centavos, ou "123,45" / "123.45" como reais
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

  const computedClosingPreview = useMemo(() => {
    const opening = openRegister?.opening_balance_cents ?? 0;
    return opening + totals.sale_payment + totals.supply - totals.withdraw - totals.refund;
  }, [openRegister, totals]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Operação do caixa</h2>
            <p className="muted mt-1 text-sm">Abra e feche o caixa com trilha mínima para conferência.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Unidade</span>
            <select
              className="input"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={isPending}
            >
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

          {!units.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
              Não há unidades cadastradas. Crie pelo menos 1 registro na tabela <b>units</b> para operar o caixa.
            </div>
          ) : null}

          {openRegister ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">Caixa aberto</div>
                  <div className="muted">Abertura: {new Date(openRegister.opened_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="text-right">
                  <div className="muted">Saldo inicial</div>
                  <div className="font-semibold">{moneyBRL(openRegister.opening_balance_cents)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100">
              <div className="font-semibold">Caixa fechado</div>
              <div className="muted">Abra o caixa para registrar pagamentos e conferência do dia.</div>
            </div>
          )}

          <label className="grid gap-1">
            <span className="text-sm font-medium">Observações</span>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </label>

          {!openRegister ? (
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Saldo inicial (R$ ou centavos)</span>
                <input className="input" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
              </label>
              <button
                className="btn"
                disabled={!unitId || isPending}
                onClick={() =>
                  startTransition(async () => {
                    setErr("");
                    try {
                      await openCashRegister(unitId, parseCents(openingBalance), notes || undefined);
                      await loadOpenRegister(unitId);
                    } catch (e: any) {
                      setErr(e?.message ?? "Falha ao abrir caixa");
                    }
                  })
                }
              >
                Abrir caixa
              </button>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid gap-1 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="muted">Entradas (pagamentos)</span>
                  <span className="font-medium">{moneyBRL(totals.sale_payment)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="muted">Suprimentos</span>
                  <span className="font-medium">{moneyBRL(totals.supply)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="muted">Sangrias</span>
                  <span className="font-medium">{moneyBRL(totals.withdraw)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="muted">Estornos</span>
                  <span className="font-medium">{moneyBRL(totals.refund)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900/40">
                  <span className="font-semibold">Saldo sugerido</span>
                  <span className="font-semibold">{moneyBRL(computedClosingPreview)}</span>
                </div>
              </div>

              <label className="grid gap-1">
                <span className="text-sm font-medium">Saldo de fechamento (R$ ou centavos)</span>
                <input className="input" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} />
              </label>
              <button
                className="btn"
                disabled={!openRegister?.id || isPending}
                onClick={() =>
                  startTransition(async () => {
                    setErr("");
                    try {
                      await closeCashRegister(openRegister!.id, parseCents(closingBalance), notes || undefined);
                      await loadOpenRegister(unitId);
                    } catch (e: any) {
                      setErr(e?.message ?? "Falha ao fechar caixa");
                    }
                  })
                }
              >
                Fechar caixa
              </button>
            </div>
          )}

          {err ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-100">
              {err}
            </div>
          ) : null}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold">Movimentações</h2>
        <p className="muted mt-1 text-sm">Últimos lançamentos do caixa (até 50 registros).</p>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-[120px_1fr_120px] gap-2 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
            <span>Tipo</span>
            <span>Detalhe</span>
            <span className="text-right">Valor</span>
          </div>
          <div className="max-h-[520px] overflow-auto">
            {openRegister ? (
              movements.length ? (
                movements.map((m) => (
                  <div
                    key={m.id}
                    className="grid grid-cols-[120px_1fr_120px] gap-2 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
                  >
                    <div className="font-medium">{m.type}</div>
                    <div>
                      <div className="muted text-xs">{new Date(m.created_at).toLocaleString("pt-BR")}</div>
                      <div className="text-sm">{m.notes ?? "—"}</div>
                    </div>
                    <div className="text-right font-semibold">{moneyBRL(m.amount_cents)}</div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm muted">Nenhuma movimentação registrada ainda.</div>
              )
            ) : (
              <div className="p-4 text-sm muted">Abra o caixa para começar a registrar movimentações.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
