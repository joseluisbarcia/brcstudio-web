# Cierre de implementación — 12 octubre 2026

## Resultado y límites
Cobros reales bloqueados en código, incluso si cambia la variable de entorno. No se ha creado ninguna sesión live, modificado precios, suscripciones reales ni servicios PsyMorph/ONYRA. No se ha contratado infraestructura.

## Cambios ejecutados
- Borrador existente → propuesta privada inmutable con UUID, modalidad, comercial, datos fiscales, alcance, condiciones versionadas y hash SHA-256.
- Aceptación explícita del cliente mediante posesión de enlace enviado al correo del pedido; nombre del firmante, texto consentido, fecha, versión/hash y referencia de entrega. No existe casilla de aceptación administrativa. La posesión del correo no es firma electrónica cualificada ni acredita por sí sola poderes de representación.
- Token aleatorio de 256 bits, caducidad 48 horas, solo hash persistido; enlace con fragmento eliminado por JavaScript, sin token en URL enviada al servidor ni respuesta administrativa.
- Checkout nuevo exclusivamente sandbox, vinculado a pedido/aceptación/comercial; comprobación de IVA exclusivo ES 21 %, facturación y NIF solicitados. Total compra 592,90 €, alta+mes 227,48 €, renovación 47,19 €.
- Un intento inmutable por pedido y clave idempotente Stripe estable; sesión de una hora. Ante caducidad o resultado incierto se bloquea la recreación, incluso después de la retención de idempotencia de Stripe. Requiere conciliación antes de preparar otro pedido.
- Reutilización de Blobs: escrituras atómicas `onlyIfNew`, lectura fuerte y diario inmutable; sin contadores ni actualizaciones de lectura-modificación-escritura, ni supuesta transacción multiobjeto. Las etapas fallidas bloquean el siguiente paso. No se necesita otra base de datos para este flujo restringido.
- Baja privada live existente y variante sandbox aislada. Ambas solicitan cancelación efectiva al final del período y solo confirman éxito tras respuesta de Stripe. Sandbox exige metadata de pedido nuevo, protegiendo suscripciones anteriores.
- Webhook ampliado para nueve eventos de reembolso/disputa, diario separado de cobros. Facturas de compra vinculadas se registran sin duplicar ventas. Conciliación por referencias exactas de pago/factura/suscripción, nunca por coincidencia de cliente. Estados simultáneos ambiguos se marcan pendientes; no se suman snapshots acumulativos como reembolsos nuevos.
- Nuevo webhook de pedidos sandbox y almacén separados del sistema de pruebas anterior. El original no se modifica.

## Pruebas realizadas
- `npm run build`: 66 pruebas superadas, incluidas firma/antirreplay, duplicados concurrentes, persistencia fallida/reintento, orden de eventos, primer cobro no duplicado, autorización, CSRF, evidencia de aceptación, impuestos, sesión única y bloqueo live.
- La prueba de rutas pedido → correo → aceptación → Checkout utiliza SMTP/Stripe simulados; NO equivale a recorrido real de ese flujo.
- Compra REAL EN SANDBOX a través del Checkout desplegado anterior, tarjeta oficial de pruebas: `cs_test_a1P6wXYRXpwanOeYBsX36HMERDxjSMYsRPc2AwH54vFTYpuomteSMkhlGm`.
- Confirmación HTTP de Stripe: `paid:true`, `status:complete`, `plan:compra`, `amount:59290`, `currency:eur`, `livemode:false`. Captura en `evidence/brc-sandbox-compra-20261012.jpg`. No se cobró dinero real. No se inventaron datos fiscales del titular; se usaron fixtures inequívocos de prueba.
- Dependencia SMTP Nodemailer 10.1.0; auditoría de dependencias de producción sin vulnerabilidades conocidas en esta ejecución.

## Dependencias de la revisión anterior (actualizadas debajo)
1. Correo: configurar de forma segura las variables `BRC_SMTP_HOST`, `BRC_SMTP_USER`, `BRC_SMTP_PASSWORD` de la cuenta existente `jose@brcstudio.es`. Confirmar servidor regional SMTP y permiso del plan actual; no contratar otro servicio. Sin configuración, envío devuelve 503 y nadie puede aceptar por un token administrativo.
2. Acceso Stripe: el conector solo expone live, no el sandbox existente. Restablecer permisos de escritura live y acceso a `acct_1UPRtoD95NECz80F` para configurar portal privado/eventos y demostrar renovación y baja de una nueva suscripción sandbox.
3. Registrar `/api/brc-order-test-webhook` en sandbox y guardar su secreto nuevo como `STRIPE_ORDER_TEST_WEBHOOK_SECRET` en Netlify. Mantener el webhook test anterior intacto. Añadir al endpoint live los nueve eventos soportados nuevos; no crear ventas ficticias para probarlo.
4. Datos fiscales auténticos del prestador y revisión del supuesto fiscal de cada cliente. El código bloquea supuestos distintos de ES general 21 % en lugar de asumir que todo cliente tributa así. No sustituye revisión fiscal ni acredita factura legal completa.
5. Con estos accesos: ejecutar en sandbox el flujo nuevo completo por correo, verificar diario/panel, renovación, baja efectiva, reembolso y disputa. Todavía NO demostrado con proveedor real para estas operaciones.

La integración NO se declara comercialmente terminada hasta cerrar estas dependencias y pruebas. La ruta nueva sigue limitada a sandbox y la ruta live tiene un bloqueo independiente: la futura autorización comercial requiere una implementación/revisión explícita de su habilitación, nunca solo cambiar una variable.

## Solo verificable mediante operación real posterior
Cargo liquidado, factura fiscal live final, entrega de evento auténtico live y conciliación bancaria. No forman parte de las pruebas autorizadas y no se han realizado.

## Publicación verificada
- Commit de implementación: `4abe9aa611be220c24848e546a303070199b5583`.
- Netlify: `6accc66501556f39732a9362`, estado `ready`, commit coincidente, sin error.
- HTTP producción: `/api/stripe-live-checkout` 200 con `enabled:false`, `tax_rate_configured:true`, `release_ready:false`; `/pedido` 200; contratos y bajas sandbox sin autenticar 401; webhook live sin firma 400; página test anterior 200.
- Nuevo webhook sandbox: 503 `Webhook not configured`, bloqueo confirmado y deliberado hasta configurar el secreto separado.
- La ampliación live de eventos se intentó y reintentó; ambas llamadas devolvieron autenticación requerida, sin confirmación de escritura. No se considera aplicada.
- Funciones y página originales de prueba: diff vacío respecto al inicio de esta continuación.

- Lectura posterior de Stripe confirma que el endpoint live conserva sus diez eventos originales; los nueve nuevos siguen pendientes de permiso efectivo.


## Continuación tras autorizar ambas conexiones — resultados efectivos

### Configuración aplicada y leída de nuevo
- Conexiones existentes verificadas: live `acct_1UPRtYDwLerTaple` y sandbox `acct_1UPRtoD95NECz80F`. No se ha solicitado reconectar Stripe.
- Portal LIVE privado creado: `bpc_1UPiBTDwLerTaplennYWGOYT`. Facturas y método de pago habilitados, baja `at_period_end`, sin prorrateo; cambio de plan y página pública de login desactivados. No se han creado sesiones live.
- Webhook LIVE `we_1UPWqyDwLerTapleMqYF8SPh`: 19 eventos confirmados (10 anteriores + 9 de reembolsos/disputas). Endpoint y secreto anteriores conservados.
- Nuevo webhook SANDBOX `we_1UPi3lD95NECz80FkHLusrot`: `/api/brc-order-test-webhook`, API `2026-09-30.endive`, 19 eventos. Su secreto no se publica ni se guarda en Git. Falta provisionarlo en Netlify. El webhook sandbox anterior `we_1UPTt4D95NECz80FdMmpPexP` mantiene URL, secreto y eventos originales.

### Operaciones auténticas de sandbox (no mocks)
- Reloj nuevo `clock_1UPi2WD95NECz80FjPrX6YHR`; cliente nuevo `cus_VQZBRQdNADjeOj`; suscripción `sub_1UPi3ND95NECz80FUH3JP3x4`.
- Factura inicial `in_1UPi3ND95NECz80F4zOXf2jx`: pagada; alta 14900 + mensualidad 3900 + IVA 3948 = **22748 céntimos**. IVA único: alta 3129 y mes 819. Sin Stripe Tax automático ni modificación de catálogo.
- Vista previa de próxima factura emitida por Stripe: una línea mensual 3900 + IVA 819 = **4719 céntimos**. Esto confirma el cálculo, NO demuestra una renovación efectivamente cobrada.
- Portal sandbox existente `bpc_1UPSDZD95NECz80FPrVCK6re` probado con ese cliente. Factura pagada visible, método de pago visible y opción de actualización disponible; sin cambio de plan.
- Baja enviada desde el portal y confirmada visualmente y por API: `cancel_at=1794484800`, coincidente con fin pagado **12/11/2026 12:00 UTC**. El portal dice «Tu servicio finalizará el 12 de noviembre de 2026». No se ha adelantado el reloj, por lo que no se declara todavía comprobada la transición final a `canceled` ni la ausencia de factura posterior.
- Reembolso parcial `re_3UPi3ND95NECz80F1GnCiyGH`: **1000 céntimos**, `succeeded`, sobre el cargo nuevo `ch_3UPi3ND95NECz80F1e301wwV`.
- Disputa generada mediante el método oficial de prueba `pm_card_createDispute`, cliente nuevo `cus_VQZEeXq7WvIRXB`, suscripción nueva `sub_1UPi6eD95NECz80FUN1cmS6o` (baja al final ya programada), cargo **4719 céntimos**.
- Disputa `du_1UPi6gD95NECz80F3xgzWhMa`: `needs_response` → evidencia especial de sandbox `winning_evidence` → **won**. Stripe emitió `charge.dispute.closed` y `charge.dispute.funds_reinstated`.
- Ninguna suscripción preexistente ni cliente real fue modificado. Todos los emails de fixtures usan `example.invalid`; no hay NIF real inventado.

### Fallos corregidos a partir de objetos reales
1. Se rechazaban las disputas reales con prefijo `du_`; ahora se admite `du_` y el prefijo anterior `dp_`.
2. El portal usa `cancel_at` igual al final del período y puede mantener `cancel_at_period_end:false`. La gestión privada reconoce esa baja programada sin volver a modificarla, conservando los valores reales de Stripe.
3. Conciliación de ajustes a través del grafo PaymentIntent → InvoicePayment → factura → suscripción, o Checkout de ese PaymentIntent. No se atribuye por email/cliente compartido. Errores de API devuelven 503 para reintento; modos cruzados se rechazan. La metadata del recurso de propiedad resuelto identifica el pedido.
4. Fixtures saneados de los eventos auténticos (sin URLs privadas de facturas ni secretos) incluidos para regresión. Replay local firmado verifica persistencia idempotente e imposibilidad de registrarlos como live. **No se confunde con entrega HTTPS efectiva de Stripe a Netlify**.
- `npm run build`: **71 pruebas superadas**.

### Pendientes actuales, por dependencia exacta
**Solo SMTP:** envío real de propuesta, posesión del enlace y aceptación de extremo a extremo por correo en el flujo nuevo. Variables `BRC_SMTP_HOST`, `BRC_SMTP_USER`, `BRC_SMTP_PASSWORD`; verificar permiso SMTP del plan existente. No contratar servicio adicional.

**Solo datos fiscales del titular:** nombre fiscal, NIF y domicilio auténticos y validación de factura/propuesta definitiva. El supuesto ES general 21 % se revisa por cliente; no se habilita automáticamente para otras jurisdicciones.

**Netlify, independiente de SMTP/datos fiscales:** el conector actual no expone escritura de variables de sitio, y la pantalla de variables muestra login. Se necesita una sesión segura de Netlify para guardar `STRIPE_ORDER_TEST_WEBHOOK_SECRET` con alcance Functions y redeplegar. Hasta entonces el endpoint devuelve 503 y los eventos nuevos figuran pendientes de entrega. No se ha eludido autenticación ni incrustado el secreto en código.

**Avance de reloj, independiente de SMTP/datos fiscales:** el conector sandbox permite crear el reloj pero no expone `POST /v1/test_helpers/test_clocks/{test_clock}/advance` (su operationId oficial devuelve no disponible). Se necesita acceso al Dashboard/CLI autorizado para adelantarlo y verificar renovación cobrada y baja efectiva. Una vista previa no sustituye esa prueba. Para renovación usar una suscripción nueva sin baja previa; conservar la actual para comprobar cese al final.

**Después de configurar el secreto:** entrega firmada real, reintentos, persistencia en Blobs y panel del flujo nuevo. Los eventos auténticos existen en Stripe, pero siguen pendientes en ese endpoint. El sistema de pruebas anterior permanece intacto.

Los cobros live siguen bloqueados en código. No se han contratado servicios, cambiado precios ni alterado PsyMorph/ONYRA. La autorización comercial sigue pendiente.


### Publicación de esta continuación
- Commit de código: `a09232dceda493425f4a76d6ca34c231d79d2dac`.
- Netlify: `6accd1521b621d79b397f659`, `ready`, commit coincidente.
- El intento de acceso seguro a Netlify quedó en Google con «No se ha encontrado esta cuenta»; no se obtuvieron ni guardaron credenciales y no se modificaron variables. No es un fallo de la conexión Stripe.
- Prueba visual de baja: `docs/evidence/brc-cancelacion-sandbox-20261012.jpg`.

- HTTP final: Checkout live `enabled:false`, webhook live sin firma 400, webhook nuevo sandbox 503 por secreto ausente, bajas sandbox sin autenticar 401 y página test anterior 200.
