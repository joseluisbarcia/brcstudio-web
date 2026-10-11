# BRC Studio — Preparación de cobros reales (NO ACTIVADOS)

**Estado:** documentación de preparación. El sistema actual es exclusivamente de prueba. No utilizar enlaces de prueba para cobrar clientes.

## 1. Precios comerciales aprobados para revisión

| Modalidad | Base imponible | IVA orientativo 21 % | Total con IVA |
| --- | ---: | ---: | ---: |
| Compra web (pago único) | 490,00 € | 102,90 € | 592,90 € |
| Alta plan mensual | 149,00 € | 31,29 € | 180,29 € |
| Primera mensualidad | 39,00 € | 8,19 € | 47,19 € |
| Alta + primer mes | 188,00 € | 39,48 € | 227,48 € |
| Mensualidad posterior | 39,00 € | 8,19 € | 47,19 € |

**Atención fiscal:** los totales anteriores presuponen una operación española sujeta al tipo general del 21 %. Antes de activar cobros reales, validar con asesoría la situación fiscal, tipo de cliente, territorio, exenciones y operaciones internacionales. No aplicar 21 % de forma universal.

## 2. Evidencia de pruebas completadas (11 octubre 2026)

- Checkout de compra: pago simulado confirmado por Stripe, 592,90 €.
- Checkout de plan mensual: pago simulado confirmado por Stripe, 227,48 €.
- Webhook de prueba: firma validada y evento de compra entregado con HTTP 200.
- Almacenamiento: Netlify Blobs, `brc-test-sales`, registros únicos por Checkout.
- Panel privado: `https://brcstudio.es/admin/ventas`, autenticación por `BRC_ADMIN_PASSWORD`, tarjetas móviles.
- Total visible en el panel tras ambas pruebas: 820,38 €, **sin dinero real**.
- **No está demostrado** todavía: ciclo completo de renovación mensual, cancelación y reembolso, facturación real, disputa, fallos de cobro o reconciliación bancaria.

## 3. Situación del código actual

- `netlify/functions/stripe-test-checkout.mjs` utiliza exclusivamente `STRIPE_TEST_SECRET_KEY` con prefijo `sk_test_`, y precios `STRIPE_TEST_PRICE_*`.
- `netlify/functions/stripe-test-webhook.mjs` rechaza eventos con `livemode !== false` y registra solo Checkout de pruebas internos.
- `netlify/functions/brc-admin-sales.mjs` consulta únicamente ventas de prueba.
- Página de prueba: `/stripe-test.html`. No debe presentarse como método de pago a clientes.
- No reutilizar los precios, secretos, endpoints ni registros de prueba como si fueran de producción.

## 4. Bloqueos antes de producción

- [ ] Confirmar que la cuenta de Stripe para cobros reales está activada y verificada (titularidad, datos fiscales, cuenta bancaria, representantes).
- [ ] Verificar identidad fiscal del vendedor y datos obligatorios de facturas con asesoría.
- [ ] Aprobar oferta comercial definitiva y contratos de compra/mantenimiento: entregables, propiedad del dominio y código, soporte, renovación, cancelación sin permanencia, transferencia y posible recompra.
- [ ] Revisar legalmente condiciones generales, privacidad, cookies si aplica y derecho de desistimiento cuando corresponda; distinguir clientes empresa/autónomo de consumidores.
- [ ] Determinar tratamiento de IVA por ubicación y tipo de cliente. Evitar asumir que una tasa fija sirve para todas las ventas.
- [ ] Configurar productos y precios **live** separados de los de prueba, y método de impuestos validado.
- [ ] Crear secreto **live** de Stripe en Netlify con acceso restringido; nunca almacenarlo en GitHub.
- [ ] Crear webhook **live** separado con firma propia y eventos adecuados para pagos, suscripciones, facturas, fallos, cancelaciones y reembolsos.
- [ ] Crear almacenamiento y panel **live** separados de pruebas; registrar eventos de manera idempotente y conciliable, con acceso restringido.
- [ ] Gestionar estados de suscripción: activa, impagada, cancelación al fin de período, reintentos y fin de servicio; no suspender la web de un cliente por un evento aislado.
- [ ] Configurar facturación, numeración, datos fiscales y envío de justificantes/facturas conforme a obligaciones aplicables.
- [ ] Verificar branding, correo de soporte `jose@brcstudio.es`, URLs de políticas y mensajes de Checkout.
- [ ] Validar entorno de producción con un pago real **solo tras autorización explícita**, importe y condiciones acordados.
- [ ] Documentar procedimiento de reembolso, incidencias y conciliación.

## 5. Recomendación de arquitectura

Mantener Stripe Checkout alojado para compra y suscripción. Crear funciones de producción **separadas**, nunca cambiar las funciones `stripe-test-*` para que acepten pagos live. Evitar habilitar productos de coste adicional (p. ej., cálculo automático de impuestos o funcionalidades de pago) sin revisar tarifas y obtener aprobación.

Para ventas asistidas por WhatsApp, primero recopilar datos del cliente y aceptar presupuesto/condiciones; después generar un Checkout específico y comunicarlo de forma privada. No activar enlaces genéricos de producción antes de que estén cerradas condiciones, fiscalidad y facturación.

## 6. Próxima acción humana indispensable

Revisar el **estado de activación live de Stripe** en el Dashboard y completar los datos fiscales/identidad/bancarios que Stripe solicite. No compartir contraseñas, claves secretas ni datos bancarios por el chat. Hasta entonces, mantener todas las operaciones en prueba.
