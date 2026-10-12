# Cierre de implementación Stripe — 12 octubre 2026

## Dictamen: CERRADO TÉCNICAMENTE — PENDIENTE DE ACTIVACIÓN COMERCIAL

Flujo sin SMTP desplegado y recorrido sandbox completado: aceptación, pago inicial, webhook auténtico, conciliación, renovación efectivamente cobrada y baja efectiva sin factura posterior. El último bloqueo de permisos ha quedado resuelto y verificado desde Netlify Production con la clave existente el 12/10/2026 a las 16:34:50 de Madrid (14:34:50 UTC): Tax Rates devuelve HTTP 200. No quedan bloqueos técnicos identificados en el alcance de este cierre. No se requieren SMTP ni cambios del secreto sandbox.

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
| Checkout nuevo | `cs_test_b1VYocXpzP8c9qhVIk0bi5uW9PZX7igOKBa4WN8dLn4nPI5t3kcpAx5uQL`, `livemode:false`, 227,48 EUR y renovación 47,19 EUR. **Complete / paid**, confirmado por consulta real posterior. El paso que antes requería intervención ya está completado; no se eludió la revisión del navegador. Suscripción `sub_1UPje3D95NECz80FqvaSC8Hw`. |
| Baja efectiva | API oficial de avance del reloj `clock_1UPi2WD95NECz80FjPrX6YHR`, comprobando ausencia de otras suscripciones activas afectadas. `sub_1UPi3ND95NECz80FUH3JP3x4`: `canceled`, `ended_at=1794484800` (12/11/2026 12:00 UTC). |
| Sin factura posterior | Cuatro días después del fin pagado, una única factura: `in_1UPi3ND95NECz80F4zOXf2jx`, 22748 céntimos, pagada. No se creó renovación tras la baja. |
| Evento de baja | `evt_1UPjTaD95NECz80F0Ngmxz6Q`, `customer.subscription.deleted`, `pending_webhooks:0`, estado canceled. |

[Evidencia saneada de ejecución](evidence/brc-whatsapp-webhook-20261012.json): sin claves, tokens de aceptación ni URLs de facturas privadas. Esta evidencia histórica antecede al pago; el resultado vigente es el siguiente.

### Recorrido completo final — comprobado a las 14:08 UTC

- Factura inicial `in_1UPje1D95NECz80FLbmVJs9N`: **22748 céntimos pagados**, saldo pendiente cero; líneas 14900 de alta y 3900 del primer mes.
- Checkout: evento auténtico `evt_1UPje4D95NECz80FzayzIGd9`, persistido en `checkout/` con pedido y comercial. La factura inicial se conserva en `invoice-events/`, sin crear otra venta ni una falsa renovación.
- Reloj oficial de Stripe avanzado solo para el cliente QA identificado; comprobación previa de que no hay otras suscripciones activas afectadas.
- **Renovación efectiva:** `in_1UPjs6D95NECz80FXjIGEFcr`, `billing_reason:subscription_cycle`, `status:paid`, 4719 céntimos pagados, saldo pendiente cero. Una sola línea de 3900 más 819 de IVA, sin repetir el alta. Evento `evt_1UPjsCD95NECz80FpKaYIgd7`, `pending_webhooks:0`, registro único en `renewal/`.
- **Baja ejecutada por el handler administrativo desplegado:** identidad sintética QA, reautenticación y referencia trazable; Stripe confirma `cancel_at_period_end:true` y `cancel_at:1800100800`. No se modificó una suscripción real.
- **Baja efectiva:** `sub_1UPje3D95NECz80FqvaSC8Hw` queda `canceled`, `ended_at:1800100800` (16/01/2027 12:00 UTC simulado). Evento auténtico `evt_1UPjtJD95NECz80FcqC5aURa`, `pending_webhooks:0`, persistido y visible en el HTML del panel privado.
- Cuatro días simulados después de la baja solo existen las dos facturas anteriores: no hay nuevo cargo ni factura.
- Siete registros de diario con el mismo pedido/comercial, todos `live:false`; comprobación autenticada del handler del panel HTTP 200 y presencia de los siete identificadores. No se afirma una nueva inspección visual del panel en navegador.
- Evidencias: [renovación cobrada](evidence/brc-renewal-effective-20261012.json), [baja programada por la aplicación](evidence/brc-cancellation-scheduled-20261012.json), [ciclo final y diario](evidence/brc-lifecycle-complete-20261012.json).

### Evidencias auténticas previas reutilizadas

- Compra pagada **592,90 EUR**: `cs_test_a1P6wXYRXpwanOeYBsX36HMERDxjSMYsRPc2AwH54vFTYpuomteSMkhlGm`; captura `evidence/brc-sandbox-compra-20261012.jpg`.
- Factura inicial `in_1UPi3ND95NECz80F4zOXf2jx`: base 18800 + IVA 3948 = **22748 céntimos**, pagada. La vista previa histórica de **4719 céntimos** no era prueba de cobro; ahora la renovación efectiva del pedido nuevo sí queda demostrada arriba.
- Portal sandbox probado: facturas/método de pago visibles y baja programada al final pagado. Captura `evidence/brc-cancelacion-sandbox-20261012.jpg`. Ahora también se demuestra la transición efectiva a canceled.
- Reembolso `re_3UPi3ND95NECz80F1GnCiyGH`: 1000 céntimos, succeeded.
- Disputa de prueba `du_1UPi6gD95NECz80F3xgzWhMa`: won; eventos de cierre/restitución emitidos. Regresión con fixtures reales saneados conservada. Su replay local no se presenta como entrega HTTPS nueva.
- Se reutilizaron las evidencias previas de compra, reembolso y disputa; solo se completó el pago pendiente del flujo nuevo y su renovación requerida.

## Pruebas simuladas

`npm run build`: **80 pruebas superadas**, más validación de estáticos/JavaScript. Firma inválida/caducada, rotación, duplicados concurrentes, fallo/reintento de persistencia, desorden de eventos, primer cobro no duplicado, autorización/CSRF, aceptación, revocación, impuestos, idempotencia y aislamiento live/test.

Activación futura probada sustituyendo la constante exclusivamente en una VM local, con transporte simulado y sin red. Exige autorización en código y variable comercial, propuesta válida/inmutable, aceptación del mismo pedido/entorno, declaración de facultades y evidencia. Catálogo fijo, IVA exclusivo y metadata completa. Archivo publicado continúa en `false`.

## Producción

- Webhook `we_1UPWqyDwLerTapleMqYF8SPh`: habilitado, API `2026-09-30.endive`, **19 eventos**: dos Checkout, tres facturación, cinco suscripción, tres refund, charge.refunded y cinco disputas.
- Portal `bpc_1UPiBTDwLerTaplennYWGOYT`: facturas, actualización de método de pago, baja al final, sin prorrateo; cambios de plan y login público desactivados. Sin sesiones live.
- Ocho precios leídos, sin modificaciones: 490, 149, 39/mes, 290, 249, 290, 190 y 99 EUR sin IVA, `tax_behavior:exclusive`. Fases 2/3 no ofrecidas por Checkout.
- Variable de IVA coincide con `txr_1UPX5ZDwLerTaplePClmgRMy`. **GET del recurso usando la clave live desplegada devuelve HTTP 200**, `country:ES`, `percentage:21`, `inclusive:false`, `active:true`, `livemode:true`. El 403 histórico de los informes anteriores queda resuelto tras la corrección de permisos por el titular. No se cambiaron claves, variables, precios ni configuración comercial en esta comprobación.
- Solo se admite ES general 21 % revisado por cliente. Otros supuestos se bloquean; no se supone 21 % universal. Datos fiscales auténticos y revisión legal/fiscal pendientes antes de comercializar.
- Webhook anterior sandbox `we_1UPTt4D95NECz80FdMmpPexP` intacto: dos eventos y URL originales. Tres funciones Stripe test y páginas sin editar. El SDK compartido sí se actualizó; el panel desplegado continúa leyendo el diario anterior.

## Retirada de QA y activación futura

Se retiran del código final las funciones temporales `brc-closure-qa` y `brc-qa-lifecycle`, además de la selección especial de cliente/reloj QA. La última verificación temporal exigía un token de 256 bits cuyo hash era lo único incluido en código, caducidad y guardas de cuenta/cliente/suscripción sandbox. El token nunca se publicó ni se añadió al informe. No queda endpoint público de diagnóstico ni tarea de avance de reloj. Fixtures y diarios se conservan aislados como evidencia, nunca ventas live.

Solo después de obtener autorización comercial expresa, datos fiscales auténticos y revisión legal/fiscal: aprobar un commit que cambie `LIVE_ORDER_RELEASE_AUTHORIZED` y habilitar la variable comercial con despliegue. Ruta válida: `/api/brc-order-checkout`, siempre detrás de propuesta/aceptación; nunca habilitar el transporte público antiguo. Revertir variable o constante impide nuevas sesiones y conserva webhooks/diarios.

## Pendientes mínimos

1. **Activación comercial:** aportar los datos fiscales auténticos del titular, completar la revisión legal/fiscal y obtener autorización comercial expresa. El cierre técnico no autoriza activar cobros.
2. **Comprobaciones live posteriores:** cargo real, factura fiscal final, webhook live auténtico y conciliación bancaria requieren una transacción real autorizada; no se han realizado y no se presentan como pruebas superadas.

SMTP, disponibilidad del secreto sandbox, clic de pago, renovación efectiva y avance de reloj ya no son pendientes. No se solicita otra conexión ni intervención para esas tareas.

## Commits y despliegue comprobado

- Inicio: `061269eb5f969f0a7ef302fd89ffa24592787f68`.
- Enlaces sin SMTP: `389bd57481c17a24ce74658595e2ed8f49bea7fa`.
- SDK Blobs corregido: `c4ecd3eb7a56838b2769786ed7fd23ce6727502c`.
- Formulario del cliente: `1425f3f294132262a456de132b189a3c99500fef`.
- Activación futura simulada y bloqueada: `9ea5a172829cab92311f60878196540af3cc72f7`.
- Verificación de baja y panel: `b5875578739c5d84dd1558d44b466a7ad6fe4b33`, `af141e1339b1beb6c0fb4ab433c94d77c07a9ecc`.
- Código final, retirada QA y documentación: `022e17c7363849a41e0b620cae507e86eb7aa587`.
- Netlify de ese código: `6acce5b545749a5f388241ec`, **ready**, commit coincidente, sin error. Los commits posteriores de evidencia/documentación conservan ese código.
- Comprobación posterior: GET live `enabled:false`, POST live 503; webhooks live/nuevo sandbox sin firma 400; rutas QA pública y directa 404; página test anterior y propuesta 200; contratos y bajas sin autenticar 401.
- [Resultados HTTP](evidence/brc-final-http-20261012.json). La captura [Checkout sandbox antes del pago](evidence/brc-sandbox-checkout-pendiente-20261012.jpg) es histórica, no representa el estado actual.
- Verificador temporal protegido: `a72d7c19e9d8c743ec2810ae9d2ef459907865ba`, ajuste a Invoice API actual `40ef6691d2efd48a0a122b30703cb674f2d2fd7b`; Netlify `6acce93b3de83a4dec52f579`, ready. Se elimina después de recoger la evidencia.
- `npm run build` ejecutado nuevamente: 80/80 pruebas y validación de estáticos correctas.

### Despliegue final del cierre ejecutado

- Commit de retirada definitiva del verificador y evidencias: `89a0c6cc2f78dc3054d19d4be37d703fc38944ad`.
- Netlify: `6accea2453cecc047bfedc9f`, **ready**, commit coincidente, sin error.
- Relectura final: webhook live 19 eventos, nuevo sandbox 19 y antiguo sandbox 2, todos habilitados; portal live privado sin cambios de plan. [Configuración y evento final de baja](evidence/brc-stripe-config-final-20261012.json).
- Comprobaciones HTTP posteriores en `brc-final-http-20261012.json`: ambos verificadores QA, tanto ruta pública como ruta directa de función, devuelven 404; live sigue desactivado y webhooks rechazan peticiones sin firma.
- No quedan tareas técnicas de sandbox pendientes. El permiso Tax Rates se verificó posteriormente con éxito, como se detalla a continuación.

### Resolución definitiva del permiso IVA — 16:34:50 Madrid

- Consulta ejecutada dentro de Netlify Functions, contexto Production, con `STRIPE_LIVE_SECRET_KEY` existente. La clave no salió de la función ni fue mostrada.
- `GET /v1/tax_rates/txr_1UPX5ZDwLerTaplePClmgRMy`: **HTTP 200**; ES, 21 %, exclusivo (`inclusive:false`), activo y live.
- `BRC_LIVE_CHECKOUT_ENABLED` sigue sin ser `true` y `LIVE_ORDER_RELEASE_AUTHORIZED` continúa en `false`. No se creó ninguna sesión live.
- [Evidencia directa y saneada](evidence/brc-live-tax-verified-20261012.json). Los JSON anteriores con 403 se conservan exclusivamente como historial y quedan sustituidos para el estado actual por esta evidencia.
- Verificación temporal de solo lectura, protegida por token aleatorio de 256 bits y caducidad, desplegada en `7836a73a7835a6223c4159bb1f07a491c11085ac` / Netlify `6accefe14f61ee8d9f87c3d4`, ready. Se retira en el mismo commit que declara este cierre; no queda función permanente de diagnóstico.
- No se repitieron pruebas funcionales/sandbox ya superadas. Se conservaron sus evidencias y el resultado previo de 80/80 pruebas.
