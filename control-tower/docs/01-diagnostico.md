# 01 — Diagnóstico: qué sabemos, qué suponemos y qué falta

> Todos los números de este documento salen de correr el motor sobre el export
> real del circuito 1060 (1 de junio – 1 de septiembre de 2026, 76.780 líneas).
> Son reproducibles: `engine/ct_run.py`. Donde algo es una hipótesis, lo dice.

---

## A. Inventario de la información

### A.1 Lo que tenemos y está verificado

| Fuente | Qué trae | Ventana | Grano | Estado |
|---|---|---|---|---|
| Export circuito 1060 (2 archivos) | 58 campos, 11 hitos de fecha por línea | 2026‑06‑01 a 2026‑09‑01 | línea de pedido | **verificado campo por campo** |
| Base "Problemas con el retiro/entrega" | encuesta con NPS, causa y zona | jul y ago 2026 | respuesta | verificado |
| Casos Salesforce | casos por mes, motivo, submotivo, sucursal | ene–ago 2026 | caso | verificado, **sin número de pedido** |
| Archivo de abastecimiento | maestro sucursal → CDR → zona | — | sucursal | 127 sucursales |

Del export, lo que quedó **probado** (no supuesto):

- **14.123 UT** (unidades de transporte) en la ventana. **Ninguna mezcla
  sucursales**: una UT tiene un destino único. Por eso la UT sirve como unidad de
  reclamo — identifica un bulto físico con un dueño.
- Una UT agrupa varios pedidos: mediana 2 líneas, p90 13, máximo 157.
- **La cadena de hitos es limpia**: 0% de inversiones en todas las transiciones
  salvo 34 líneas en alta→planificación y 10 en control→salida. El dato es sano.
- **Salvo un hito**: `fecfinrecepcdr` cierra *después* de `fecsalidacdr` en el
  **26,7%** de los casos (mediana 19,4 h después). No es un error de carga: la
  recepción del CDR se cierra por lote de la expedición de entrada, y esa
  expedición mezcla más de una sucursal en el **21,5%** de los casos (hasta 16).
  **Conclusión: ese hito no sirve para medir el paso por el CDR** y queda fuera de
  la cadena. Se mide `fecllegadacdr → fecsalidacdr`.
- Hay **cuatro circuitos distintos**, no uno, y mezclarlos deforma cualquier KPI:

| Circuito | Líneas | Promesa | Real p50 | Cumple | Nodos que atraviesa |
|---|---|---|---|---|---|
| Por CDR | 42.716 | 10 d | 8 d | 81,3% | MCR → CDR → sucursal |
| Directo MCR | 24.685 | 8 d | 5 d | 90,6% | MCR → sucursal |
| Provisión local | 886 | 9 d | **2 d** | **99,2%** | solo CDR |
| Andreani | 1.532 | 7 d | 7 d | **60,6%** | MCR → tercero |
| Sin circuito | 3.531 | 11 d | — | — | ninguno |

### A.2 Lo que es hipótesis y hay que validar

- **Los umbrales de las alertas.** Los de `reglas.yaml` están calibrados sobre
  esta ventana, pero un umbral que no acordó el responsable del nodo no se
  defiende en una reunión. Hay que sentarse con cada uno (ver 04, "Calibración").
- **Que la UT detenida sea un pendiente real y no un hito sin registrar.** En
  Andreani las dos cosas se ven igual desde el dato. Primera acción: pedir el
  estado de esas 179 UT. Cualquiera sea la respuesta, hay algo que arreglar
  (mercadería perdida, o reporte que no vuelve).
- **Que los tiempos de cola sean capacidad y no programación.** El dato dice
  dónde se espera, no por qué. Lo que sigue en 01.B.3 es una lectura, no una
  medición.

### A.3 Lo que NO tenemos — y hace falta pedir

| Falta | Por qué importa | Sin eso |
|---|---|---|
| **Definición de "UT" en tu pedido** | En el 1060, UT = **unidad de transporte**. Si en tu área "UT" significa **unidad de trabajo** de picking, es otro sistema y de eso no hay ni una fila. | Lo construido resuelve la lectura "unidad de transporte", que es la que el dato soporta y la que permite listar pendientes individualmente. Si querés la otra, hay que pedir el extracto del WMS. |
| **PUP 959** | **No aparece en ningún registro del export.** El único depósito de origen es 940 (48.279 líneas). Los otros depósitos que figuran son CDR de destino (005, 040, 054, 063, 064, 065, 079, 081, 099, 191, 254, 389) y 098 como base de transferencia. | No se puede decir nada sobre 959. Hay que averiguar qué es y dónde vive su dato. |
| Pedido en los casos de Salesforce | Permitiría cruzar reclamo contra recorrido, caso por caso | Hoy solo se cruza a nivel sucursal/mes (correlación 0,75 entre tasa de call center y tasa de encuesta por sucursal) |
| Dotación y turnos por nodo | Separar "falta gente" de "está mal programado" | El ROI de capacidad queda como escenario ilustrativo, no como número |
| Costo de un reenvío y de una hora de operario | Convertir el impacto en pesos | Se mide en horas y en envíos, no en plata |
| Frecuencia real de actualización del 1060 | Define cada cuánto puede correr el motor | No se puede prometer monitoreo "en tiempo real" |

> **Nada de lo anterior bloquea el MVP.** Lo que falta limita el alcance de los
> módulos 4 y 5, no el núcleo.

---

## B. Los tres problemas con mayor potencial de mejora

### B.1 — La promesa está mal puesta en 30 de 124 sucursales

**Evidencia** (regla R05, 13.566 envíos afectados):

| Sucursal | Promete | Mediana real | p90 | Incumple |
|---|---|---|---|---|
| 387 Hipermercado Rosario | 5 d | **9 d** | 14 d | **78,4%** |
| 388 Hipermercado Rafaela | 5 d | 9 d | 15 d | 69,0% |
| 960 Depósito 30 Noviembre | 8 d | 12 d | 24 d | 55,4% |
| 378 Hipermercado Rivera Indarte | 5 d | 9 d | — | — |

En estas sucursales **más de la mitad de los envíos nacen incumplidos**. No es un
problema de operación: con el tiempo real actual, el plazo no se cumple ni
trabajando perfecto.

Y el reverso, que es igual de caro: **provisión local promete 9 días y entrega en
2, con 99,2% de cumplimiento**. Son **7 días de holgura que no se usan** — se
está prometiendo lento algo que se entrega rápido.

**Por qué importa:** es la corrección más barata de todo el tablero. Es cambiar un
parámetro. Cuesta cero en operación y mueve directamente el NPS, porque un cliente
no se enoja por esperar nueve días: se enoja porque le dijeron cinco.

### B.2 — Hay pendientes que hoy nadie puede listar

**Evidencia** (reglas R01, R02, R09):

| Bolsón | Cantidad | Antigüedad | Detalle |
|---|---|---|---|
| UT detenidas sin cerrar | **973** | 188 con más de 5 días | repartidas en 8 etapas |
| ↳ de ellas, en Andreani | **179 UT** | **mediana 47 d, máx 90 d** | salieron de MCR y no volvieron a reportar |
| Líneas sin circuito ni anulación | **416** | mediana 10 d, máx 88 d | 100 sucursales, 393 con backorder |
| Backorder envejecido | 143 líneas | mediana 12 d, máx 64 d | 65 sucursales |

El caso de las 416 líneas es el más invisible del sistema: **el pedido existe, el
cliente lo pagó, no tiene depósito asignado, no está anulado y no aparece en
ningún tablero de operación** porque nunca entró a un circuito. Nadie lo está
mirando, y el cliente tampoco recibe ninguna novedad.

**Por qué importa:** este es, literalmente, el problema que planteaste —
"dificultad para identificar individualmente las UT atrasadas". El dato para
resolverlo **ya existe**. Lo único que falta es la consulta y el circuito de
gestión. Es el problema con mejor relación impacto / esfuerzo / facilidad de
validación de los tres, y es el único de los tres que **requiere un sistema** en
lugar de una decisión.

### B.3 — El ciclo es mayormente cola, no trabajo

**Evidencia** (circuito por CDR, 42.140 envíos completos):

| Etapa | Horas (media) | % del ciclo | Tipo |
|---|---|---|---|
| Espera a planificación | 48 h mediana / 77 h media | — | cola (batch 04:30) |
| Pulmón de picking MCR | 11,1 | 7,4% | trabajo |
| Control MCR | 7,1 | 4,7% | trabajo |
| **Cola de despacho MCR** | **30,7** | **20,3%** | **espera del camión** |
| Tránsito MCR → CDR | 54,4 | 35,9% | viaje |
| Dentro del CDR | 33,4 | 22,1% | mixto |
| Tránsito CDR → sucursal | 14,7 | 9,7% | viaje |

Dentro de MCR: **18,2 h de trabajo real contra 30,7 h esperando el camión**. El
63% del tiempo que una mercadería pasa en MCR es esperando que salga, no
procesándose. Y antes de todo eso, la espera al batch de planificación tiene una
mediana de 2,0 días pero un **p90 de 8,7 días**: la cola no es pareja, hay un
grupo que espera muchísimo.

**Por qué importa:** es el mayor potencial estructural. **Por qué no es el MVP:**
tocar frecuencias de despacho implica negociar con transporte y con MCR, el ciclo
de validación es de meses, y la evidencia actual dice *dónde* se espera pero no
*por qué*. Es la fase 2.

---

## C. Qué priorizar y por qué

| | Impacto | Viabilidad | Facilidad de validar | ¿Necesita un sistema? |
|---|---|---|---|---|
| B.1 promesa | **alto** | **alta** (cambiar un parámetro) | **alta** (se mide en 30 días) | no |
| B.2 pendientes | alto | **alta** (el dato ya existe) | **alta** (se cuenta) | **sí** |
| B.3 colas | **muy alto** | baja (negociación) | baja (meses) | no todavía |

**La decisión:**

1. **B.1 se entrega como informe en la semana 1.** No necesita desarrollo y paga
   el proyecto antes de que el proyecto exista. Es la carta de presentación.
2. **B.2 es el MVP del Control Tower.** Es gestión por excepciones real: lista
   diaria, responsable, acción, seguimiento y verificación de cierre.
3. **B.3 queda documentado como la oportunidad grande,** con la medición ya hecha,
   para abrirlo cuando el Control Tower esté funcionando y haya con qué sostener
   la discusión.

Lo que **no** vamos a hacer, y conviene decirlo: otro tablero de KPIs. Los
indicadores ya existen y ya se miran. Lo que no existe es la lista de qué hay que
hacer hoy y quién lo tiene.
