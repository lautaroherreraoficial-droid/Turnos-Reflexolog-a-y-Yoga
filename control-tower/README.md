# OI Control Tower

Sistema de gestión por excepciones para Logística Online / No Tradicional de
La Anónima. Convierte el export del circuito 1060 en una lista diaria de **qué
hay que hacer hoy y quién lo tiene**, no en otro tablero de indicadores.

Corre hoy, sobre datos reales, en 12 segundos.

---

## Qué resuelve

El área ya mide. Lo que no existe es la lista. Al 1 de septiembre de 2026, sobre
76.780 líneas de tres meses:

| | |
|---|---|
| **973 UT detenidas**, 188 hace más de 5 días | nadie podía listarlas |
| **416 líneas** sin circuito, sin anular, mediana 10 días | el cliente pagó y no está en ningún tablero |
| **179 UT en Andreani**, mediana 47 días, máximo 90 | salieron de MCR y no volvieron a reportar |
| **30 de 124 sucursales** prometen menos de lo que tardan | 13.566 envíos que nacen incumplidos |

---

## Cómo se corre

```bash
pip install pyyaml

python3 engine/ct_run.py \
    --fuente /ruta/TrackingLAOL.txt \
    --fuente /ruta/1060_juniojulio.csv
```

Salidas en `out/`:

| Archivo | Qué es |
|---|---|
| `Bandeja_Alertas.html` | la bandeja. Un archivo, sin dependencias, se manda por mail y se abre sin licencia |
| `alertas.json` | las alertas con su evidencia, para Power BI |
| `resumen.json` | conteos por severidad, nodo y regla |
| `estado.json` | **la memoria entre corridas**: historial, recurrencia, qué ya se notificó |

Opciones útiles: `--corte 2026-09-01`, `--solo R01,R05`, `--sin-estado`
(corrida limpia), `--sin-html`.

## Pruebas

```bash
python3 engine/test_ct.py          # 22 pruebas
python3 engine/test_ct.py --rapido # sin las que necesitan el export
```

Tres niveles: invariantes sobre los datos reales, un caso sintético por regla
(incluida R03, que **no** se dispara con los datos actuales y hay que demostrar
que puede), y una **prueba de paridad SQL** que corre la misma consulta de
pendientes en SQLite y exige el mismo número que el motor en Python.

---

## Estructura

```
engine/
  ct_fuentes.py   lectura y normalización de los 2 formatos del export
  ct_modelo.py    línea → envío → UT; etapas por circuito; pulmón (WIP)
  ct_motor.py     las 9 reglas, el anti-ruido y el ciclo de vida
  ct_bandeja.py   la bandeja HTML
  ct_run.py       punto de entrada
  reglas.yaml     TODOS los umbrales. Se cambian acá, no en el código.
  test_ct.py      las 22 pruebas
sql/
  00_staging.sql            espejo del export, columnas verificadas
  01_modelo_dimensional.sql estrella: fact.envio_linea + fact.ut
  02_pendientes.sql         la consulta que hoy no existe
  03_pulmon_wip.sql         WIP diario y cola envejecida
  04_calidad.sql            7 controles que corren ANTES de las alertas
  05_cumplimiento_promesa.sql  separa promesa mal puesta de operación mala
dax/medidas.dax
docs/            diagnóstico, arquitectura, indicadores, motor, ROI, plan, guion
out/             salidas
```

---

## Tres decisiones de medición que cambian los números

**1. La unidad es el envío, no el pedido.** Un pedido con reenvío genera varios
envíos: el original se anula y nace una línea nueva con otro recorrido. Medir por
pedido daba 19 días medianos en esos casos cuando el envío que llegó tardó 7.

**2. Horas para las etapas, días calendario para el cumplimiento.** La
planificación corre en un batch de las 04:30 y la gente compra a la tarde: un
tramo de 18:20 a 04:26 son 10 horas, pero en días calendario sumaba un día
entero que no existió. El cumplimiento sí va en días, porque así está expresada
la promesa.

**3. `fecfinrecepcdr` no se usa.** Cierra *después* de `fecsalidacdr` en el 26,7%
de los casos, porque la recepción del CDR se cierra por lote de la expedición de
entrada y esa expedición mezcla más de una sucursal en el 21,5% de los casos
(hasta 16). La cadena va `fecllegadacdr → fecsalidacdr`.

---

## Qué NO hace, a propósito

- **No escribe en ningún sistema productivo.** Solo lee el export.
- **No manda notificaciones todavía.** Primero hay que calibrar los umbrales con
  cada responsable (ver `docs/04`). Encender notificaciones con umbrales sin
  acordar quema la confianza en la primera semana.
- **No predice.** Hay 188 pendientes que ya ocurrieron y nadie los mira.
- **No reemplaza ningún tablero.** Se suma, y si no se usa, se apaga.

## Datos personales

El export trae apellido, nombre, teléfono y documento del cliente. **No se cargan
en el staging ni salen en ninguna alerta**: el sistema no los necesita para nada.
La bandeja identifica por número de UT, de pedido y de sucursal.
