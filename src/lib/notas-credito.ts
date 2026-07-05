import type { SupabaseClient } from "@supabase/supabase-js";

export interface ItemDevueltoStock {
  producto_id?: string | null;
  cant_devolver: number;
  precio_unitario: number;
}

/**
 * Restaura stock e inserta el movimiento de inventario por cada ítem físico
 * devuelto en una Nota de Crédito. Se hace desde el cliente porque el trigger
 * de BD fn_nc_restaurar_inventario corre en el INSERT de la nota, antes de que
 * sus detalle_notas existan (se insertan en una llamada aparte) — por lo que
 * nunca encuentra filas y nunca actúa.
 */
export async function restaurarStockPorDevolucion(
  supabase: SupabaseClient,
  items: ItemDevueltoStock[],
  numeroNota: string,
  descripcion: string
) {
  for (const it of items) {
    if (!it.producto_id || it.cant_devolver <= 0) continue;
    const { data: prod } = await supabase
      .from("productos")
      .select("stock_actual, empresa_id")
      .eq("id", it.producto_id)
      .single();
    if (!prod) continue;

    const stockAntes = Number(prod.stock_actual);
    const stockDespues = stockAntes + Number(it.cant_devolver);

    await supabase
      .from("productos")
      .update({ stock_actual: stockDespues, updated_at: new Date().toISOString() })
      .eq("id", it.producto_id);

    await supabase.from("movimientos_inventario").insert({
      empresa_id: prod.empresa_id,
      producto_id: it.producto_id,
      tipo: "entrada",
      cantidad: it.cant_devolver,
      stock_antes: stockAntes,
      stock_despues: stockDespues,
      costo_unitario: it.precio_unitario,
      referencia: numeroNota,
      notas: descripcion,
    });
  }
}

export interface AplicarNotaCreditoAFacturaParams {
  supabase: SupabaseClient;
  facturaId: string;
  /** true = la NC cubre el total de la factura → la factura queda anulada */
  esTotal: boolean;
  subtotalNC: number;
  ivaNC: number;
  numeroNota: string;
}

/**
 * Refleja en la factura de origen el efecto de una Nota de Crédito ya creada:
 * la anula (si la NC cubre el total) o descuenta sus totales (si es parcial).
 * Debe llamarse desde cualquier flujo que emita una NC ligada a una factura —
 * hoy es el único punto que dispara trg_anular_factura (reversa contable/caja).
 */
export async function aplicarNotaCreditoAFactura(
  params: AplicarNotaCreditoAFacturaParams
): Promise<{ error?: string }> {
  const { supabase, facturaId, esTotal, subtotalNC, ivaNC, numeroNota } = params;

  const { data: factura, error: facErr } = await supabase
    .from("facturas")
    .select("subtotal, iva_total, notas")
    .eq("id", facturaId)
    .single();
  if (facErr || !factura) return { error: facErr?.message ?? "Factura no encontrada" };

  const notaPrevia = factura.notas ? factura.notas + " | " : "";

  if (esTotal) {
    const { error } = await supabase
      .from("facturas")
      .update({ estado: "anulada", notas: notaPrevia + `Anulada con ${numeroNota}` })
      .eq("id", facturaId);
    if (error) return { error: error.message };
  } else {
    const nuevoSubtotal = Number(factura.subtotal) - subtotalNC;
    const nuevoIva = Number(factura.iva_total) - ivaNC;
    const { error } = await supabase
      .from("facturas")
      .update({
        subtotal: nuevoSubtotal,
        iva_total: nuevoIva,
        total: nuevoSubtotal + nuevoIva,
        notas: notaPrevia + `NC parcial ${numeroNota}`,
      })
      .eq("id", facturaId);
    if (error) return { error: error.message };
  }
  return {};
}

/** Marca la nota como aplicada una vez que su efecto ya quedó reflejado en el documento origen. */
export async function marcarNotaComoAplicada(supabase: SupabaseClient, notaId: string) {
  await supabase.from("notas_credito_debito").update({ estado: "aplicada" }).eq("id", notaId);
}
