# 05 — Impacto económico y operativo

> **Advertencia que va primero, no al final.** No tengo el costo de una hora de
> operario, ni el costo de un reenvío, ni el margen por pedido. Sin eso, **no hay
> ninguna cifra en pesos que sea honesta**. Lo que sigue separa estrictamente:
>
> - **MEDIDO** — sale del dato real. Es un hecho.
> - **FÓRMULA** — la cuenta lista, con los huecos marcados como `⟨pedir⟩`.
> - **ESCENARIO** — un ejemplo con números inventados, **solo para mostrar la
>   mecánica**. No se presenta como resultado ante nadie.

---

## Cómo se prioriza

```
Prioridad = (Impacto × Frecuencia × Confianza) ÷ Esfuerzo
```

| Factor | Escala | Cómo se puntúa |
|---|---|---|
| Impacto | 1–5 | envíos o clientes afectados |
| Frecuencia | 1–5 | cada cuánto ocurre |
| Confianza | 0,2–1,0 | **1,0 si está medido; 0,5 si es hipótesis; 0,2 si falta el dato** |
| Esfuerzo | 1–5 | días‑persona + permisos necesarios |

El factor de confianza es el que evita que una idea grande sin evidencia le gane
a una chica y segura. Una hipótesis con impacto 5 y confianza 0,2 puntúa igual
que un hecho con impacto 1 y confianza 1,0 — y entre esos dos hay que empezar por
el hecho.

| Iniciativa | Imp | Frec | Conf | Esf | Puntaje |
|---|---|---|---|---|---|
| **Recalibrar la promesa en 30 sucursales** | 5 | 5 | **1,0** | 1 | **25,0** |
| **Listar y reclamar las 188 UT detenidas** | 4 | 5 | **1,0** | 2 | **10,0** |
| **Destrabar las 416 líneas sin circuito** | 4 | 4 | **1,0** | 2 | **8,0** |
| Cargar la UT en el circuito Andreani | 3 | 5 | 1,0 | 3 | 5,0 |
| Usar la holgura de provisión local | 4 | 3 | 1,0 | 3 | 4,0 |
| Aumentar la frecuencia de despacho de MCR | 5 | 5 | **0,5** | 5 | 2,5 |
| Predecir acumulación de pendientes | 2 | 3 | **0,2** | 4 | 0,3 |

El orden que sale de la cuenta coincide con el del diagnóstico, y por las mismas
razones. El último renglón es el que conviene mirar: predecir es lo más vistoso y
lo peor puntuado, porque no hay nada que predecir mientras haya 188 pendientes
que ya ocurrieron y nadie está mirando.

---

## Ficha por iniciativa

### 1. Recalibrar la promesa en 30 sucursales

| | |
|---|---|
| **Problema** | 30 de 124 sucursales tienen mediana real por encima del plazo que publican |
| **MEDIDO** | 13.566 envíos. Rosario promete 5 d, mediana real 9 d, incumple 78,4% |
| **Indicador que mueve** | Cumplimiento %, NPS, casos de call center por "fuera de plazo" |
| **Esfuerzo** | 1 día de análisis (ya hecho) + la decisión comercial |
| **FÓRMULA** | `casos evitados = envíos × (incumplimiento_actual − incumplimiento_con_plazo_nuevo) × ⟨tasa de reclamo por envío incumplido⟩` |
| **Cómo se mide** | Cumplimiento de esas 30 sucursales, 30 días antes vs. 30 días después. Grupo de control: las otras 94. |
| **Riesgo** | Un plazo más largo puede bajar conversión. **Hay que medirlo, no suponerlo**: probar en 5 sucursales antes de las 30. |
| **Falta** | `⟨tasa de reclamo por envío incumplido⟩` y el efecto del plazo sobre conversión |

### 2. Listar y reclamar las UT detenidas

| | |
|---|---|
| **Problema** | 188 UT llevan más de 5 días sin moverse y nadie puede listarlas |
| **MEDIDO** | 973 UT detenidas; 179 en Andreani con mediana de 47 días y máximo 90 |
| **Indicador** | Antigüedad del pendiente más viejo; UT detenidas >5 días |
| **Esfuerzo** | ya construido; el costo es el tiempo de gestión diaria |
| **FÓRMULA** | `horas ahorradas/mes = ⟨horas actuales de búsqueda manual⟩ − (alertas/mes × ⟨minutos por alerta⟩ ÷ 60)` |
| **Cómo se mide** | Antigüedad del pendiente más viejo, semana a semana. Debería bajar y quedar baja. |
| **Riesgo** | Que la lista se mire dos semanas y se abandone. Mitigación: revisión fija en una reunión que ya existe, no una nueva. |
| **Falta** | `⟨horas actuales de búsqueda manual⟩` — se obtiene preguntando a quien hoy las busca |

### 3. Cargar la UT en el circuito Andreani

| | |
|---|---|
| **Problema** | 93,5% de las líneas de Andreani no tienen UT: no hay con qué reclamar una entrega |
| **MEDIDO** | 101 de 108 líneas sin UT; Andreani cumple 60,6% contra 81–99% del resto |
| **Indicador** | % de líneas con UT; tiempo hasta resolver un reclamo a Andreani |
| **Esfuerzo** | depende de Sistemas y del acuerdo con el operador |
| **Cómo se mide** | % de líneas con UT antes y después; el control C3 ya lo calcula |
| **Riesgo** | Puede depender del operador y no de nosotros |

---

## Fórmulas generales

```
Ahorro de horas / mes
  = ⟨horas de búsqueda manual⟩ − (alertas × ⟨min por alerta⟩ ÷ 60)

Reducción de atraso
  = (antigüedad_p90_antes − antigüedad_p90_después) × UT afectadas

Valor de un punto de cumplimiento
  = envíos/mes × 1% × ⟨tasa de reclamo por incumplido⟩ × ⟨costo por reclamo⟩

ROI del proyecto
  = (ahorro de horas × ⟨costo hora⟩ + reclamos evitados × ⟨costo reclamo⟩)
    ÷ (días-persona de desarrollo × ⟨costo día⟩)
```

Los cinco `⟨…⟩` son todo lo que falta para que esto deje de ser una fórmula y pase
a ser un número. Los cinco se consiguen preguntando, no midiendo.

---

## ESCENARIO ILUSTRATIVO — no es un resultado

> **Números inventados para mostrar la mecánica. No usar en ninguna
> presentación.** Los reemplaza el área cuando tenga sus propios valores.

Supongamos `⟨costo hora⟩ = $X`, `⟨costo reclamo⟩ = $Y`, y que hoy se pierden
`⟨10 h/mes⟩` buscando pendientes a mano.

| Concepto | Cálculo | Resultado |
|---|---|---|
| Horas de búsqueda ahorradas | 10 − (26 alertas × 5 min ÷ 60) | ≈ 7,8 h/mes |
| Reclamos evitados por recalibrar | 13.566 × (0,55 − 0,15) × ⟨tasa⟩ | `⟨tasa⟩ × 5.426` |
| Beneficio mensual | 7,8·$X + reclamos·$Y | — |
| Costo de desarrollo | 20 días‑persona · $Z | — |

Lo único defendible de esta tabla es la estructura. Las celdas se llenan con los
datos del área y recién ahí se muestra.

---

## Lo que sí se puede afirmar hoy sin ningún dato extra

1. **973 UT están detenidas y 188 hace más de 5 días.** Hoy no existe la consulta
   que las liste. Ahora existe.
2. **416 líneas tienen al cliente esperando sin circuito, sin anulación y sin
   aviso**, con una mediana de 10 días y un máximo de 88.
3. **30 sucursales publican un plazo que su propia mediana no alcanza**, sobre
   13.566 envíos.
4. **El 63% del tiempo que la mercadería pasa en MCR es esperando el camión**, no
   procesándose.

Las cuatro son verificables corriendo el motor. Ninguna necesita que nadie confíe
en una estimación.
