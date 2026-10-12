# Cierre de implementación Stripe — 12 octubre 2026

## Dictamen: NO CERRADO

Flujo sin SMTP desplegado, webhook nuevo efectivo y cancelación final demostrada. Quedan dos bloqueos técnicos concretos: el pago final del nuevo Checkout sandbox, rechazado por la revisión automática del navegador y reservado al usuario, y la lectura del IVA con la clave live de Netlify, que devuelve HTTP 403. No se confunden con secretos ausentes ni con eventos antiguos fallidos.

**Cobros reales desactivados.** `BRC_LIVE_CHECKOUT_ENABLED` no es `true`; además, `LIVE_ORDER_RELEASE_AUTHORIZED=false` bloquea el flujo nuevo en código. La ruta pública antigua sigue bloqueada incondicionalmente. No se crearon sesiones live, cobros reales, bases de datos o servicios contratados; no se modificaron precios, PsyMorph ni Onyra.

## Contratación sin SMTP

- Reutilización de borrador → propuesta inmutable → aceptación → Checkout. UUID, comercial, modalidad, condiciones/versionado/hash, aceptación y metadata Stripe vinculados.
- Dirección registra firmante, teléfono conocido, comprobación independiente (llamada o presencial) y referencias privadas de evidencia de identidad y facultades. Es revisión humana trazable, no validación automática documental ni firma cualificada. La mera posesión del enlace no prueba representación legal.
- El panel muestra una sola vez el enlace privado y permite copiarlo. La comercial lo envía manualmente por WhatsApp. Sin API de WhatsApp ni mensajes a terceros durante QA.
- Token aleatorio de 256 bits, caducidad máxima 48 horas, solo hash almacenado, fragmento retirado antes de enviar el formulario, respuestas privadas sin caché, sin recursos de terceros y referencias bloqueadas hacia otros sitios. Registros separados de generación, envío manual declarado y revocación.
- El cliente escribe el nombre previamente verificado y marca declaración de facultades y consentimiento expreso. No hay acción administrativa de aceptación. La aplicación no pretende demostrar que un administrador malicioso no pueda suplantar a alguien fuera de su sesión: la verificación independiente y sus evidencias siguen siendo necesarias.
- Pedido sin aceptación válida, propuesta alterada/caducada o supuesto fiscal no revisado: bloqueo antes de Stripe. Un intento por pedido y clave idempotente estable; caducidad/resultado incierto exige conciliación, sin regeneración silenciosa.
- Nodemailer y dependencia SMTP eliminados. Zoho Mail ordinario intacto. Los enlaces antiguos por correo dejan de validar en este flujo.

## Fallos corregidos mediante ejecución real

1. **Blobs SDK 9 no implementaba `onlyIfNew` ni devolvía `modified`.** Los mocks anteriores ocultaban la incompatibilidad. Fijado `@netlify/blobs` 11.1.4. Regresión usando SDK real con transporte simulado y comprobación desplegada efectiva: el segundo intento condicional no sobrescribe el primero.
2. **`no-referrer` impedía el POST legítimo del cliente por Origin.** Cambiado a `same-origin` en propuestas, pedidos y bajas: conserva CSRF y no envía referencias a otros sitios. Recorrido del cliente verificado en navegador.
3. **El panel no mostraba el diario nuevo sandbox.** Añadido, separado del anterior y de live, con pedido, comercial y referencia exacta del evento.
4. Adaptive Pricing desactivado en nuevas sesiones de pedidos para conservar EUR/importes aprobados. En la sesión QA ya creada se seleccionó EUR. Catálogo intacto.
5. Se conservan correcciones anteriores: disputas `du_`/`dp_`, baja del portal mediante `cancel_at` y conciliación PaymentIntent → InvoicePayment → factura → suscripción, nunca por coincidencia de cliente/email.

Blobs se usa con objetos inmutables, creación condicional y lectura fuerte, sin afirmar transacciones multiobjeto ni mantener contadores/balances de lectura-modificación-escritura. Fallar una etapa bloquea la siguiente; Stripe controla la idempotencia del efecto externo.

## Evidencias efectivas, no simulaciones

| Prueba | Resultado |
|---|---|
| Secreto sandbox nuevo | Disponible en ejecución tras despliegue. Solo comprobada disponibilidad/formato; valor no expuesto. |
| Webhook auténtico nuevo | `evt_1UPjQKD95NECz80FcUhZhgRC`, `customer.subscription.updated`, emitido al cambiar solo metadata de la suscripción QA. Stripe: `pending_webhooks:0`. |
| Persistencia | Registro real en `brc-order-test-sales/subscription-events/sub_1UPi3ND95NECz80FUH3JP3x4/evt_1UPjQKD95NECz80FcUhZhgRC`; `live:false`, pedido `qa-20261012-subscription`, comercial `direccion`. |
| Panel privado | Handler desplegado, autenticación interna QA: HTTP 200, HTML con pedido e identificador exacto del evento. No se afirma inspección visual autenticada del panel. |
| Propuesta y aceptación | Pedido `a237bc13-84a9-49e4-a197-60a552ff1078`; aceptación desde navegador el 12/10/2026 13:19:38 UTC, firmante ficticio `BRC QA Firmante`, ambos consentimientos y hash. Fixture sin contrato/datos fiscales reales. Enlace abierto directamente para QA; no se afirma envío real por WhatsApp. |
| Checkout nuevo | `cs_test_b1VYocXpzP8c9qhVIk0bi5uW9PZX7igOKBa4WN8dLn4nPI5t3kcpAx5uQL`, `livemode:false`, 227,48 EUR y renovación 47,19 EUR. **Unpaid**: revisión automática rechazó el clic final y exigió intervención del usuario. No se eludió con otra API. |
| Baja efectiva | API oficial de avance del reloj `clock_1UPi2WD95NECz80FjPrX6YHR`, comprobando ausencia de otras suscripciones activas afectadas. `sub_1UPi3ND95NECz80FUH3JP3x4`: `canceled`, `ended_at=1794484800` (12/11/2026 12:00 UTC). |
| Sin factura posterior | Cuatro días después del fin pagado, una única factura: `in_1UPi3ND95NECz80F4zOXf2jx`, 22748 céntimos, pagada. No se creó renovación tras la baja. |
| Evento de baja | `evt_1UPjTaD95NECz80F0Ngmxz6Q`, `customer.subscription.deleted`, `pending_webhooks:0`, estado canceled. |

[Evidencia saneada de ejecución](evidence/brc-whatsapp-webhook-20261012.json): sin claves, tokens de aceptación ni URLs de facturas privadas.

### Evidencias auténticas previas reutilizadas

- Compra pagada **592,90 EUR**: `cs_test_a1P6wXYRXpwanOeYBsX36HMERDxjSMYsRPc2AwH54vFTYpuomteSMkhlGm`; captura `evidence/brc-sandbox-compra-20261012.jpg`.
- Factura inicial `in_1UPi3ND95NECz80F4zOXf2jx`: base 18800 + IVA 3948 = **22748 céntimos**, pagada. Vista previa de renovación **4719 céntimos**, que NO demuestra renovación cobrada.
- Portal sandbox probado: facturas/método de pago visibles y baja programada al final pagado. Captura `evidence/brc-cancelacion-sandbox-20261012.jpg`. Ahora también se demuestra la transición efectiva a canceled.
- Reembolso `re_3UPi3ND95NECz80F1GnCiyGH`: 1000 céntimos, succeeded.
- Disputa de prueba `du_1UPi6gD95NECz80F3xgzWhMa`: won; eventos de cierre/restitución emitidos. Regresión con fixtures reales saneados conservada. Su replay local no se presenta como entrega HTTPS nueva.
- No se repitieron pagos, reembolsos ni disputas ya acreditados.

## Pruebas simuladas

`npm run build`: **80 pruebas superadas**, más validación de estáticos/JavaScript. Firma inválida/caducada, rotación, duplicados concurrentes, fallo/reintento de persistencia, desorden de eventos, primer cobro no duplicado, autorización/CSRF, aceptación, revocación, impuestos, idempotencia y aislamiento live/test.

Activación futura probada sustituyendo la constante exclusivamente en una VM local, con transporte simulado y sin red. Exige autorización en código y variable comercial, propuesta válida/inmutable, aceptación del mismo pedido/entorno, declaración de facultades y evidencia. Catálogo fijo, IVA exclusivo y metadata completa. Archivo publicado continúa en `false`.

## Producción

- Webhook `we_1UPWqyDwLerTapleMqYF8SPh`: habilitado, API `2026-09-30.endive`, **19 eventos**: dos Checkout, tres facturación, cinco suscripción, tres refund, charge.refunded y cinco disputas.
- Portal `bpc_1UPiBTDwLerTaplennYWGOYT`: facturas, actualización de método de pago, baja al final, sin prorrateo; cambios de plan y login público desactivados. Sin sesiones live.
- Ocho precios leídos, sin modificaciones: 490, 149, 39/mes, 290, 249, 290, 190 y 99 EUR sin IVA, `tax_behavior:exclusive`. Fases 2/3 no ofrecidas por Checkout.
- Variable de IVA coincide con `txr_1UPX5ZDwLerTaplePClmgRMy`. **GET del recurso usando la clave live desplegada devuelve 403**: acceso operativo no validado. No se cambiaron secretos ni se contrató Stripe Tax.
- Solo se admite ES general 21 % revisado por cliente. Otros supuestos se bloquean; no se supone 21 % universal. Datos fiscales auténticos y revisión legal/fiscal pendientes antes de comercializar.
- Webhook anterior sandbox `we_1UPTt4D95NECz80FdMmpPexP` intacto: dos eventos y URL originales. Tres funciones Stripe test y páginas sin editar. El SDK compartido sí se actualizó; el panel desplegado continúa leyendo el diario anterior.

## Retirada de QA y activación futura

Se retiran del código final la función temporal `brc-closure-qa` y la selección especial de cliente/reloj QA. No queda endpoint público de diagnóstico ni tarea de avance de reloj. Fixtures y diarios se conservan aislados como evidencia, nunca ventas live.

Tras resolver los bloqueos y obtener autorización comercial expresa, datos fiscales auténticos y revisión legal/fiscal: aprobar un commit que cambie `LIVE_ORDER_RELEASE_AUTHORIZED` y habilitar la variable comercial con despliegue. Ruta válida: `/api/brc-order-checkout`, siempre detrás de propuesta/aceptación; nunca habilitar el transporte público antiguo. Revertir variable o constante impide nuevas sesiones y conserva webhooks/diarios.

## Pendientes mínimos

1. **Pago sandbox por el usuario:** revisión automática exige su clic final. Después verificar webhook/registro/conciliación del nuevo pedido y renovación efectivamente cobrada de 47,19 EUR usando el reloj oficial. Si caduca, conciliar antes de crear otro pedido. No requiere SMTP, reconexiones ni infraestructura.
2. **IVA live 403:** revisar permiso de lectura de Tax Rates de la clave restringida existente, o la causa exacta del 403, antes de activar. No copiar/revelar la clave.
3. **Activación posterior:** datos fiscales reales, revisión legal/fiscal y autorización comercial. Cargo live, factura fiscal final, webhook live auténtico y conciliación bancaria requieren una operación real autorizada; no realizados.

Los antiguos bloqueos de SMTP, secreto sandbox ausente y avance de reloj no son pendientes actuales.
