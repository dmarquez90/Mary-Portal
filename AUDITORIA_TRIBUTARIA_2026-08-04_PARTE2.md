# Auditoría fiscal — Parte 2: implementación y hallazgos de los agentes
**Fecha:** 4 de agosto de 2026 (continuación de `AUDITORIA_TRIBUTARIA_2026-08-04.md`)

Lancé dos agentes en paralelo: uno como asesor legal-fiscal (investigación de leyes nicaragüenses vigentes) y otro de auditoría profunda del módulo VET. Sus informes completos quedaron en la conversación; aquí está el resumen de qué se corrigió ya y qué necesita tu decisión.

---

## Ya corregido hoy (código + base de datos)

1. **INSS obsoleto en el validador VET** — corregido a 7% laboral / 21.5-22.5% patronal (configurable), y la validación ahora sí está conectada a un endpoint (antes existía pero nadie la llamaba).
2. **Cuenta 6.4.01** renombrada de "Anticipo IR (1% PMD)" a "IR del Ejercicio" en las dos empresas reales. El seed de empresas nuevas ya estaba correcto.
3. **Código de retención 21** (pagos con tarjeta, 1.5%) agregado al catálogo — faltaba, estaba en el PDF oficial que ya tenías en el repo.
4. **Nombre real de "VET"** corregido: decía "Validación, Evaluación y Trazabilidad" (inventado), ahora dice "Ventanilla Electrónica Tributaria".
5. **Mensaje de la UI** cuando un régimen (Simplificado/Especial) no tiene reportes VET: antes decía genérico "no hay reportes", ahora explica por qué (Cuota Fija no liquida IVA/IR mensual, Art. 259 LCT).
6. **Bug serio en el generador de Planilla de Ingresos**: escribía el nombre de la empresa como si fuera una "sucursal" en filas que no pertenecen a ese archivo oficial — verificado contra el archivo real descargado de dgi.gob.ni por el agente. Se dejó de escribir esas filas. El archivo generado ahora respeta las 25 filas oficiales (columna B) sin datos inventados.
7. **Seguridad**: los 3 endpoints VET (`reportes`, `planilla-ingresos`, `validacion`) solo verificaban sesión, no el permiso `vet_ver`/`vet_editar` — un usuario con rol sin acceso a VET podía llamar la API directamente. Agregado el chequeo explícito.

**Nota honesta:** no pude correr `tsc --noEmit` completo hasta el final en este entorno (el sandbox no sostiene procesos en segundo plano entre llamadas) — los cambios son sintácticamente simples y los revisé a mano, pero te recomiendo correr `npm run build` antes de hacer deploy para confirmar que compila limpio.

---

## Necesita TU decisión — no lo corregí porque las fuentes no coinciden o falta información

### A. Retenciones definitivas: contradicción real entre fuentes (incluida la propia DGI)
El agente encontró que la FAQ oficial de la DGI se contradice a sí misma sobre si dividendos y regalías se retienen al 10% o al 15%, y premios de lotería igual (10% en un lugar, 15% en fuentes secundarias). **No voy a cargar un número al sistema cuando ni la fuente oficial es consistente consigo misma.** Necesito que confirmes esto con un contador colegiado antes de que yo toque `retenciones_definitivas`. Es más urgente que el resto porque esa tabla ya se usa en producción.

### B. Catálogo de ISC: bloqueado por falta de fuente confiable
Las tasas ad valorem exactas de los Anexos I/II/III de la Ley 822 no están en ninguna fuente web indexable que el agente pudiera verificar, y hubo una reforma reciente (Ley 1279, abril 2026) que cambió la base imponible. **No voy a inventar un catálogo con cifras no verificadas** — es peor que dejarlo manual como está hoy. Si me consigues el PDF/texto del Anexo I y II vigente (un contador local probablemente lo tiene), lo convierto a catálogo TypeScript en minutos.

### C. Oportunidad grande para tu objetivo de negocio: régimen Cuota Fija (pulperías)
El agente confirmó algo importante: el régimen Simplificado (Cuota Fija) **no presenta declaraciones de IVA/IR** — paga una cuota mensual que le asigna la DGI, y puede llevar un "Registro Sencillo de Ingresos y Egresos" en vez de contabilidad formal. Esto significa que para cubrir pulperías y negocios pequeños (tu meta explícita), **no necesitas construir el motor de cálculo de IVA/IR que ya tienes para régimen General** — necesitas algo más simple: registro de la cuota asignada + un libro de ingresos/egresos. Es una funcionalidad distinta, probablemente más rápida de construir, con alto impacto en el segmento que mencionaste. ¿La agrego al roadmap como prioridad?

### D. Reportes duplicados sin auditoría (`/dashboard/reportes` vs `/dashboard/vet`)
Existen DOS pantallas que generan el mismo tipo de reporte: una con validación y rastro de auditoría (`/dashboard/vet`), y otra sin ninguna de las dos (`/dashboard/reportes`, que además genera un "Crédito Fiscal ISC" que ni siquiera existe en el catálogo de reportes). Esto es una decisión de producto, no un bug que yo deba resolver solo: ¿eliminamos `/dashboard/reportes`, lo fusionamos con `/dashboard/vet`, o lo dejamos como "vista rápida" sin pretensión de cumplimiento formal?

### E. Generador completo de "Sucursales con Facturas Utilizadas"
Ya dejé de generar el archivo incorrecto (punto 6 arriba), pero construir el generador REAL de ese archivo (que la VET sí exige antes de la Planilla de Ingresos) requiere que el ERP modele el concepto de "sucursal" — hoy no existe. Es una funcionalidad nueva, no un fix de una función existente. ¿La programamos ahora o la dejamos en el roadmap?

### F. Nuevas obligaciones fiscales identificadas, no implementadas (para roadmap, no para hoy)
- **IBI municipal** (Decreto 3-95, 1% sobre 80% del valor catastral, anual) — real, pero desacoplado del ciclo DGI/VET, y muchos negocios pequeños no lo pagan directamente (arrendatarios).
- **Catálogo de exenciones de IVA** (Art. 127 LCT, Acuerdo Ministerial 09-2016) — existe una fuente oficial concreta pero el agente no pudo extraer el listado completo; hay que conseguir ese documento.
- **Impuesto de Timbres Fiscales** — real pero de aplicación esporádica/documental, prioridad baja.

---

## Qué decido yo solo la próxima vez vs. qué te pregunto

Para que esto no se vuelva una negociación por cada línea: voy a seguir corrigiendo directamente todo lo que sea (a) verificable contra una fuente sólida y sin contradicciones, y (b) no toque montos fiscales que ya estás calculando en producción. Todo lo que tenga fuentes contradictorias (como el punto A) o requiera datos que no tengo (como el punto B), te lo voy a seguir trayendo a ti en vez de adivinar — eso no es lentitud, es la única forma honesta de construir algo que de verdad puedas presentarle a la DGI.

## Qué sigue

Dime qué priorizamos de A-F. Mi recomendación, si me preguntas: primero (A) porque ya está en producción, luego (C) porque es tu objetivo de negocio explícito (pulperías), y el resto según cómo vayas necesitando cada pieza.
