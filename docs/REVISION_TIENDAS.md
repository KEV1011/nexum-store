# Publicar en App Store y Play — lo que la revisión va a mirar

Guía operativa para la primera publicación. Cada punto es un motivo real de
rechazo, no una recomendación.

---

## 1. La cuenta con la que entra quien revisa (bloqueante)

El login de ZIPA es **solo por SMS**. Quien revisa la app está en California o
en Dublín, no tiene un número colombiano y **no va a recibir ese SMS**. Sin una
forma de entrar, la revisión rechaza la ficha sin llegar a ver el producto
(Apple, guía 2.1; Google pide lo mismo).

Por eso existe una cuenta de demostración que se habilita con dos variables en
Render, y que **solo funciona para ese número**:

```
REVIEW_DEMO_PHONE=+573000000000     # un número que controles tú
REVIEW_DEMO_CODE=<6 dígitos>        # el código que pondrás en las notas
```

Con eso, pedir el código para ESE teléfono no manda ningún SMS (ni gasta saldo
de Twilio) y el código fijo que definiste es el válido. **Cualquier otro
teléfono sigue el flujo normal.** A diferencia del código de piloto, esto no es
una llave maestra: abre una cuenta y solo una.

Comprobar que está activa: `GET /health` → `"demoRevision": true`.

**En las notas para el revisor**, escribe literalmente:

> Login is by SMS code. Use phone `+57 300 000 0000` and code `XXXXXX`.
> No SMS will be sent to this number — the code above is fixed for review.

Prepara la cuenta antes de enviar: entra con ella y deja un par de viajes en el
historial. Una app vacía se revisa peor que una con datos.

---

## 2. Eliminar la cuenta desde la app (bloqueante)

Apple y Google exigen que quien crea una cuenta desde la app pueda borrarla
desde la app — no por correo, no desde una web.

- **Cliente:** Cuenta → *Eliminar mi cuenta*
- **Conductor:** Ajustes → *Eliminar mi cuenta*

Qué hace: anonimiza la cuenta (teléfono a valor lápida, datos personales
fuera), cierra la sesión y deja el número libre para registrarse de nuevo.
**No borra la fila**, y eso es deliberado: los viajes ya liquidados llevan la
comisión de la plataforma y lo que cobró el conductor, y sostienen la
liquidación de su empresa, sus cuentas de cobro y sus remitos. Es contabilidad
de terceros con obligación de conservación. La pantalla se lo explica al
usuario antes de que confirme.

Un servicio en curso lo bloquea, con el motivo en pantalla. Detalles en
`backend/src/services/account-deletion.service.ts`.

---

## 3. Manifiesto de privacidad de iOS

`AppCliente/ios/Runner/PrivacyInfo.xcprivacy` y el equivalente del conductor.
Ya están escritos y **registrados en el proyecto Xcode** (sin esa entrada el
archivo existe en disco pero no se empaqueta, y App Store Connect rechaza la
subida igual que si no existiera).

**Al añadir un dato nuevo hay que tocar tres sitios o los tres se contradicen:**
el manifiesto, `docs/PRIVACIDAD_DATOS.md` y la ficha de la tienda.

---

## 4. Pagos

Hoy Wompi **no está configurado** y las apps lo saben: `GET /client/config`
devuelve `pagoEnLinea: false` y el selector de método de pago ofrece solo
efectivo. Un botón "Pagar en línea" que abre un checkout que no cobra nada es
motivo de rechazo, además de una mentira al usuario.

Al configurar las llaves de Wompi el botón vuelve solo, sin tocar código.
Comprobar: `GET /health` → `"pagos": "wompi"`.

**Ojo con la comisión de Apple:** transporte y domicilios son bienes y
servicios del mundo físico, así que van por pasarela externa y **no** por
compra dentro de la app. No introduzcas suscripciones ni monedas virtuales sin
revisar la guía 3.1.1 antes: eso sí obligaría a usar In-App Purchase.

---

## 5. Permisos: pedirlos cuando se entienden

Los textos de `Info.plist` ya explican para qué se usa cada permiso. Lo que la
revisión castiga es pedirlos todos de golpe al abrir. Ubicación en segundo
plano (app del conductor) es el que más se mira: tiene que quedar claro que es
para recibir viajes con la pantalla apagada.

---

## 6. Antes de enviar

- [ ] `REVIEW_DEMO_PHONE` y `REVIEW_DEMO_CODE` en Render, y probados
- [ ] `/health` → `demoRevision: true`, `otpRiesgo: false`, `pilotSkipVerification: false`
- [ ] Cuenta de demostración con historial (no vacía)
- [ ] Probado *Eliminar mi cuenta* en un dispositivo real, en las dos apps
- [ ] Política de privacidad publicada y enlazada desde la ficha
- [ ] Capturas de pantalla sin datos personales de nadie real
