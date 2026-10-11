# BRC Studio — preparación de Stripe activo, SIN ACTIVACIÓN


> **Actualización: acceso activo verificado (12 octubre, segunda revisión).** Ya se han leído en Stripe activo los ocho productos y sus precios: compra 490 / 290 / 249 EUR; alta 149 EUR; mensualidad recurrente 39 EUR cada mes; compras posteriores 290 / 190 / 99 EUR. Todos activos, EUR y `tax_behavior=exclusive`. No se ha cambiado ningún precio. Los bloqueos de acceso de la sección inicial quedan como historial de la primera revisión.
>
> Stripe Tax está `pending` por falta de `head_office` y no tiene registros fiscales; no se habilita. Esto no implica ausencia de alta ante Hacienda. La consulta de tasas manuales y estado de activación bancaria/identidad no está disponible con las operaciones expuestas por este conector; sigue pendiente de verificación. No existen endpoints webhook live. Las copias conservan metadata.environment=test, pero su `livemode=true` confirma el modo real; esa etiqueta no decide el entorno en el código.
>
> Los identificadores reales verificados se han documentado en un informe privado y están preparados para la variable `BRC_LIVE_CATALOG_JSON` (Functions, production). El código acepta únicamente identificadores de esta configuración de servidor, contrasta importes contra el catálogo auditado y vuelve a validar los recursos en Stripe. No acepta importes, tasas ni IDs de precio enviados por un cliente.
>
> **Bloqueo operativo actual:** el navegador de trabajo solicita inicio de sesión en Netlify para escribir variables; el conector solo ofrece lectura. No se han guardado secretos ni creado webhook real, ni fusionado la PR. Se mantienen todos los bloqueos comerciales. Nueve pruebas locales pasan; funciones de pruebas y dist intactos. El informe privado es `BRC_Stripe_catalogo_activo_2026-10-12.md`.

Fecha: 12 octubre 2026 (Madrid). Repositorio: `joseluisbarcia/brcstudio-web`.
Proyecto Netlify: `brcstudio-web`. Se omiten identificadores internos de infraestructura en este repositorio público.

## Estado comprobado

- La conexión de Stripe de esta sesión solo autoriza **Entorno de prueba de BRC Studio**, `livemode=false`.
- No hay acceso a la cuenta activa. Los ocho productos live comunicados por el titular **no se han podido verificar**. No inventar ni reutilizar IDs de prueba.
- Netlify: despliegue publicado inspeccionado, estado `ready`, dominio `https://brcstudio.es`.
- Ese despliegue contiene únicamente las cuatro funciones anteriores de pruebas/administración. No acredita el despliegue del código nuevo.
- No se han creado Checkout reales, cargos, suscripciones, productos live, tasas ni registros fiscales. No se han contratado servicios.
- No se han modificado variables remotas, secretos o endpoints de Stripe. El conector Netlify disponible no ofrece escritura de variables ni despliegue manual; el camino preparado es PR y Deploy Preview por Git.

## Catálogo: referencia verificada SOLO en pruebas

| Clave | Producto | Base EUR | Periodicidad |
|---|---|---:|---|
| web_fase1 | Compra fase 1 | 490 | Único |
| web_fase2 | Compra fase 2 | 290 | Único |
| web_fase3 | Compra fase 3 | 249 | Único |
| alta | Alta inicial | 149 | Único |
| mensual | Mensualidad | 39 | Cada mes |
| compra_1_6 | Compra posterior meses 1–6 | 290 | Único |
| compra_7_12 | Compra posterior meses 7–12 | 190 | Único |
| compra_13 | Compra posterior desde mes 13 | 99 | Único |

Los IDs de productos y precios de prueba se omiten de este informe público. Los ocho precios de prueba son EUR, activos y `tax_behavior=exclusive`. La mensualidad tiene `interval=month`, `interval_count=1`, `usage_type=licensed`. Los ocho IDs reales siguen pendientes. Las fases 2 y 3 se conservan como alternativas de venta asistida; no se modifican productos ni se publican ofertas.

## Código preparado

- `server/stripe-live-catalog.mjs`: ocho entradas esperadas. IDs live vacíos intencionalmente. `commercialReleaseApproved=false` es un bloqueo de código.
- `POST /api/stripe-live-checkout`: sesión alojada en Stripe, solo privada, origen fijo, token administrativo propio, límites de peticiones, catálogo validado contra Stripe antes de crear sesión. Requiere además `BRC_LIVE_CHECKOUT_ENABLED=true` y contexto `production`; ahora no puede pasar el bloqueo de código.
- Mensual: 149 EUR de alta una vez + 39 EUR/mes, ambos con tasa manual verificada. El precio del alta no se repite en renovaciones. Escenario al 21%: primer pago 227,48 EUR y renovaciones 47,19 EUR. Esto no acredita los precios live ni determina la tributación legal de cada cliente.
- Compras por fases y compras posteriores soportadas mediante catálogo privado. Elegibilidad comercial y contrato se revisan por el titular. Comprar posteriormente no cancela automáticamente la suscripción: requiere procedimiento comercial específico antes de usar esta opción.
- `POST /api/stripe-live-webhook`: verifica cuerpo sin modificar, firma Stripe, tolerancia de 300 s y modo real. Rechaza eventos Connect. Registra eventos bajo su ID; las entregas repetidas no incrementan contadores. Error de almacenamiento devuelve 503 para que Stripe reintente. No depende del interruptor de Checkout: cerrar nuevas ventas no pierde renovaciones.
- `GET /api/brc-live-sales`: API privada de consulta; diario separado `brc-live-events`, relaciones Checkout/factura/suscripción/PaymentIntent/cargo. Cobros de suscripción por `invoice.paid`; Checkout inicial no se suma otra vez. Incluye diario de fallos, cancelaciones, reembolsos y disputas. Es un registro de auditoría de la cuenta; **no es libro fiscal ni panel móvil terminado**, no calcula netos ni suspende webs.
- `brc-live-checkouts`: referencias de sesiones creadas, pedido y contrato, separado de pruebas.
- Página de retorno neutra: nunca da un pago por confirmado ni entrega servicio desde la URL de éxito.
- SDK Stripe fijado en 22.6.0 y API 2026-08-26.dahlia; lockfile nuevo para builds reproducibles. Dependencia existente de Blobs conservada.

### Idempotencia

Cada pedido privado usa `orderId=<timestamp de 13 dígitos>-<UUID>`, un cliente Stripe existente, plan, referencia opaca de contrato y `fiscalReview=ES_GENERAL_21`. Su vida útil de 20 horas es menor que la retención mínima habitual de claves idempotentes de Stripe. Reintentar con el mismo pedido conserva la clave; no generar otro pedido para resolver un timeout sin conciliar antes. No hay formulario público para elegir importe, Price ID o tasa. Los eventos se almacenan de forma determinista por `evt_`; las ventas se deduplican por Checkout o factura incluso con distinto ID de evento. El SDK Blobs instalado no ofrece CAS: no se simulan bloqueos con opciones inexistentes ni se usan contadores mutables.

## IVA y servicios de pago

La preparación utiliza tasa manual exclusiva de 21% para ventas asistidas revisadas de España peninsular/Baleares. Exige cliente existente con nombre, email y dirección completa, no exento, y rechaza CP de Canarias, Ceuta/Melilla o países distintos de ES. La dirección fiscal guardada del Customer no se actualiza automáticamente desde Checkout. Revisar con el cliente cualquier discrepancia antes de enviar el enlace y al conciliar el pago. Cambios posteriores de territorio/exención requieren revisión y actualización de la suscripción; no quedan resueltos por esta versión.

Pendiente leer en cuenta live: tipos de IVA activos, inclusivo/exclusivo, ajustes Tax, registros fiscales si existen y configuración de facturación. No se ha habilitado Stripe Tax (`automatic_tax`), ni facturación posterior de pagos únicos (`invoice_creation`), ni ningún servicio adicional de pago. La facturación legal de compras sigue siendo un requisito operativo previo a la venta. Billing/Checkout tendrán sus comisiones aplicables cuando el titular autorice vender; esta preparación no ha creado operaciones facturables.

## Variables a configurar en Netlify, SOLO contexto production

| Variable | Contenido/estado | Alcance |
|---|---|---|
| BRC_LIVE_CHECKOUT_ENABLED | `false`; mantener así | Functions |
| STRIPE_LIVE_SECRET_KEY | Clave restringida live, no disponible todavía | Functions, secreto |
| STRIPE_LIVE_WEBHOOK_SECRET | Firma del nuevo endpoint live, no disponible todavía | Functions, secreto |
| STRIPE_LIVE_TAX_RATE | ID `txr_` live verificado, pendiente | Functions |
| BRC_LIVE_ADMIN_TOKEN | Token aleatorio de al menos 32 caracteres, distinto del panel de pruebas | Functions, secreto |

No poner secretos en `netlify.toml`, `dist`, Git, comentarios de PR o chat. No extender claves reales a previews/ramas. `CONTEXT` lo proporciona Netlify. Tras cambiar variables, desplegar para que tengan efecto. Un webhook real necesita el secreto firmado propio: nunca reutilizar el de pruebas.

RAK mínima a revisar en Dashboard: lectura de productos/precios/tasas/clientes y escritura de Checkout Sessions y permisos dependientes que Stripe exija para crear suscripciones. La auditoría independiente requiere lectura de cuenta. No conceder administración de claves, transferencias o reembolsos. Validar permisos antes de abrir el bloqueo.

## Webhook live pendiente de registrar

URL futura: `https://brcstudio.es/api/stripe-live-webhook`, formato snapshot, API 2026-08-26.dahlia, eventos de **esta cuenta**:

- checkout.session.completed / async_payment_succeeded / async_payment_failed / expired
- invoice.paid / payment_failed / payment_action_required / finalization_failed
- customer.subscription.created / updated / deleted / paused / resumed
- charge.refunded; refund.created / updated / failed
- charge.dispute.created / updated / closed

Usar los eventos exactos exportados en `server/stripe-live.mjs`. Registrar solo después de disponer de un endpoint production que pueda verificar y persistir las entregas. No registrar un preview como destino live. El webhook no realiza cobros ni aprovisionamiento.

## Verificación realizada

`npm run test:stripe-live`: 8 pruebas locales con Stripe y almacenamiento simulados, sin llamadas a Stripe. Casos: cierre del acceso real, autorización privada, importe/periodicidad/impuesto incorrectos, territorios, alta+mes, idempotencia y orden de eventos, firma expirada/falsa, rechazo de test y pérdida de almacenamiento. `npm run build`: correcto. Las funciones y páginas de pruebas existentes no se modifican.

No confundir esas pruebas con Checkout live, entrega real del webhook, renovación o conciliación end-to-end: siguen pendientes. No se realizará pago real sin otra autorización explícita.

## Continuación tras autorizar acceso a Stripe activo

1. Leer cuenta live, ocho productos/precios y tasas; contrastar importes y periodicidad. `npm run audit:stripe-live` es una alternativa de solo lectura si existe clave restringida inyectada de forma segura; no imprime secretos ni datos fiscales personales. No llamarlo con clave test.
2. Completar IDs en catálogo y documentar diferencias reales; revisar IVA y requisitos de la cuenta. No cambiar precios aprobados silenciosamente.
3. Configurar secretos/variables production y endpoint live, conservando Checkout deshabilitado. Verificar permisos y almacenamiento sin cobrar.
4. Revisar despliegue cerrado, firma/entregas y registro, fiscalidad/facturación, contratos y operación de cancelación/recompra.
5. **DETENERSE**. Quitar el bloqueo de código y habilitar Checkout requiere autorización comercial posterior. Crear o compartir enlaces pagables también queda fuera de esta preparación.

Referencias técnicas: https://docs.stripe.com/api/checkout/sessions/create ; https://docs.stripe.com/webhooks ; https://docs.stripe.com/billing/subscriptions/webhooks ; https://docs.stripe.com/tax/tax-rates ; https://docs.stripe.com/keys-best-practices .

## Resultado del despliegue de preparación

PR borrador: https://github.com/joseluisbarcia/brcstudio-web/pull/20 .
Previsualización: https://deploy-preview-20--brcstudio-web.netlify.app .

Netlify completó correctamente el despliegue del código de la PR (`ready`, ocho funciones: cuatro existentes y cuatro nuevas). Comprobaciones HTTP realizadas sin secretos y sin crear sesiones:

| Ruta en preview | Resultado | Significado |
|---|---:|---|
| POST /api/stripe-live-checkout | 503 | Pagos reales bloqueados |
| GET /api/brc-live-sales | 401 | Registro privado inaccesible sin autorización |
| POST /api/stripe-live-webhook | 503 | Preview no admite webhook real |
| GET /api/stripe-live-return | 200 | Retorno neutro disponible |

La portada production y `/stripe-test.html` responden HTTP 200. El despliegue publicado de producción permanece igual al inspeccionado al inicio. No se ha fusionado la PR. La previsualización demuestra el empaquetado y los bloqueos; no demuestra autenticación live, persistencia real ni entregas desde Stripe activo. El siguiente cambio de esta rama solo añade este registro de resultados, sin otro despliegue.
