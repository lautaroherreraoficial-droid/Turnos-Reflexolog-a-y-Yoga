# 02 — Arquitectura

## La pregunta previa: ¿hace falta construir algo?

Antes de dibujar cajas conviene descartar lo obvio. El área ya tiene Power BI y
ya tiene indicadores. Si el problema fuera "no sé cuánto cumplimos", la respuesta
sería una medida DAX y listo.

No es ese el problema. El problema es que **nadie puede abrir una lista de las UT
detenidas y repartirla**, y que esa lista hay que mirarla todos los días y
después verificar que se resolvió. Eso no es un indicador: es un flujo de trabajo
con estado. Un tablero no guarda estado y por eso un tablero solo no alcanza.

Lo mínimo que hace falta es:

1. Una consulta que produzca la lista (eso es SQL).
2. Algo que decida qué de esa lista merece atención hoy y que recuerde lo que ya
   avisó (eso es el motor; no se puede hacer en DAX porque DAX no tiene memoria
   entre sesiones).
3. Una forma de repartirla y de seguirla (eso es la bandeja + Power BI).

Todo lo demás es opcional.

---

## MVP (lo que ya está construido y corriendo)

```
   Export 1060 (.csv / .txt)
   que ya se genera hoy
            │
            ▼
   ct_fuentes.py ─── normaliza los 2 formatos a un esquema único
            │        (7 nombres distintos, 2 formatos de fecha, 2 marcadores de nulo)
            ▼
   ct_modelo.py ──── línea → ENVÍO → UT; etapas por circuito; pulmón (WIP)
            │
            ▼
   ct_motor.py ───── evalúa reglas.yaml
            │        histéresis · agrupación · silencio · recurrencia
            │        estado.json  ← memoria entre corridas
            ├──────► alertas.json + resumen.json   (consumible por Power BI)
            └──────► Bandeja_Alertas.html          (un archivo, se manda por mail)
```

**Por qué Python y no Power Query:** el motor necesita recordar entre corridas
qué alerta ya avisó, cuántas semanas lleva abierta y si escaló. Power Query
recalcula desde cero en cada refresh y no tiene dónde guardar eso. La parte de
transformación sí podría vivir en Power Query; la parte de estado, no.

**Por qué un HTML y no solo Power BI:** la bandeja se manda por mail, se abre sin
licencia y sin VPN, y el jefe de sucursal que tiene que ir a buscar la UT no
tiene Power BI. Es un archivo, no un servicio. Si mañana todos tienen licencia,
la bandeja se reemplaza por un informe paginado y el motor no cambia.

**Lo que el MVP NO hace, a propósito:**
- no escribe en ningún sistema productivo (solo lee el export);
- no manda notificaciones automáticas todavía (primero hay que calibrar
  umbrales con los responsables, si no se quema la confianza en la primera
  semana con falsos positivos);
- no tiene autenticación, porque no expone nada: es un archivo local.

### Requisitos reales del MVP
Python 3.8+ y PyYAML. Nada más. Corre en 12 segundos sobre 76.780 líneas en una
notebook. No necesita servidor, ni licencia, ni permisos especiales.

---

## Solución ampliada (cuando el MVP demuestre que se usa)

```
  SQL Server ──► stg.circuito_1060 ──► vistas fact/dim  (sql/00, 01)
       │                                      │
       │                                      ├──► Power BI (DirectQuery o import)
       │                                      │      medidas dax/medidas.dax
       ▼                                      │
  job nocturno                                ▼
  ct_motor.py ──► tabla ct.alerta ──► Power BI (bandeja) + Power Automate
                       │                                      │
                       │                                      ▼
                       └──► historial ct.alerta_evento    Teams / Outlook
```

### Decisiones de la versión ampliada, con su justificación

| Decisión | Por qué |
|---|---|
| El motor escribe en **su propio esquema** `ct.`, nunca en tablas del ERP | El sistema no debe poder romper operación. Solo lectura sobre lo productivo. |
| Power Automate dispara **desde la tabla de alertas**, no desde el dato crudo | El anti‑ruido ya se aplicó. Si Power Automate mira el dato crudo, vuelve a mandar 225 mensajes. |
| Un solo mensaje por responsable por día, con su resumen | Un mensaje por alerta es la forma más rápida de que la gente filtre la carpeta. |
| Power BI consume `ct.alerta`, no recalcula las reglas | Una sola definición de "alerta". Si la regla vive en dos lados, en algún momento difieren y se pierde la discusión. |

### Sobre Teams / Outlook — qué es viable y qué hay que confirmar
- **Viable sin licencia premium:** Power Automate con conector de Outlook/Teams
  sobre un disparador programado (*recurrence*) que lee la tabla. Es el camino
  estándar.
- **Hay que confirmar con Sistemas:** si el usuario de servicio tiene permiso
  para leer `ct.alerta` desde Power Platform, y si la política de la empresa
  permite un conector de datos on‑premise (*gateway*). **No doy esto por
  hecho.** Si no se puede, la alternativa realista es un correo generado por el
  mismo job (SMTP interno) con la bandeja HTML adjunta.
- **Lo que no se puede prometer:** monitoreo en tiempo real. El motor no puede
  ser más fresco que su fuente, y la frecuencia real de actualización del 1060
  todavía no la sabemos (ver 09). Si el export es diario, la promesa honesta es
  "una corrida por día, con corte a la fecha del export".

---

## Lo que descarté, y por qué

| Idea | Por qué no |
|---|---|
| Un portal web con login y base propia | Necesita servidor, autenticación, mantenimiento y un dueño. Para 26 alertas diarias es desproporcionado, y lo tendría que sostener una sola persona. |
| Machine learning para predecir atrasos | No hay un problema de predicción: hay 188 UT detenidas que **ya** están detenidas y nadie las mira. Predecir lo que todavía no pasó, antes de gestionar lo que ya pasó, es gastar esfuerzo en la parte vistosa. |
| Una app móvil para los jefes de sucursal | Un HTML que se abre en el teléfono hace lo mismo. La bandeja ya es responsive. |
| Conectar Power BI directo al ERP productivo | Riesgo de carga sobre un sistema productivo, sin beneficio: el export ya existe. |
| Reemplazar los tableros actuales | No hace falta. Esto se suma, y si no se usa, se apaga sin romper nada. |
