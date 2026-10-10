# 06 — Plan de cuatro semanas

Criterio: **cada semana tiene que terminar en algo que se pueda mostrar.** Nada
de "semana de análisis". El motor ya corre, así que la semana 1 arranca con
resultado, no con setup.

---

## Semana 1 — El hallazgo que paga el proyecto

| Día | Qué | Entregable |
|---|---|---|
| 1 | Correr el motor sobre el export vigente | `alertas.json` + bandeja |
| 1–2 | Armar el informe de las 30 sucursales con promesa mal calibrada | 2 carillas con la tabla y la recomendación |
| 3 | Mostrárselo a Lucho | decisión: ¿se recalibra? ¿se prueba en 5 primero? |
| 4 | Validar la lista de 188 UT detenidas con el responsable de MCR | cuántas son reales y cuántas son hito sin registrar |
| 5 | Escribirle a Andreani por las 179 UT con mediana de 47 días | respuesta formal, o la constancia de que no la hay |

**Se muestra:** la tabla de promesa y la lista de UT detenidas.
**Riesgo:** que la lista de UT tenga muchos falsos positivos. **Es información,
no un fracaso**: si la mitad son hitos sin registrar, el problema es de carga de
dato y eso también hay que arreglarlo. Se mide y se informa el porcentaje.

## Semana 2 — Calibrar con los dueños

| Día | Qué | Entregable |
|---|---|---|
| 1 | Reunión con MCR (45 min): umbrales R01, R03, R04 | umbrales acordados y firmados en `reglas.yaml` |
| 2 | Reunión con CDR | ídem |
| 3 | Reunión con Abastecimiento: R02, R09 | ídem |
| 4 | Recorrer los 3 meses con los umbrales nuevos | cuántas alertas por semana por persona |
| 5 | Ajustar hasta que ninguna persona reciba más de 10 por semana | `reglas.yaml` v2 con fecha y nombre del que acordó |

**Se muestra:** la bandeja con los umbrales que ellos mismos eligieron.
**Riesgo:** que alguien no quiera que le midan el nodo. Mitigación: la alerta
nombra el nodo, no a la persona, y la acción sugerida está escrita para ayudar a
resolver, no para señalar.

## Semana 3 — Que corra solo

| Día | Qué | Entregable |
|---|---|---|
| 1–2 | Hablar con Sistemas: ¿hay vista SQL del 1060? ¿con qué frecuencia? | respuesta concreta; si no hay, se queda con el archivo |
| 2–3 | Automatizar la corrida diaria (tarea programada o job) | corre sin que nadie la lance |
| 3–4 | Primer envío: un correo por responsable por día | el correo llegando |
| 5 | Dos semanas en **modo silencioso** antes de avisar a todos | lista de falsos positivos revisada a mano |

**Se muestra:** el correo de las 8 de la mañana con las alertas de ese día.
**Riesgo:** que Sistemas no dé acceso en la semana. **No bloquea**: el motor lee
el archivo, que es lo que hace hoy. El acceso SQL es una mejora, no un requisito.

## Semana 4 — Cerrar el circuito y medir

| Día | Qué | Entregable |
|---|---|---|
| 1–2 | Panel en Power BI sobre `alertas.json` (medidas de `dax/medidas.dax`) | `.pbix` |
| 3 | Incorporar la revisión a una reunión que **ya existe** | 10 minutos fijos, no una reunión nueva |
| 4 | Medir: ¿cuántas alertas se cerraron en estas 4 semanas? | tasa de resolución y días hasta resolver |
| 5 | Presentación de 5 minutos | `07-guion-ejecutivo.md` |

**Se muestra:** cuántos pendientes había el día 1 y cuántos quedan el día 28.
**Riesgo:** que el número no haya bajado. También es un resultado: significa que
el problema no era de visibilidad sino de capacidad, y eso cambia la discusión
hacia el punto B.3 del diagnóstico. Se informa igual.

---

## Qué tiene que ser cierto al día 28

| Criterio | Cómo se verifica |
|---|---|
| El motor corre solo todos los días | 28 corridas en `estado.json` |
| Cada alerta tiene un responsable que la reconoce | tasa de reconocimiento > 80% |
| La antigüedad del pendiente más viejo bajó | comparación semana 1 vs. semana 4 |
| Nadie recibe más de 10 alertas por semana | conteo por responsable |
| Hay al menos una decisión tomada por el sistema | la recalibración de la promesa |

Si al día 28 fallan los primeros cuatro, el sistema no sirve y hay que decirlo.
Si falla solo el tercero, el sistema sirve y el problema es otro.

---

## Lo que explícitamente queda afuera de estas 4 semanas

Predicción de acumulación, machine learning, portal web con login, app móvil,
integración con el ERP, reemplazar tableros existentes. Todo eso se discute
cuando el circuito de gestión esté funcionando — no antes, porque sin alguien que
mire la bandeja todos los días, cualquier cosa que se construya encima no se va a
usar tampoco.
