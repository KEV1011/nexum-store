# Dominio y correos de ZIPA

Sin esto, la política de privacidad publicada dice que el contacto es «el canal
de soporte dentro de la app». Eso es circular —quien la desinstaló no puede
pedir que borremos sus datos— y choca con dos cosas a la vez: **Play** exige que
la política sea accionable sin instalar nada, y la **Ley 1581 de 2012** obliga al
responsable a publicar un canal de atención al titular.

Y hay una razón práctica igual de fuerte: hoy las URLs legales viven en
`nexum-store.onrender.com`. Esas direcciones quedan dentro de la ficha de Play.
Con dominio propio se puede cambiar de hosting sin tocar un documento
publicado; sin él, mudarse rompe los enlaces que Google ya revisó.

---

## 1. El dominio

**Qué comprar.** Un `.com` si está libre; si no, `.com.co` o `.co`, que además
dan señal local. Evita guiones y nombres largos: va a ir impreso en la ficha de
Play y dicho por teléfono.

Candidatos que vale la pena mirar: `zipa.co`, `zipaapp.com`, `soyzipa.com`,
`zipa.com.co`. La disponibilidad cambia a diario, así que compruébala en el
momento de comprar.

**Dónde.** Cualquiera sirve; la diferencia es el precio de la renovación, que es
donde muerden.

| Registrador | Comentario |
|---|---|
| **Cloudflare Registrar** | Vende a precio de costo, sin sobreprecio en la renovación. Lo más barato a largo plazo |
| **Porkbun / Namecheap** | Baratos y sin trampas; los `.co` colombianos suelen estar aquí |
| GoDaddy | Primer año regalado y renovación cara. Mira el precio del **segundo** año antes de comprar |

Un `.com` ronda los 12–15 USD al año; un `.co`, 25–35.

**Activa la renovación automática.** Un dominio caducado tumba la web, los
correos y los enlaces legales que Play tiene registrados, todo el mismo día.

---

## 2. Los correos

Tres direcciones, aunque al principio las lea la misma persona:

| Dirección | Para qué | Dónde aparece |
|---|---|---|
| `soporte@` | Ayuda general, eliminar cuenta | Ficha de Play, app, portal |
| `privacidad@` | Habeas Data: consultas y reclamos sobre datos | Política de privacidad |
| `legal@` | Agente de retiros por derechos de autor | Términos, `docs/DMCA_AGENTE.md` |

Separarlas cuesta lo mismo hoy y evita tener que reeditar documentos legales ya
publicados el día que haya un equipo.

**Cómo tenerlas.** Dos caminos según si necesitas *responder* desde ellas:

- **Zoho Mail, plan gratuito** — *recomendado para empezar*. Buzones reales con
  tu dominio, hasta 5 usuarios, envío y recepción, sin costo. Es lo que
  necesitas: poder contestarle a un titular **desde** `privacidad@`.
- **Cloudflare Email Routing** — gratis y en cinco minutos, pero **solo
  recibe**: reenvía `soporte@tudominio` a tu Gmail personal. Sirve si de momento
  solo quieres que los correos lleguen. Para responder desde la dirección
  propia, necesitas lo anterior.
- **Google Workspace** — unos 7 USD por usuario al mes. Cómodo si ya vives en
  Gmail, pero no hace falta todavía.

> No uses tu Gmail personal. Esa dirección queda publicada en una ficha de
> tienda y en un documento legal, es tu nombre, y no se puede pasar a otra
> persona el día que delegues el soporte.

---

## 3. Configurarlas (cuando ya existan)

**Render → `nexum-api` → Environment:**

```
SUPPORT_EMAIL  = soporte@tudominio.co
PRIVACY_EMAIL  = privacidad@tudominio.co
LEGAL_EMAIL    = legal@tudominio.co
```

Solo `SUPPORT_EMAIL` es obligatoria: las otras dos la heredan si faltan. Una
dirección mal escrita **se descarta con un aviso en los registros** en vez de
publicarse rota.

**Render → `nexum-store` (el portal) → Environment:**

```
NEXT_PUBLIC_SUPPORT_EMAIL = soporte@tudominio.co
```

Va aparte porque Next.js la necesita al compilar y es otro servicio. Ponla igual
que la del backend y **vuelve a desplegar el portal**, o se queda con el valor
anterior dentro del bundle.

**Comprobar:** en `/health`, el campo `contactoLegal` debe pasar de
`sin-configurar` a `publicado`.

---

## 4. Publicar la política corregida

Esto es lo que mucha gente olvida: **cambiar la variable no cambia el documento
ya publicado.** El texto vigente vive en la base de datos, versionado, y se
sirve tal cual se guardó.

1. Entra a `/admin` → pestaña **SOS** → **Documentos legales**.
2. Verás la versión publicada de cada documento y un aviso si el canal de
   contacto sigue sin configurar.
3. **Publicar versión nueva** en Privacidad (y en Términos si también cambió).
   Usa la fecha de hoy como etiqueta.

> **Ojo con el momento.** El consentimiento se guarda **por versión**, así que
> publicar una nueva obliga a **todos** los usuarios a volver a aceptar. Con la
> plataforma vacía no cuesta nada; con mil usuarios es fricción para todos.
> **Hazlo antes de lanzar.**

Una etiqueta de versión no se puede reutilizar: dos textos distintos bajo el
mismo número harían que la constancia de consentimiento no probara nada.

---

## 5. Después, en Play

Con el dominio listo, actualiza en la ficha:

- Política de privacidad → `https://tudominio.co/legal/privacidad`
- Eliminación de cuenta → `https://tudominio.co/legal/eliminar-cuenta`
- Correo de contacto del desarrollador → `soporte@tudominio.co`

Y en Render, `PORTAL_BASE_URL` al dominio nuevo, que es de donde salen los
enlaces que se le mandan a los negocios.
