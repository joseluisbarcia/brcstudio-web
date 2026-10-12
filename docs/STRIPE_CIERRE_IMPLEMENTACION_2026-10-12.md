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

## Dependencias concretas pendientes
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
