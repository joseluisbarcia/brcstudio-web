# Auditoría final Stripe — BRC Studio

Fecha: 12 de octubre de 2026 (Europe/Madrid). **No autoriza la activación comercial.**

## Resultado y estado de entrega

**Correcciones desplegadas; activación comercial NO aprobada.** Commit de código `8afe86170a0b9f639b57465b5dc8d1eb21063371`, despliegue Netlify `6acca19cd0d6a32b48a53e15`, ready, publicado 12/10/2026 09:00:28 UTC. El despliegue automático sí se completó tras la espera inicial. Escaneo: 56 archivos, ninguna coincidencia de secretos. Las tres funciones de prueba y el panel conservan exactamente los mismos digest de despliegue que antes.

**Bloqueo efectivo VERIFICADO en producción:** GET /api/stripe-live-checkout devuelve HTTP 200 con `enabled=false` y `tax_rate_configured=true`. Esto comprueba que la condición BRC_LIVE_CHECKOUT_ENABLED !== "true" bloquea POST y que la tasa configurada coincide con el ID aprobado. No se ha cambiado ninguna variable. No se lee ni afirma el texto bruto del valor (false/ausente/otro valor desactivado); se certifica su efecto en el runtime desplegado.

Después del despliegue: webhook sin firma vuelve a dar 400; ambas modalidades de Checkout sandbox vuelven a responder 200 con livemode=false y totales 59290/22748. No se pagaron esas sesiones.

**Bloqueo restante de acceso:** la ampliación de eventos del webhook no se aplicó. El conector Stripe devolvió dos veces una petición de reautenticación y la lectura posterior confirma que siguen solo los dos eventos Checkout. Las reglas del navegador exigen permiso para usarlo cuando el conector falla reiteradamente; no se ha abierto ni supuesto una sesión iniciada. El código de renovaciones está desplegado, pero Stripe aún no envía esos eventos a este endpoint.

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

1. **Resuelto:** despliegue ready y GET verificado con enabled=false, tax_rate_configured=true.
2. Ampliar el webhook live a invoice.paid, invoice.payment_failed, invoice.payment_action_required y customer.subscription.created/updated/deleted/paused/resumed, conservando los dos eventos Checkout. El conector ha pedido reautenticación dos veces y no ha ejecutado la escritura; no se considera aplicado.
3. Entrega auténtica firmada por Stripe al endpoint live y persistencia real de Blobs no demostradas. La validación positiva, concurrencia y reintentos se han probado localmente con secreto efímero; el rechazo sin firma sí se comprobó en producción. No enviar ventas ficticias a brc-live-sales.
4. El panel /admin/ventas sigue mostrando exclusivamente pruebas. Para live, falta una vista privada de comprobantes/renovaciones y procedimiento de conciliación, impagos, cancelaciones y reembolsos. No confundir el diario nuevo con una gestión operativa completa.
5. Revisar acceso del secreto live (Checkout y lecturas necesarias), identidad/facturación de la cuenta y alcance fiscal de ventas admitidas. Tasa fija 21 % no resuelve por sí sola territorios o clientes con otro tratamiento. No se ha habilitado Stripe Tax automático.
6. Solo después de autorización explícita: primer pago real, autenticación bancaria si procede, factura/justificante, recepción del evento real y conciliación. Renovación real, reembolso y liquidación bancaria no pueden certificarse con estas simulaciones.

## Bloqueo de revisión automática

El POST de comprobación al Checkout live fue rechazado por revisión automática: podría crear una sesión de pago real si estuviese habilitado. No se reintentó ni se eludió. La verificación alternativa es GET de solo lectura y prueba local de la misma condición. Ninguna aprobación comercial se solicitó ni se presupone.


## Revisión de cierre ampliada — ejecución posterior del 12/10/2026

**Resultado: NO APTO PARA ACTIVACIÓN COMERCIAL.** Esta sección prevalece sobre cualquier interpretación de preparación completa en el informe anterior. No se han activado pagos ni realizado transacciones reales.

### Evidencia actual

- Base revisada: `938979b` en `main`; 33 pruebas previas superadas antes de modificar.
- Producción devolvió `enabled:false` y `tax_rate_configured:true` antes del cambio. No se obtuvo el valor bruto de la variable Netlify: se verificó su evaluación en el endpoint desplegado.
- Stripe live: ocho precios EUR activos, exclusivos de IVA, coincidentes con los importes aprobados. Solo 39 EUR es recurrente mensual; alta 149 EUR es única. Sin sesiones Checkout, suscripciones ni enlaces de pago en los listados consultados (paginación agotada).
- El webhook `we_1UPWqyDwLerTapleMqYF8SPh` está habilitado en la URL correcta, API `2026-09-30.endive`, con los diez eventos documentados.
- Portal live: ninguna configuración. Dos intentos de creación devolvieron solicitud de autenticación sin efectuar el cambio; lectura posterior sigue vacía. El navegador alternativo muestra login, sin sesión autenticada reutilizable.
- Fuentes comerciales leídas: brief actualizado el 12/10, PDF compra, PDF mensual y hoja maestra Madrid. No se han alterado sus condiciones. El brief aprueba dos solicitudes manuales mensuales; los PDF siguen siendo informativos.

### Correcciones ejecutadas

1. **Cierre de seguridad adicional de Checkout:** antes, activar una variable bastaba para exponer un Checkout sin pedido autorizado. Ahora la ruta HTTP siempre devuelve 503; su GET informa `enabled:false, release_ready:false`. Cambiar una variable no evita este bloqueo. El transporte Stripe anterior se conserva como función interna para pruebas aisladas, sin ruta HTTP propia. Para abrir ventas hace falta implementar aceptación/autorización y revisar este bloqueo en código, además de autorización del propietario.
2. **Bajas privadas funcionales:** `/admin/ventas/bajas`, enlazado desde el panel. Requiere cookie firmada vigente, host y Origin exactos, contraseña de Dirección nuevamente, referencia trazable de identidad verificada por canal conocido, coincidencia del correo con el titular Stripe, modo live y precio mensual BRC. Registra intención antes de enviar `cancel_at_period_end=true` con `proration_behavior=none`; solo muestra éxito si Stripe confirma. Conserva resultado inmutable y clave idempotente. No basta rellenar un formulario para declarar la baja realizada. La verificación de identidad es manual por Dirección, no autenticación autónoma del cliente. No compartir el acceso maestro con comerciales.
3. **Aislamiento de borradores:** se rechaza su acceso desde hosts de preview para evitar que una previsualización opere sobre el almacén compartido de producción.
4. **Pruebas:** 47 tests y validación de build superados. Las 13 nuevas pruebas de bajas cubren autenticación, CSRF, reautenticación, evidencia, titular/precio/modo incorrectos, petición efectiva, duplicados y errores de almacenamiento o permisos Stripe. Se usan mocks; ninguna prueba cancela una suscripción real. Una prueba adicional demuestra que activar la variable no abre Checkout.

### Límites de la comprobación

- Importes aprobados: compra 490 + 102,90 = 592,90 EUR; alta + primer mes 188 + 39,48 = 227,48 EUR; renovación 39 + 8,19 = 47,19 EUR. Catálogo y construcción de parámetros comprobados. La comprobación sandbox de renovación del informe anterior sigue siendo evidencia anterior, no una nueva renovación ejecutada.
- Tasa live: configuración del ID comprobada; evidencia anterior del evento de creación confirma ES 21 %, exclusiva. El conector no expone una lectura directa de TaxRate en las operaciones encontradas. No se llamó a Stripe Tax ni se contrató servicio alguno.
- Seguridad de firma, duplicados concurrentes, reintentos y orden de eventos comprobada en simulación aislada. La entrega positiva con firma de producción y persistencia real sigue sin probarse; no se han creado ventas ficticias.
- El transporte de baja está implementado y probado localmente. Sus permisos efectivos de clave en producción y el recorrido completo en sandbox NO están verificados: el conector de escritura no completa la autenticación. No se debe interpretar la publicación de la pantalla como prueba de una baja real.

### Dependencias y trabajo bloqueante restante (no requiere cobrar para resolverse)

- **Pedidos y aceptación:** el registro actual sigue siendo de borradores; no contiene aceptación del cliente, identidad verificada, propuesta final ni autorización de cobro. No se simula aceptación mediante una casilla del administrador. Falta un canal de autenticación del cliente y persistencia transaccional para vincular oferta inmutable, aceptación, sesión y resultado.
- **Base transaccional:** solo se localizaron Supabase PsyMorph y ONYRA, excluidos de cambios por el brief. No se provisionó Netlify Database ni otro servicio sin poder confirmar ausencia de costes. Arquitectura requerida: Postgres aislado autorizado, pedidos/versiones/aceptaciones con claves únicas, transacciones para reservar una única tentativa de Checkout y patrón outbox con idempotencia Stripe. Blobs permanece como diario inmutable, no sustituto de transacciones, saldos o contabilidad. Falta disponer de ese recurso y credenciales de servicio seguras; no están implementadas las migraciones ni el flujo completo.
- **Identidad fiscal y condiciones:** faltan NIF y domicilio fiscal completo del prestador y condiciones finales por pedido. No se han inventado. Debe revisarse el tratamiento fiscal según cliente/destino; el transporte existente usa únicamente el caso ES 21 % y sigue inaccesible. No está validado para exenciones, inversión del sujeto pasivo u otros territorios.
- **Portal:** configuración privada no creada por bloqueo de autenticación. La alternativa de bajas manualmente verificadas está implementada; no habilita facturas o actualización de tarjetas para clientes.
- **Conciliación completa:** los diez eventos actuales no incluyen reembolsos ni disputas; el panel muestra importes brutos, no netos. Falta implementar y suscribir estos eventos y relacionar todos los eventos con pedido/cliente/comercial una vez exista el flujo de pedidos. Las facturas iniciales no duplican las ventas de Checkout en las pruebas existentes.

### Verificación que requiere autorización de operación real

Una vez resueltas las dependencias anteriores: primera operación real controlada para verificar cargo efectivo, factura fiscal final, entrega firmada live, persistencia, panel y conciliación. No se ha realizado ni se autoriza en este trabajo. Las renovaciones y cancelaciones deben verificarse primero en sandbox con datos nuevos desechables, sin modificar las suscripciones de prueba existentes.


### Publicación y comprobaciones HTTP de esta revisión

- Código publicado: `62ae5f89c37a1304af0037c76c95ffc78f75dcd0`.
- Netlify deploy: `6accbe9bfb3718de5d82e2f7`, `ready`, commit coincidente.
- GET producción `/api/stripe-live-checkout`: 200, `enabled:false`, `tax_rate_configured:true`, `release_ready:false`.
- GET sin sesión `/admin/ventas/bajas` y `/admin/ventas/pedidos`: 401.
- POST sin firma `/api/stripe-live-webhook`: 400 `Invalid signature`, sin registro de venta.
- GET `/stripe-test.html`: 200. Funciones y páginas de pruebas idénticas a la base `938979b` (diff vacío).
- Inventario actual del conector Stripe: solo cuenta live `acct_1UPRtYDwLerTaple`. La cuenta sandbox conocida no está accesible; su lectura devuelve `No account found`. Por tanto, no se repitió Checkout/renovación/baja de extremo a extremo en sandbox en esta revisión. Se necesita restablecer acceso al sandbox para completar esa comprobación; no se ha alterado su configuración ni sus datos.
- No se han creado cargos, sesiones live, enlaces públicos, suscripciones ni ventas ficticias. No se ha contratado ningún servicio ni cambiado precios o condiciones comerciales.



## Continuación ejecutada
Consultar [cierre de implementación](STRIPE_CIERRE_IMPLEMENTACION_2026-10-12.md): sustituye el bloqueo arquitectónico de pedidos por diario inmutable, incorpora aceptación por correo, Checkout vinculado exclusivamente sandbox, cancelación sandbox y ajustes. Incluye una compra sandbox real confirmada; no declara completadas las dependencias externas restantes.
