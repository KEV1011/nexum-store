# RNDC — qué es, qué nos obliga y qué falta

> Estado: **preparado, no integrado**. El portal reúne los datos y guarda la
> constancia; el reporte lo sigue haciendo la empresa en el portal del
> Ministerio. Lo que falta para automatizarlo está al final, y **necesita a
> alguien que conozca la norma** antes que a un programador.

## Qué es

El **Registro Nacional de Despachos de Carga** es el sistema del Ministerio
de Transporte donde las empresas de transporte de carga **habilitadas**
reportan sus despachos. Se reportan, básicamente, dos documentos:

- La **remesa terrestre de carga** — quién manda, quién recibe, qué va y
  cuánto pesa.
- El **manifiesto electrónico de carga** — qué empresa, qué vehículo, qué
  conductor, qué viaje y por cuánto.

No es papeleo opcional: sin manifiesto el viaje no es legal, y es lo que
pide la policía de carreteras en un retén.

## Quién reporta, y por qué eso lo cambia todo

**Reporta la empresa habilitada, con su usuario y su clave del Ministerio.**

ZIPA no es una empresa de transporte habilitada. Las que usan el portal sí
lo son. Eso significa que nuestro papel **no puede ser** reportar en nombre
de nadie — no tenemos credenciales ni habilitación, y hacerlo con las de
ellas nos pondría a firmar trámites de Estado por cuenta ajena.

Lo que sí podemos hacer, y es lo que está hecho:

1. **Tener listos los datos que el RNDC pide.** Hoy la empresa los recopila
   a mano de cuatro sitios distintos para cada viaje.
2. **Decirle qué le falta** antes de que se siente a reportar.
3. **Guardar la constancia** de lo reportado, con sus dos números, para que
   el viaje se pueda auditar meses después.

## Qué datos pide, y de dónde salen hoy

| Dato | De dónde sale | ¿Lo tenemos? |
|---|---|---|
| NIT de la empresa | `Operator.nit` | Sí |
| Placa del vehículo | `CargoTrip.vehiclePlate` (sellada al despachar) | Sí |
| Cédula del conductor | `Driver.documentNumber` | Sí, si la cargó |
| Licencia de conducción | `Driver.licenseNumber` | Sí, si la cargó |
| Código DANE origen/destino | `Municipality.daneCode` | **Solo los cargados** |
| Remitente identificado | `FreightRequest.sender*` | Sí, en fletes del marketplace |
| Destinatario | `FreightManifest.clientName` | Sí |
| Peso total | `CargoTrip.weightKg` | Sí |
| Descripción de la mercancía | `FreightRequest.cargoDescription` | Sí |
| Valor del flete | `CargoTrip.freightAmount` | Sí |
| Pago al conductor | `CargoTrip.driverPayAmount` | Sí (nuevo) |

`GET /operator/cargo-trips/:id/rndc` devuelve esa tabla rellena y la lista
de lo que falta, con un texto que dice **dónde** se arregla cada cosa.

### Dos huecos conocidos

- **Códigos DANE.** `Municipality.daneCode` es opcional y no todos los
  municipios cargados lo tienen. Es pendiente NUESTRO, y el mensaje al
  despachador lo dice así («avísanos para cargarlo») en vez de mandarlo a
  buscar un código que el portal debería saber.
- **Remitente en viajes creados desde el portal.** Un viaje que la flota
  crea ella misma todavía no pide remitente; solo lo traen los que vienen de
  un flete del marketplace. Se ve como faltante, que es lo honesto:
  rellenarlo con el nombre de la empresa sería declarar remitente a quien no
  lo es.

## La constancia

`POST /operator/cargo-trips/:id/rndc` con `{ remesa, manifiesto }`.

**Se exigen los dos números.** Un manifiesto sin su remesa no describe un
despacho completo, y guardar medio reporte haría figurar el viaje como
reportado cuando no lo está — que es justo la constancia que falla el día
que la piden. El mismo número pegado en los dos campos también se rechaza:
casi siempre es un error de copiar y pegar y deja algo que no se puede
cruzar con nada.

No se comprueba contra el Ministerio, porque no hablamos con él: esto es
literalmente **lo que la empresa declara haber reportado**. Vale lo que vale
una constancia — queda por escrito quién dijo qué y cuándo.

Se puede corregir mientras el viaje siga siendo suyo: quien se equivoca al
teclear lo arregla, y no hay nada que anular porque el trámite real vive en
otro sistema. La fecha se reescribe con la corrección, para no afirmar una
hora que no fue.

## Lo que deliberadamente NO se hizo

### No se habla con el web service

La integración existe: es un servicio **SOAP** con usuario y clave por
empresa. Su especificación **no se puede verificar desde el entorno de
desarrollo**, y un XML escrito de memoria contra un sistema del Estado no es
«un primer intento»: es un despacho rechazado, o peor, uno aceptado con
datos equivocados a nombre de una empresa real que responde por él.

### No se valida el flete mínimo

El RNDC rechaza un manifiesto por debajo del costo de referencia del
**SICE-TAC** para esa ruta y esa configuración de vehículo. Esa tabla la
publica el Ministerio y cambia. Inventarla haría que el portal aprobara
fletes que el Ministerio después rechaza, que es peor que no decir nada.

### El interruptor está apagado

`RNDC_EXIGIR=true` haría que un viaje sin constancia no se pueda despachar.
Está **apagado por defecto** y no por duda: encenderlo hoy pararía camiones
cargados de empresas que reportan en el portal del Ministerio y anotan el
número después. Se enciende cuando el flujo esté rodado — el patrón de
`KYC_ENFORCE` y `DOC_KILL_SWITCH_ENFORCE`.

## Qué hace falta para automatizarlo

En este orden, y los tres primeros **no son trabajo de programación**:

1. **Alguien que conozca la norma.** Qué viajes obligan a reportar y cuáles
   no (el acarreo urbano y el transporte propio tienen reglas distintas),
   qué plazos hay y qué pasa si se reporta tarde.
2. **La documentación oficial del web service**, con los nombres de los
   procesos y los catálogos de códigos. Sin eso no se puede escribir nada
   que no sea adivinanza.
3. **Una empresa habilitada dispuesta a prestar su usuario de pruebas.** La
   integración se prueba contra el ambiente del Ministerio con credenciales
   reales; no hay forma de simularlo bien.
4. Entonces sí: el cliente SOAP, el mapeo de nuestros datos a sus campos, el
   manejo de rechazos (que hay que enseñar al despachador tal como vienen) y
   el guardado automático de los dos números donde hoy se escriben a mano.

Mientras tanto, la pieza que está hecha ya quita la parte cara del trabajo:
recopilar los datos. Lo que queda es teclearlos una vez en el portal del
Ministerio y anotar los dos números de vuelta.
