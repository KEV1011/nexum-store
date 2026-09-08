# Cómo se mide el piloto

Un mes de operación real en una plaza, con las cifras delante, para decidir con
datos si el negocio existe antes de abrir otra ciudad.

El panel ya calcula todo lo que hay aquí. Este documento es lo otro: **qué
significa cada número, cuál mirar primero y qué decisión sale de cada uno.** Sin
esto, al final del mes hay tres gráficas y ninguna conclusión.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Las tres cifras | `/admin` → **Métricas** → «El piloto en tres cifras» |
| Una sola ciudad | Selector de plaza, arriba a la derecha |
| Sacar los datos | Botón **Descargar CSV** (respeta el rango y la plaza elegidos) |
| Por qué un conductor no recibe viajes | **Conductores** → Diagnóstico de despacho |

El CSV se abre en Excel en español (separador `;`, coma decimal). Guarda uno
**cada lunes**: el panel solo sabe del presente, y el piloto se juzga
comparando la semana tres con la primera.

---

## Las tres cifras, en orden de importancia

### 1. Tasa de emparejamiento — «¿hay conductores suficientes?»

De cada 100 personas que piden un viaje, cuántas consiguen conductor.

**Es la primera porque es la única que rompe el negocio en silencio.** Si un
pasajero pide y no aparece nadie, no se queja: desinstala. El resto de las
cifras pueden verse bien mientras esta se hunde, porque los que se fueron ya no
piden y por lo tanto ya no cuentan.

- **Sube** metiendo más conductores en línea, o concentrándolos en las horas y
  la zona donde de verdad se pide.
- **Ojo con el radio:** el despacho busca a 5 km. Un conductor conectado al otro
  lado del municipio no existe para quien pide en el centro.
- Al lado del porcentaje van las dos cifras crudas («13 de 16»). Míralas: un
  80 % sobre 5 viajes no es lo mismo que un 80 % sobre 500.
- Cuando no hubo solicitudes, el panel dice **«No hubo solicitudes»**, no «0 %».
  Un cero ahí acusaría al despacho de un fallo que no cometió.

### 2. Retención semanal — «¿la gente vuelve?»

De quienes pidieron la semana pasada, cuántos volvieron a pedir esta.

Es la cifra que separa un negocio de una promoción. Se puede llenar una ciudad
de viajes durante dos semanas con descuentos y novedad; lo que dice si hay algo
real es cuánta de esa gente vuelve sola.

- **Con menos de diez personas de base, el panel enseña la fracción («1 de 2») y
  se calla el porcentaje.** No es un fallo: «50 %» sobre dos personas es una
  anécdota, y en las primeras semanas de un piloto ese es justo el número que va
  a salir. No lo cites en una reunión.
- Espera al menos a la tercera semana para que signifique algo.

### 3. Viajes por día — «¿crece?»

La serie diaria, con los días vacíos dibujados a propósito: si desaparecieran,
un mes con dos semanas muertas se leería como un mes entero de actividad.

Míralo por **semanas, no por días**. Un martes flojo no es información; tres
semanas planas sí. Y compara días equivalentes: un sábado contra un sábado.

---

## La rutina semanal (20 minutos, los lunes)

1. Abre el panel con **la plaza del piloto seleccionada**.
2. Descarga el CSV de 30 días y guárdalo con la fecha.
3. Anota las tres cifras de la semana que cerró.
4. Mira **los avisos de arriba** (servicios sin conductor, viajes sin cierre):
   son problemas de hoy, no del mes.
5. Escribe **una frase** con lo que cambió y por qué crees que cambió. Al cabo
   de cuatro semanas esas cuatro frases valen más que las gráficas.

---

## Qué decidir al final del mes

Estos cortes **no salen de ningún estudio: son una propuesta para acordar antes
de empezar.** Su valor está en fijarlos por adelantado, cuando todavía no hay
un número que defender.

| Situación | Lectura | Qué hacer |
|---|---|---|
| Emparejamiento bajo y viajes que crecen | Hay demanda y falta oferta | No abras otra ciudad. Mete conductores en esta. |
| Emparejamiento alto y viajes planos | Hay oferta y falta demanda | Problema de difusión o de precio, no de producto. |
| Los dos bien y retención baja | Vienen y no vuelven | Algo del servicio no convence. Pregúntaselo a los que no volvieron. |
| Los tres subiendo tres semanas seguidas | El piloto funciona | Ahora sí, segunda ciudad. |
| Los tres planos el mes entero | No hay señal | Cambiar algo grande, no seguir esperando. |

**Regla que evita el autoengaño:** decide el corte de cada casilla **antes** de
ver los números de la semana. Después siempre hay una razón para que el número
malo sea una excepción.

---

## Lo que estas cifras NO dicen

Vale la pena tenerlo escrito para no atribuirles conclusiones que no sostienen:

- **Solo cuentan viajes de pasajeros.** Mandados, pedidos e intermunicipales no
  entran: no llevan plaza sellada todavía.
- **Filtrar por ciudad deja algunos números en «—»**, no en cero: los pagos y el
  SOS no están repartidos por plazas. El guion significa «no se sabe», que es
  distinto de «no pasó nada».
- **«Usuarios» cambia de significado al filtrar:** pasa a ser «pasajeros con
  viajes aquí». Alguien que se registró y nunca pidió no aparece.
- **Un conductor pertenece a la plaza donde dio su último latido**, no a donde
  vive. Si se muda de ciudad, cambia de plaza en cuanto se conecte allí.
- **No hay cifra de cancelaciones del pasajero** separada de las del sistema en
  este bloque; la operación del día sí las tiene arriba.

---

## Quién opera la ciudad

Un administrador puede quedar **atado a una plaza** con `ADMIN_PHONES`:

```
ADMIN_PHONES="+573001112233,+573004445566:cucuta"
```

El primero ve toda la plataforma. El segundo queda atado a Cúcuta: su selector
se bloquea y el servidor ignora cualquier otra ciudad que pida, aunque edite la
dirección del navegador.

Quitarle o cambiarle la plaza tiene efecto en cuanto recargue: el alcance se
relee de la configuración en cada petición, no se guarda en su sesión.

### Hasta dónde llega hoy ese límite

**El filtro por ciudad alcanza a tres pantallas: las métricas de operación, las
tres cifras del piloto y la lista de conductores.** El resto del panel
—empresas, clientes, negocios, verificación de documentos, SOS, soporte,
retiros, promociones— sigue siendo global, y las acciones sobre una ficha
concreta (verificar un conductor, aprobar un retiro) no comprueban de qué
ciudad es.

O sea: un administrador atado a una plaza **ve sus números, pero no está
encerrado en ella**. Sirve para que quien lleva una ciudad mire lo suyo sin
ruido de las demás; **no sirve todavía para dar acceso a alguien externo en
quien no se confía para el resto de la operación.** Cerrarlo del todo es
trabajo pendiente: son unas cuarenta rutas y cada una necesita saber a qué
ciudad pertenece la ficha que toca.
