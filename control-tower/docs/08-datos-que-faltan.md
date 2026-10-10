# 08 — Pedido formal de datos

Para copiar y mandar. Cada punto dice **por qué** se necesita y **qué se
desbloquea**, porque un pedido de datos sin justificación no se atiende.

---

## 1. Qué significa "UT" en el pedido original — **bloqueante para un módulo**

En el export del circuito 1060, `unidadtransporte` es la **unidad de transporte**:
un bulto físico con un destino único (verificado: ninguna de las 14.123 UT mezcla
sucursales). Sobre esa lectura ya está construido todo lo que permite listar
pendientes individualmente.

Si en el área "UT" significa **unidad de trabajo** de picking (una tarea del
pulmón), eso vive en otro sistema y **de eso no hay ni una fila**.

> **Pregunta concreta:** cuando se habla de "UT acumuladas, pendientes y con
> atrasos superiores a cinco días", ¿se habla del bulto que viaja o de la tarea
> de picking?

- Si es el bulto → **ya está resuelto**, no hace falta nada más.
- Si es la tarea → hace falta el extracto del WMS con: id de UT, depósito, fecha
  de creación, fecha de asignación, fecha de cierre, estado y operario.

## 2. PUP 959 — **no existe en los datos**

El único depósito de origen en los tres meses es **940** (48.279 líneas). Los
otros códigos que aparecen son CDR de destino (005, 040, 054, 063, 064, 065,
079, 081, 099, 191, 254, 389) y **098** como base de transferencia. **959 no
aparece en ningún campo de ninguna fila.**

> **Pregunta:** ¿qué es PUP 959, desde cuándo opera y en qué sistema se registra
> su movimiento? Si opera y no está en el 1060, hay un circuito entero sin
> trazabilidad.

## 3. Número de pedido en los casos de Salesforce

Hoy el cruce entre reclamos y recorrido es a nivel sucursal/mes (correlación
0,75 entre tasa de call center y tasa de encuesta). Con el número de pedido se
podría responder **caso por caso**: este cliente reclamó, y su envío se trabó
acá, tantos días.

> **Pedido:** export de casos con `número de pedido` además de motivo y
> submotivo. Mismo período.
>
> **Desbloquea:** saber qué parte del circuito genera reclamos, en lugar de
> suponerlo.

## 4. Frecuencia real de actualización del 1060

> **Pregunta:** ¿el export se genera diario, semanal, a pedido? ¿Existe una vista
> o tabla SQL publicada, o solo el archivo?
>
> **Por qué:** define cada cuánto puede correr el motor y qué se le puede
> prometer al negocio. **No se puede prometer monitoreo en tiempo real si la
> fuente se actualiza una vez por día**, y prometerlo es la forma más rápida de
> perder credibilidad.

## 5. Maestro oficial de sucursales

El archivo de abastecimiento lista **127** sucursales; en los tres meses tuvieron
movimiento **124**. Las tres sin movimiento serían Trelew Fontana, Cipolletti 2 y
General Roca 3.

> **Pedido:** confirmar el maestro vigente (sucursal → CDR → zona → región) y si
> esas tres están activas. Confirmar también la **ciudad física de cada CDR**:
> hoy las etiquetas muestran solo el código, porque nombrarlos por zona de
> destino llevó a error una vez.

## 6. Los cinco valores para poder hablar de plata

Sin estos, el documento de impacto solo puede dar fórmulas y escenarios.

| Valor | Para qué | Quién lo tiene |
|---|---|---|
| Costo de una hora de operario de depósito | ahorro de horas | RRHH / Costos |
| Costo de un reenvío | el impacto de los 421 reenvíos | Logística |
| Costo de atender un caso de call center | reclamos evitados | Atención al cliente |
| Horas/mes que hoy se dedican a buscar pendientes a mano | la línea de base | el propio equipo |
| Margen promedio por pedido online | dimensionar el riesgo de los pendientes | Comercial |

## 7. Dotación y turnos por nodo

> **Pedido:** dotación por turno de MCR y de cada CDR, y horarios de corte de
> despacho.
>
> **Por qué:** sin esto, la frase "el 63% del tiempo en MCR es espera del camión"
> describe un hecho pero no dice si es un problema de capacidad o de
> programación. Son dos diagnósticos opuestos con dos soluciones opuestas, y hoy
> no puedo distinguirlos.

---

## Prioridad del pedido

| | Qué | Sin eso |
|---|---|---|
| **1** | Definición de UT (punto 1) | Puede que haya un módulo entero apuntando al objeto equivocado |
| **2** | Frecuencia del 1060 (punto 4) | No se puede automatizar con una promesa honesta |
| **3** | PUP 959 (punto 2) | Hay un circuito invisible |
| 4 | Pedido en Salesforce (punto 3) | El cruce queda a nivel agregado |
| 5 | Costos (punto 6) | El ROI queda en fórmulas |
| 6 | Dotación (punto 7) | El punto B.3 del diagnóstico no avanza |

Los puntos 4 a 7 **no bloquean nada de lo que ya está construido**.
