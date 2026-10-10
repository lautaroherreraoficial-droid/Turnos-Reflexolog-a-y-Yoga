# 04 — El motor de alertas

## Qué es una alerta acá

No es un mensaje. Es **un objeto con identidad y ciclo de vida**: si mañana la
misma condición se vuelve a cumplir, es *la misma* alerta con un día más de
antigüedad, no una nueva. Esa es la diferencia entre poder medir si algo se
resolvió y solamente acumular mensajes.

Cada alerta lleva:

| Campo | Para qué |
|---|---|
| `id` | `regla + entidad`, estable entre corridas |
| `detectada` / `ultima_vez` | antigüedad real del problema |
| `nodo`, `entidad` | dónde |
| `valor` / `umbral` | **el umbral viaja adentro de la alerta**: una alerta que no se puede auditar no se puede discutir |
| `severidad` | media / alta / crítica |
| `evidencia` | los datos con los que se disparó, incluido el detalle fila por fila |
| `accion` | qué hacer |
| `responsable` | quién |
| `estado` | nueva → abierta → reconocida → en_gestion → resuelta |
| `historial` | cada cambio con su fecha |
| `semanas` | en cuántas semanas distintas estuvo abierta (alimenta R07) |

El motor solo produce `nueva`, `abierta` y `resuelta`. **`reconocida` y
`en_gestion` las escribe una persona** y el motor no las pisa — hay una prueba
que lo verifica (`test_no_pisa_el_estado_que_puso_una_persona`).

---

## Las nueve reglas

| ID | Qué detecta | Indicador | Umbral | Responsable |
|---|---|---|---|---|
| R01 | UT detenida | días desde el último hito | > 5 d | el nodo donde quedó |
| R02 | Pedido sin circuito ni anulación | días desde el alta | > 7 d | Abastecimiento |
| R03 | Pulmón creciendo fuera de lo habitual | z robusto (MAD) | ≥ 3,0 | el nodo |
| R04 | Nodo por encima de **sus pares** | razón vs. pares | ≥ 1,3× | el nodo |
| R05 | Promesa imposible de cumplir | promesa − real p50 | ≤ 0 | Logística Online |
| R06 | Registro incompleto que impide reclamar | % líneas sin el campo | ≥ 2% | Sistemas |
| R07 | Problema repetido sin resolución | semanas abierta | ≥ 3 | el nodo |
| R08 | Pedido que necesitó reenvío | intentos | ≥ 2 | el nodo |
| R09 | Backorder envejecido | días desde el alta | > 10 d | Abastecimiento |

---

## Los cuatro mecanismos anti‑ruido

Esta es la parte que decide si el sistema se usa o se ignora. **Sin anti‑ruido, la
primera corrida sobre los datos reales emitía 225 alertas. Con anti‑ruido, 26.**
Y no se perdió información: lo que se agrupó está adentro de la alerta agregada.

### 1. Agrupación
Si una regla toca más entidades que `agrupar_si_mas_de` dentro del mismo nodo y
etapa, se emite **una** alerta con el detalle adentro.

> *179 UT detenidas en Andreani no son 179 problemas: son uno.*

Esto bajó R01 de 189 alertas a 10, y R05 de 106 a 1.

### 2. Comparación contra pares, no contra la red
R04 comparaba cada sucursal contra la mediana de la red y marcaba 104. Pero una
sucursal lejana tarda más **por geografía**, y marcarla por eso es culpar al mapa.
Ahora cada sucursal se compara con **las que cuelgan del mismo CDR**, y cada CDR
con los otros CDR, que hacen el mismo trabajo. Quedaron 11 alertas, y son reales.

### 3. Silencio con excepción por escalamiento
No se vuelve a notificar la misma alerta antes de `silencio_horas` (24 por
defecto) **salvo que haya subido de severidad**. Lo que cambia se avisa; lo que
sigue igual, no.

> Verificado: segunda corrida sobre los mismos datos → **26 alertas activas, 0 a
> notificar**. Sin esto, una UT detenida 40 días manda 40 mensajes y la gente
> deja de leer la carpeta.

### 4. Histéresis y volumen mínimo
La alerta abre en `umbral` y recién cierra en `umbral_cierre`, para que una
métrica que oscila no genere una alerta por día. Y ninguna regla de tasa emite
por debajo de `min_n` observaciones: con 3 casos no se concluye nada.

### Lo que el motor **no** hace y es a propósito
No descarta una alerta por ser vieja. Un pendiente de 90 días no deja de ser un
problema porque ya lo avisamos: deja de notificar, pero sigue contando en la
bandeja y escala por R07.

---

## Calibración: el paso que no se puede saltear

Los umbrales de `reglas.yaml` están calibrados sobre junio–agosto de 2026. **Son
una propuesta, no una verdad.** Un umbral que no acordó el responsable del nodo
no se sostiene en una reunión, y la primera vez que genere un falso positivo se
pierde la confianza en todo el tablero.

**Procedimiento, una sola reunión por nodo (45 minutos):**

1. Mostrar la distribución actual del indicador en ese nodo (el motor ya la
   calcula) y dónde cae el umbral propuesto.
2. Preguntar lo único que importa: **"¿a partir de qué valor esto es un problema
   que vos querés que te avisen?"**
3. Correr el motor con ese umbral sobre los tres meses históricos y mostrar
   cuántas alertas habría recibido por semana. Si son más de 10 por semana por
   persona, no se va a usar: subir el umbral o agrupar.
4. Anotar el acuerdo en `reglas.yaml` con fecha y nombre, y recalibrar
   trimestralmente.

**Antes de encender notificaciones automáticas**, correr dos semanas en modo
silencioso y revisar a mano los falsos positivos. El costo de un falso positivo
no es el minuto perdido: es que la próxima alerta verdadera no se lea.

---

## Integración con Teams / Outlook

**Viable, con el camino estándar:** Power Automate con disparador programado que
lee la tabla `ct.alerta` y arma **un mensaje por responsable por día** con su
resumen. No un mensaje por alerta — esa es la forma más rápida de que la gente
filtre la carpeta.

**A confirmar antes de prometerlo** (no lo doy por hecho):
- que el usuario de servicio tenga permiso de lectura sobre `ct.alerta` desde
  Power Platform;
- si la política de la empresa permite un *gateway* de datos on‑premise;
- qué licencias de Power Automate hay disponibles.

**Alternativa si algo de eso no se puede:** el mismo job que corre el motor manda
un correo por SMTP interno con la bandeja HTML adjunta. Cero licencias, cero
conectores. Hace el 90% del trabajo.

**Lo que no se puede prometer:** monitoreo en tiempo real. El motor no puede ser
más fresco que su fuente. Si el export del 1060 es diario, la promesa honesta es
*"una corrida por día, con corte a la fecha del export"*, y el tablero tiene que
mostrar esa fecha de corte bien visible para que nadie lea un número viejo
creyendo que es de hoy.
