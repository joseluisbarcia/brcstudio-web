# BRC Studio — Preparación comercial antes de cobrar

Fecha: 12/10/2026. Documento interno. No activa pagos ni constituye asesoramiento fiscal o jurídico.

## Catálogo aprobado (precios base sin IVA)

| Modalidad | Base | IVA 21 % | Total |
|---|---:|---:|---:|
| Compra de web | 490,00 € | 102,90 € | 592,90 € |
| Plan mensual: alta + primer mes | 188,00 € | 39,48 € | 227,48 € |
| Renovación mensual | 39,00 € | 8,19 € | 47,19 € |
| Compra posterior, meses 1–6 | 290,00 € | 60,90 € | 350,90 € |
| Compra posterior, meses 7–12 | 190,00 € | 39,90 € | 229,90 € |
| Compra posterior, desde mes 13 | 99,00 € | 20,79 € | 119,79 € |

Las fases 2/3 del catálogo Stripe son ofertas restringidas; no anunciar sin autorización. Los importes presuponen IVA español al 21 %; confirmar tratamiento fiscal aplicable antes de facturar fuera del supuesto ordinario.

## Condiciones comerciales conocidas y puntos por cerrar

- Compra: web 490 € + IVA; dominio .es a nombre del cliente, primer año; publicación y 30 días de soporte; renovación del dominio estimada 10–20 € + IVA, solo tras aprobación del cliente. Definir alcance exacto, cambios incluidos, contenidos y titularidad de otros activos.
- Plan mensual: alta 149 € + IVA y 39 €/mes + IVA; sin permanencia; alojamiento, dominio, mantenimiento y soporte durante vigencia; el cliente es titular del dominio; BRC gestiona la web hasta compra posterior. Definir SLA, límites de mantenimiento, facturación de renovación, aviso de cancelación, devolución/exportación de contenidos, impago y fecha de baja.
- Compra posterior: precios por antigüedad anteriores. Definir fecha de cómputo y qué se entrega (archivos, hosting, accesos, dominio) y si hay trabajo de migración.
- No prometer posiciones en Google, volumen de reservas ni leads garantizados. SEO local y servicios adicionales requieren alcance y precio independientes.
- Documentar aceptación explícita de condiciones y autorización para iniciar el trabajo antes del pago, cuando proceda.

## Revisión del sitio en GitHub (12/10)

- `dist/diseno-web-barberias-madrid/index.html` y `dist/diseno-web-reformas-madrid/index.html` presentan las demos y enlaces de contacto, sin contratación ni condiciones detalladas.
- `dist/aviso-legal/index.html` identifica al titular y contacto, pero no recoge NIF y dirección postal completa; verificar los datos legalmente exigibles antes de venta.
- `dist/privacidad/index.html` y `dist/cookies/index.html` contienen información básica; revisar para procesos de contratación, Stripe, conservación, encargados y eventuales herramientas nuevas.
- El Checkout live está bloqueado por `BRC_LIVE_CHECKOUT_ENABLED`; el panel privado separa registros de prueba y live.
- Stripe webhook tiene 10 eventos configurados; falta una entrega auténtica firmada con persistencia real verificada.
- Registro `brc-live-sales` no es sistema de facturación ni contabilidad; no deduce reembolsos, disputas o comisiones.

## Procedimiento propuesto antes de activar cobros

1. Confirmar identidad fiscal, régimen de facturación y alcance geográfico de ventas. Validar condiciones con profesional competente cuando proceda.
2. Aprobar contrato/propuesta con condiciones completas y política de cancelación y entregables.
3. Preparar flujo privado de pedido con identificación del cliente, modalidad, aceptación de condiciones y referencia interna; no publicar botones todavía.
4. Comprobar permisos de clave Stripe, factura y webhook en entorno seguro; reconciliación Stripe/Netlify.
5. Autorizar expresamente primera operación real controlada y revisar recibo/factura, firma, almacenamiento y panel.
6. Solo entonces considerar activar Checkout comercial y publicar accesos.

## Restricciones

No activar cobros, no crear transacciones reales, no modificar precios, no contratar servicios, no revelar secretos y no alterar el entorno de pruebas.
