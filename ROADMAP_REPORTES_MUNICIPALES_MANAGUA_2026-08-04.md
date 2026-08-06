# Hoja de ruta: Reportes Municipales (Alcaldía de Managua)

Fecha: 2026-08-04
Alcance de esta fase: solo Managua. Otros municipios quedan fuera hasta validar tasas/plazos caso por caso.

## Estado actual del código (verificado, no supuesto)

- Ya existe el módulo IMI mensual: tabla `declaraciones_imi`, API `/api/tributacion/imi`, UI en `/dashboard/tributacion/imi`.
- El cálculo automático de ingresos toma `facturas.total` **incluyendo IVA**. Esto es un error de base gravable, no un tema de diseño — hay que corregirlo antes de construir nada encima (ver Fase 1).
- Los campos `es_matricula` y `monto_matricula` existen en la tabla pero no tienen lógica ni pantalla. La matrícula anual no está implementada, solo reservado el espacio.
- La tasa (1%) y el día de vencimiento (15) están hardcodeados en el API, no vienen de una configuración por municipio.
- No existe ningún campo `municipio` en `empresas_juridicas` ni `empresas_persona_natural`.
- No hay generación de reporte en el formato oficial de la Alcaldía (Excel/PDF "Base gravable", renglones 1-8).

## Fase 0 — Decisiones que necesito que confirmes antes de tocar código

- [ ] ¿Corrijo ya el bug del IVA en el cálculo del IMI (Fase 1), o prefieres revisarlo primero?
- [ ] ¿El usuario podrá ajustar manualmente `ingresos_brutos_mes` cuando la base gravable real difiera de lo facturado (ventas exentas, ajustes, etc.)?
- [ ] ¿Conseguimos el formulario oficial vigente de "Declaración de Ingresos" de Managua (sección B, renglones 1-8) para replicar el formato exacto? Yo no tengo el archivo, solo referencias de que existe.

## Fase 1 — Corregir la base gravable del IMI (prioridad, es un bug real) ✅ 2026-08-04

- [x] Cambiar el cálculo para usar `subtotal - descuento_total` en vez de `total` (que incluye IVA). Corregido en `src/app/api/tributacion/imi/route.ts`.
- [ ] Confirmar si la base es lo facturado en el período (devengado) o lo efectivamente cobrado — normalmente es lo facturado. Sigue pendiente de confirmar contigo.
- [x] Recalcular declaraciones ya generadas: no aplicó. Se verificó en la base (`sisco-nicaragua`) que solo existe 1 declaración y tiene `ingresos_brutos_mes = 0`, así que no hay datos mal calculados que corregir.

## Fase 2 — Configuración municipal (dejar la puerta abierta a multi-municipio sin bloquear Managua)

- [ ] Tabla `municipios`: nombre, tasa_imi, tasa_matricula, tasa_certificado, día de vencimiento, período de matrícula.
- [ ] Campo `municipio_id` en `empresas_juridicas` y `empresas_persona_natural`.
- [ ] Sembrar el registro de Managua: IMI 1%, matrícula 2% + 1% certificado, vence día 15, matrícula del 1 dic al 31 ene.
- [ ] Quitar el `tasa = 0.01` fijo del API; leerlo de la configuración del municipio de la empresa.

## Fase 3 — Matrícula anual (no existe hoy)

- [ ] Lógica: promedio de ingresos brutos de los últimos 3 meses del año anterior × 2%, más 1% de certificado.
- [ ] Regla para negocios con menos de 3 meses operando (usar los meses disponibles).
- [ ] Pantalla propia para generar y ver la matrícula, separada de la vista mensual del IMI.
- [ ] Aviso del período de renovación (diciembre–enero).

## Fase 4 — Formato de declaración presentable

- [ ] Definir salida: PDF, Excel, o ambos.
- [ ] Reproducir el layout exacto del formulario municipal (no un reporte genérico).
- [ ] Validar contra una declaración real ya presentada en managua.tustributos.com antes de darlo por bueno.

## Fase 5 — Pruebas y cierre

- [ ] Probar con datos reales de al menos un mes de un cliente piloto.
- [ ] Confirmar que el monto calculado coincide con lo que exige el portal de la alcaldía.
- [ ] Documentar en el manual de usuario, igual que el resto de módulos SICONIC.

## Fuera de alcance por ahora

- Otros municipios bajo el Plan de Arbitrios general (Decreto 455) — tasas y plazos varían y hay que confirmarlos uno por uno.
- Integración directa con el portal tustributos.com — no confirmé que exista una API pública; por ahora el objetivo es generar el reporte para descarga/presentación manual.
