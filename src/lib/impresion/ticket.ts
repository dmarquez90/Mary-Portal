// ============================================================
// SARA — Impresión de tickets de venta (58mm / 80mm)
// Compartido entre el detalle de factura y el Punto de Venta.
// Usa window.print sobre una ventana emergente, sin dependencias.
// ============================================================

export interface TicketEmpresa {
  nombre: string
  ruc: string
  direccion?: string
  telefono?: string
}

export interface TicketItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva: number
  total: number
}

export interface TicketDatos {
  numeroFactura: string
  fecha: string          // ya formateada para mostrar
  tipoPago: string
  cliente: string
  items: TicketItem[]
  subtotal: number
  ivaTotal: number
  total: number
  montoRecibido?: number | null
  cambio?: number | null
}

const fmtC = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export function imprimirTicket(
  empresa: TicketEmpresa,
  datos: TicketDatos,
  ancho: 58 | 80 = 80
) {
  const anchoMM = ancho === 58 ? '56mm' : '78mm'
  const cw = ancho === 58 ? 28 : 38
  const sep = (c = '-') =>
    `<div style="text-align:center;font-size:11px;margin:3px 0">${c.repeat(cw)}</div>`

  const items = datos.items.map(d => {
    const desc = d.descripcion.length > cw ? d.descripcion.slice(0, cw - 2) + '..' : d.descripcion
    return `<div style="font-size:12px;font-weight:bold;margin-top:3px">${desc}</div>
    <div style="display:flex;justify-content:space-between;font-size:12px;padding-left:8px">
      <span>${d.cantidad} x ${fmtC(d.precio_unitario)}</span><span><b>${fmtC(d.total)}</b></span></div>
    ${d.iva > 0 ? `<div style="font-size:10px;color:#444;padding-left:8px">IVA: ${fmtC(d.iva)}</div>` : ''}`
  }).join(sep('·'))

  const pago = datos.montoRecibido != null ? `
    <div style="display:flex;justify-content:space-between"><span>Recibido:</span><span>${fmtC(datos.montoRecibido)}</span></div>
    ${datos.cambio != null && datos.cambio > 0
      ? `<div style="display:flex;justify-content:space-between;font-weight:bold"><span>Cambio:</span><span>${fmtC(datos.cambio)}</span></div>`
      : ''}
    ${sep()}` : ''

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Ticket ${datos.numeroFactura}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:${anchoMM};margin:0 auto;padding:4px 3px}
  @page{size:${ancho}mm auto;margin:2mm 3mm}</style></head><body>
  <div style="text-align:center;font-size:16px;font-weight:bold">${empresa.nombre}</div>
  <div style="text-align:center;font-size:12px">RUC: ${empresa.ruc}</div>
  ${empresa.direccion ? `<div style="text-align:center;font-size:10px">${empresa.direccion}</div>` : ''}
  ${empresa.telefono ? `<div style="text-align:center;font-size:10px">Tel: ${empresa.telefono}</div>` : ''}
  ${sep('=')}
  <div style="text-align:center;font-size:16px;font-weight:bold">${datos.numeroFactura}</div>
  <div style="text-align:center">${datos.fecha} · ${datos.tipoPago}</div>
  ${sep('=')}
  <div style="font-size:10px;font-weight:bold">CLIENTE</div>
  <div style="font-weight:bold">${datos.cliente}</div>
  ${sep()}
  <div style="display:flex;justify-content:space-between;font-weight:bold"><span>DESCRIPCION</span><span>TOTAL</span></div>
  ${sep()}${items}${sep('=')}
  <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>${fmtC(datos.subtotal)}</span></div>
  <div style="display:flex;justify-content:space-between"><span>IVA (15%):</span><span>${fmtC(datos.ivaTotal)}</span></div>
  ${sep('=')}
  <div style="font-size:18px;font-weight:bold;text-align:center">TOTAL: ${fmtC(datos.total)}</div>
  ${sep('=')}
  ${pago}
  <div style="text-align:center;font-size:10px">¡Gracias por su compra!</div>
  <div style="text-align:center;font-size:10px">Generado por SARA · Nicaragua</div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=420,height=700')
  if (w) { w.document.write(html); w.document.close() }
}
