# Auditoría final Stripe — BRC Studio

Fecha: 12 de octubre de 2026 (Europe/Madrid). **No autoriza la activación comercial.**

## Alcance y límites

Revisión del repositorio `joseluisbarcia/brcstudio-web`, despliegue Netlify `brcstudio-web`, cuenta live `acct_1UPRtYDwLerTaple` y sandbox independiente `acct_1UPRtoD95NECz80F`. No se han realizado transacciones reales, creado enlaces live, cambiado precios, contratado servicios ni modificado claves o variables. Los datos y funciones de prueba existentes se conservan.

## Evidencias externas

- Despliegue inicial `6acc2a729f486c58327dfce9`, ready, commit `af9d8ae04f1b5638678b1f5a4395b856ed4c2ae2`; 6 funciones. Escaneo de secretos del despliegue sin coincidencias.
- Stripe live: 8 precios activos en EUR, todos con impuesto exclusivo; ninguna sesión Checkout, ninguna suscripción activa y ningún Payment Link en las listas consultadas (sin páginas pendientes).
- Impuesto `txr_1UPX5ZDwLerTaplePClmgRMy`: evento Stripe `evt_1UPX5ZDwLerTapleH2n1Eswr` confirma creación live, país ES, 21 %, exclusivo, activo. No hay eventos tax_rate.updated posteriores. Esta comprobación usa el historial reciente de eventos: el conector no ofrece la lectura directa de TaxRate.
- Webhook live `we_1UPWqyDwLerTapleMqYF8SPh`, habilitado en `https://brcstudio.es/api/stripe-live-webhook`, versión 2026-09-30.endive. Al inicio escucha solamente checkout.session.completed y checkout.session.async_payment_succeeded.
- Prueba HTTP real del webhook sin firma: 400 Invalid signature; no se envió ningún evento válido ni se escribió una venta ficticia live.
- Checkout sandbox desde la web: compra y mensual devuelven 200, livemode=false. El endpoint de estado confirma 59290 y 22748 céntimos respectivamente, sesiones abiertas y no pagadas.
- Renovación sandbox: previsualización de la suscripción existente `sub_1UPUSYD95NECz80FBl9sYWYF`; subtotal 3900, IVA 819, total 4719 céntimos; una sola línea mensual, sin alta. No crea una factura cobrable ni modifica la suscripción. No demuestra un cobro de renovación ejecutado.

## Catálogo verificado (sin cambios)

| Producto | Precio Stripe | Base | IVA 21 % | Total |
| --- | --- | ---: | ---: | ---: |
| Compra fase 1 | price_1UPVC0DwLerTapleRTy7YYO6 | 490,00 € | 102,90 € | 592,90 € |
| Alta | price_1UPVE7DwLerTaplejCffcCrc | 149,00 € | 31,29 € | 180,29 € |
| Mensualidad | price_1UPVEWDwLerTapleCN8WYU7L | 39,00 € | 8,19 € | 47,19 € |
| Compra posterior meses 1–6 | price_1UPVF5DwLerTapleeUYSaOqj | 290,00 € | 60,90 € | 350,90 € |
| Compra posterior meses 7–12 | price_1UPVFKDwLerTapleJmXfoHJG | 190,00 € | 39,90 € | 229,90 € |
| Compra posterior desde mes 13 | price_1UPVFXDwLerTapleCFmqJgoL | 99,00 € | 20,79 € | 119,79 € |
| Compra fase 2 | price_1UPVH2DwLerTapleEBzaFMUB | 290,00 € | 60,90 € | 350,90 € |
| Compra fase 3 | price_1UPVHFDwLerTaplezLZN4TRa | 249,00 € | 52,29 € | 301,29 € |

Alta + primer mes: 188,00 € + 39,48 € = **227,48 €**. Renovación: **47,19 €/mes**. Solo mensualidad tiene recurring.interval=month, interval_count=1. Los otros precios son one_time. Las fases 2/3 mantienen sus restricciones de autorización y no están expuestas por Checkout. Los metadatos de productos copiados conservan environment=test pese a livemode=true: etiqueta heredada, no determina el entorno y no se ha alterado.

## Correcciones técnicas

- Checkout mantiene el bloqueo estricto: únicamente el literal true habilita POST. GET comunica disponibilidad y coincidencia de la tasa configurada, sin llamar a Stripe ni revelar secretos; permite verificar el bloqueo sin crear sesiones.
- Tasa live restringida al identificador aprobado; tax_rates en todas las líneas y default_tax_rates explícito en suscripción. Los impuestos de línea prevalecen sobre los predeterminados; no se suman dos veces.
- POST exige Idempotency-Key UUID v4. El futuro cliente deberá reutilizar el mismo UUID para reintentos del mismo pedido y usar uno nuevo para otro pedido. Stripe rechaza reutilizarlo con parámetros distintos. Esta deduplicación no sustituye un registro de pedidos ni evita UUID distintos.
- Respuestas JSON inválidas del proveedor devuelven 502 controlado.
- Webhook valida firma HMAC sobre cuerpo original, ventana ±300 segundos, varias firmas para rotación, entorno live, esquema básico, estado pagado, plan BRC, modo, moneda e importes.
- Escritura atómica onlyIfNew y comprobación de modified. Sin lectura previa susceptible de carreras; almacenamiento fallido devuelve 503 para reintento.
- Añadido registro de renovaciones por invoice ID; la factura inicial es un evento informativo y no una segunda venta.
- Añadidos eventos de impago, autenticación requerida y ciclo de suscripción. Las instantáneas son inmutables: eventos tardíos no sobrescriben los posteriores. No se suspende automáticamente ningún servicio.
- Identificación de suscripción mediante referencias Stripe y precio recurrente del catálogo; no depende solo de metadata. Facturas paginadas sin la línea identificativa devuelven 503 y exigen investigación, sin descartarlas silenciosamente.
- Ningún dato de tarjeta, dirección o email se persiste. brc-live-sales es un diario de comprobantes; no es contabilidad ni base de datos transaccional. El estado vigente debe reconciliarse con Stripe antes de tomar decisiones.

## Pruebas locales reproducibles

`npm test`: 33 pruebas, todas superadas. Stripe y Blobs simulados en memoria, red bloqueada en el simulador. Cubren bloqueo, catálogo e IVA, origen/host, idempotencia de solicitud, firma ausente/falsa/caducada/futura, rotación, JSON inválido, aislamiento test/live, pagos pendientes, eventos ajenos, duplicados concurrentes, fallo y reintento de almacenamiento, renovación, factura inicial, impago y eventos desordenados.

`npm run build` ejecuta esas pruebas y valida recursos estáticos. Las funciones stripe-test-*, el panel de pruebas y dist permanecen byte a byte sin cambios respecto al commit inicial.

## Pendientes antes de autorizar la activación

1. Confirmar despliegue de este commit y GET de disponibilidad: enabled=false, tax_rate_configured=true.
2. Ampliar el webhook live a invoice.paid, invoice.payment_failed, invoice.payment_action_required y customer.subscription.created/updated/deleted/paused/resumed, conservando los dos eventos Checkout. El conector ha pedido reautenticación dos veces y no ha ejecutado la escritura; no se considera aplicado.
3. Entrega auténtica firmada por Stripe al endpoint live y persistencia real de Blobs no demostradas. La validación positiva, concurrencia y reintentos se han probado localmente con secreto efímero; el rechazo sin firma sí se comprobó en producción. No enviar ventas ficticias a brc-live-sales.
4. El panel /admin/ventas sigue mostrando exclusivamente pruebas. Para live, falta una vista privada de comprobantes/renovaciones y procedimiento de conciliación, impagos, cancelaciones y reembolsos. No confundir el diario nuevo con una gestión operativa completa.
5. Revisar acceso del secreto live (Checkout y lecturas necesarias), identidad/facturación de la cuenta y alcance fiscal de ventas admitidas. Tasa fija 21 % no resuelve por sí sola territorios o clientes con otro tratamiento. No se ha habilitado Stripe Tax automático.
6. Solo después de autorización explícita: primer pago real, autenticación bancaria si procede, factura/justificante, recepción del evento real y conciliación. Renovación real, reembolso y liquidación bancaria no pueden certificarse con estas simulaciones.

## Bloqueo de revisión automática

El POST de comprobación al Checkout live fue rechazado por revisión automática: podría crear una sesión de pago real si estuviese habilitado. No se reintentó ni se eludió. La verificación alternativa es GET de solo lectura y prueba local de la misma condición. Ninguna aprobación comercial se solicitó ni se presupone.
