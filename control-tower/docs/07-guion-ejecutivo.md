# 07 — Guion de presentación (5 minutos)

> Una lámina por bloque. Los números están medidos; se pueden mostrar corriendo
> el motor en vivo si alguien lo pide.

---

### 0:00 — Abrir con el problema, no con la herramienta (30 s)

> "Tenemos 973 unidades de transporte detenidas en el circuito. 188 llevan más de
> cinco días. Una lleva noventa. Hoy no existe forma de listarlas: el dato está,
> pero nadie puede abrir la lista y repartirla.
>
> No vengo a mostrar un tablero. Vengo a mostrar esa lista."

*Lámina: la tabla de las 15 UT más viejas, con número de UT, sucursal y días.*

---

### 0:30 — El hallazgo que se puede arreglar esta semana (90 s)

> "Antes de la herramienta, un número. **Treinta de nuestras ciento veinticuatro
> sucursales publican un plazo de entrega que su propia mediana no alcanza.** Son
> trece mil quinientos envíos.
>
> Hipermercado Rosario promete cinco días. Su mediana real es nueve. Incumple el
> setenta y ocho por ciento de las veces. No es que opere mal: es que **con el
> tiempo real que tiene, ese plazo no se cumple ni trabajando perfecto**.
>
> Y al revés: provisión local promete nueve días y entrega en dos, cumpliendo el
> noventa y nueve por ciento. Hay **siete días de holgura que no estamos usando**.
>
> Cambiar esos plazos no cuesta una hora de operación. Es un parámetro."

*Lámina: tabla de las 4 peores + la línea de provisión local.*

---

### 2:00 — Dónde se va el tiempo (60 s)

> "Del ciclo completo, **el sesenta y tres por ciento del tiempo que la mercadería
> pasa en MCR es esperando el camión**, no procesándose: dieciocho horas de
> trabajo contra treinta esperando que salga.
>
> Eso no se arregla con más gente. Se arregla con frecuencia de despacho. Es la
> conversación grande, y la dejo planteada con el número medido."

*Lámina: la barra de composición del ciclo, por tipo (trabajo / espera / viaje).*

---

### 3:00 — Cómo se gestiona de ahora en adelante (90 s)

> "Construí un motor que todos los días revisa el circuito contra nueve reglas y
> emite **solo lo que requiere intervención**, con responsable, evidencia y acción
> sugerida.
>
> La primera corrida tiraba doscientas veinticinco alertas. Eso no lo lee nadie.
> Con agrupación, comparación contra pares y ventana de silencio, hoy tira
> **veintiséis** — y no se perdió nada: las ciento setenta y nueve UT de Andreani
> están adentro de una sola alerta, con el detalle.
>
> Cada alerta tiene estado. Si mañana sigue, es la misma alerta con un día más, no
> una nueva. **Por eso se puede medir si algo se resolvió**, que es lo que un
> tablero común no permite."

*Lámina: la bandeja abierta, con una alerta desplegada mostrando la evidencia.*

---

### 4:30 — Qué necesito (30 s)

> "Tres cosas:
>
> 1. **Cuarenta y cinco minutos con cada responsable de nodo** para acordar los
>    umbrales. Los que puse son una propuesta mía; un umbral que no acordó el
>    dueño no se sostiene.
> 2. **La decisión sobre los plazos** de esas treinta sucursales.
> 3. **Saber qué es PUP 959** — lo mencionaron en el pedido y no aparece en
>    ningún registro del circuito.
>
> Con eso, en cuatro semanas esto corre solo y puedo mostrar cuántos pendientes
> se cerraron."

---

## Preguntas que van a hacer, con la respuesta corta

| Pregunta | Respuesta |
|---|---|
| ¿Esto no lo hace ya Power BI? | Power BI muestra indicadores. No recuerda qué alerta ya avisó ni si se resolvió. Eso necesita estado, y DAX no lo tiene. |
| ¿Los números son confiables? | La cadena de hitos tiene 0% de inversiones salvo 44 líneas sobre 76.780. Hay siete controles de calidad que corren antes que las alertas. |
| ¿Y si las alertas son falsos positivos? | Por eso hay dos semanas en modo silencioso antes de encender las notificaciones, y los umbrales los acuerda cada responsable. |
| ¿Cuánto cuesta? | El MVP ya está. Lo que cuesta es el tiempo de gestión: diez minutos por día de quien mire la bandeja. |
| ¿Toca algún sistema productivo? | No. Solo lee el export que ya se genera. No escribe en ninguna tabla del ERP. |
| ¿Cuántos días de atraso tiene el dato? | Los que tenga el export. El tablero muestra la fecha de corte arriba, para que nadie lea un número viejo creyendo que es de hoy. |
| ¿Por qué no predice? | Porque hay 188 pendientes que **ya** ocurrieron y nadie los mira. Predecir antes de gestionar es trabajar en la parte vistosa. |
