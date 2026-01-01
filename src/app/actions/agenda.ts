"use server";

import { redirect } from "next/navigation";
import { createSaleFromAppointment } from "@/app/actions/sales";

/**
 * Check-in: cria (ou reutiliza) a comanda vinculada ao agendamento e redireciona para o PDV.
 */
export async function checkInAndOpenPdv(appointmentId: string) {
  const saleId = await createSaleFromAppointment(appointmentId);
  redirect(`/app/pdv?sale=${saleId}`);
}
