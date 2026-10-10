# 03 — Diccionario de indicadores

Cada indicador con su fórmula, su **denominador explícito**, su frecuencia y sus
límites. Un KPI sin denominador escrito es un KPI que en algún momento alguien va
a calcular distinto.

**Dos relojes, y hay que respetarlos:**
- Los **tiempos de etapa** van en **horas reales**. La planificación corre en un
  batch de las 04:30 y la gente compra a la tarde: un tramo 18:20 → 04:26 son 10
  horas, pero contado en días calendario sumaba un día entero que no existió.
- El **cumplimiento** va en **días calendario**, porque así está expresada la
  promesa al cliente.

**Dónde termina nuestro reloj:** en `fecrec_item` (la sucursal recibe el ítem).
`fecentregado` es cuando el cliente pasa a buscarlo y no es tiempo nuestro.

---

## Volumen y cobertura

| Indicador | Fórmula | Denominador | Frecuencia | Límite |
|---|---|---|---|---|
| **Envíos** | `COUNT(DISTINCT pedido + fecha de alta)` | — | diaria | Un pedido con reenvío cuenta como 2 envíos. Es intencional: son dos intentos. |
| **Líneas** | filas del export | — | diaria | El grano es (pedido, línea, fecha de alta). |
| **UT** | `COUNT(DISTINCT unidadtransporte)` | — | diaria | 6,1% de las líneas no tienen UT; no entran. |
| **Cobertura de medición** | líneas cerradas ÷ líneas | todas las líneas no anuladas | diaria | **Si cae, todo KPI de tiempo pierde confiabilidad.** Se muestra antes que los tiempos. |

## Cumplimiento

| Indicador | Fórmula | Denominador | Límite |
|---|---|---|---|
| **Cumplimiento %** | envíos con `días_real ≤ leadtimetotal` ÷ base | envíos **cerrados** y con `leadtimetotal > 0` | Si se usan todos los envíos, el indicador **sube cuando falta información**. |
| **Días de ciclo (p50)** | mediana de `fecrec_item − fecaltaped` | envíos cerrados | Mediana y no promedio: la cola de valores altos corre el promedio. |
| **Días de ciclo (p90)** | percentil 90 | envíos cerrados | Es el número que siente el cliente insatisfecho, no el p50. |
| **Holgura de la promesa** | `promesa_p50 − real_p50` | sucursales con ≥30 envíos | **Negativa = la promesa está mal puesta.** Positiva y grande = holgura sin usar. |

> **El plazo prometido ya incluye la venta verde.** Verificado: `leadtimetotal =
> leadtimevtaverde + plazo propio de la ruta` en el 98,0% de las líneas con venta
> verde. No hay que sumar el tiempo del proveedor aparte; medir contra
> `leadtimetotal` es correcto.

## Tiempos por etapa

| Indicador | Fórmula | Límite |
|---|---|---|
| **Horas en etapa (p50)** | mediana de `hito_cierra − hito_abre`, en horas | Solo líneas con ambos hitos. |
| **Referencia de la etapa** | mediana de la misma etapa **entre los envíos que llegaron en fecha** | **No es el promedio general**: ese ya viene contaminado por los que se pasan y vuelve el umbral más indulgente de lo que corresponde. |
| **Exceso sobre la referencia** | `p50 del nodo ÷ referencia` | Para transporte, la referencia son **los pares del mismo CDR**, no la red: una sucursal lejana tarda más por geografía y marcarla por eso sería culpar al mapa. |

**Etapas definidas** (cambian según el circuito — ver `engine/ct_modelo.py`):

| # | Etapa | Abre | Cierra | Nodo | Tipo |
|---|---|---|---|---|---|
| 1 | Pulmón de picking | `fecplanificacion` | `fecpicking` | MCR | trabajo |
| 2 | Control | `fecpicking` | `feccontrolado` | MCR | trabajo |
| 3 | Cola de despacho | `feccontrolado` | `fecsalidacdrweb` | MCR | **espera** |
| 4 | Tránsito MCR→CDR | `fecsalidacdrweb` | `fecllegadacdr` | Transporte | viaje |
| 5 | Dentro del CDR | `fecllegadacdr` | `fecsalidacdr` | CDR | mixto |
| 6 | Tránsito CDR→sucursal | `fecsalidacdr` | `fecrec_item` | Transporte | viaje |
| 7 | Tránsito MCR→sucursal | `fecsalidacdrweb` | `fecrec_item` | Transporte | viaje (circuito directo) |
| 8 | En Andreani | `fecsalidacdrweb` | `fecrec_item` | Andreani | tercero |

`fecfinrecepcdr` **no se usa**: cierra por lote y es posterior a `fecsalidacdr` en
el 26,7% de los casos.

## Pulmón (WIP)

| Indicador | Fórmula | Límite |
|---|---|---|
| **Líneas en cola** | abrió la etapa y no la cerró a la fecha | **Censura de borde**: en los últimos días toda línea en vuelo figura en cola porque su cierre todavía no ocurrió. |
| **Cola (mediana móvil 7d)** | mediana de los 7 días que terminan 3 días antes del corte | Así se lee la tendencia sin el sesgo del borde. |
| **Cola envejecida (>N días)** | en cola **y** abierta hace más de N días | **Métrica robusta**: una línea que entró ayer no puede llevar 5 días. Es la que conviene mirar a diario. |

## Pendientes

| Indicador | Fórmula | Límite |
|---|---|---|
| **UT detenidas** | UT sin `fecrec_item`, no anuladas | — |
| **Días detenida** | `corte − último hito registrado` | **El corte sale del dato, no de `GETDATE()`.** Si el export tiene 3 días de atraso, usar hoy inventa 3 días en todas las filas. |
| **Antigüedad del pendiente más viejo** | máximo de días detenida | El indicador que hay que bajar. Un pendiente viejo no es uno más: es uno que ya no se le puede explicar al cliente. |

## Experiencia del cliente (fuentes externas al 1060)

| Indicador | Fórmula | Límite |
|---|---|---|
| **Tasa de reclamo por sucursal** | casos ÷ pedidos del mismo período | **El denominador tiene que ser el mismo período que el numerador.** Dividir casos ene–ago por pedidos jun–ago da 268 por mil en lugar de 96 — un error que ya cometí y corregí. |
| **Tasa de encuesta con problema** | respuestas con causa ÷ respuestas | Sesgo de participación: contesta más quien tuvo un problema. Sirve para comparar sucursales entre sí, no como nivel absoluto. |
| **Correlación reclamo ↔ encuesta** | Pearson entre ambas tasas por sucursal | Medido: **0,75**. El call center tiene 19× más densidad de señal (96 vs 4,95 por mil). **Correlación, no causalidad.** |

## Gestión del propio sistema

Sin estos, no se puede saber si el Control Tower sirve o solo acumula alertas.

| Indicador | Fórmula | Para qué |
|---|---|---|
| **Alertas activas** | estado ≠ resuelta | Carga de trabajo |
| **Tasa de resolución** | resueltas ÷ total | ¿se usa? |
| **Días hasta resolver (p50)** | mediana de `resuelta − detectada` | ¿se usa rápido? |
| **Alertas reincidentes** | abiertas ≥3 semanas | Lo que la acción sugerida no está arreglando |
| **Edad media de lo abierto** | promedio de días desde detección | **Si sube mes a mes, el circuito de gestión no funciona aunque el conteo baje.** |
