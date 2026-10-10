/* =====================================================================
   OI CONTROL TOWER - 03. Pulmon (WIP) por etapa y por dia
   ---------------------------------------------------------------------
   Una linea esta "en" una etapa entre el hito que la abre y el hito que
   la cierra. Si el hito de cierre todavia no existe, sigue en cola.

   DOS ADVERTENCIAS QUE CAMBIAN LA LECTURA:

   1. Censura por el borde de los datos. En los ultimos dias de la ventana
      toda linea en vuelo figura como "en cola", porque su cierre todavia
      no ocurrio. Por eso la tendencia se lee con la mediana movil de 7
      dias y no con el ultimo dia, y la alerta de anomalia descarta los
      ultimos 3 dias.

   2. Las etapas que abre fecaltaped ("sin planificar") las abre TODO
      pedido, asi que su cola crece por recencia de los datos y no por
      atraso. No se las compara contra su historia; el balde de pedidos
      sin circuito se mide por antiguedad individual (consulta 2.3).
   ===================================================================== */

DECLARE @desde DATE = '2026-06-01';
DECLARE @hasta DATE = (SELECT CAST(MAX(fecplanificacion) AS DATE) FROM stg.circuito_1060);

WITH calendario AS (
    SELECT @desde AS dia
    UNION ALL SELECT DATEADD(DAY,1,dia) FROM calendario WHERE dia < @hasta
),
tramos AS (
    SELECT 'Pulmon de picking MCR' AS etapa, 'MCR' AS nodo,
           fecplanificacion AS abre, fecpicking AS cierra
      FROM stg.v_1060 WHERE circuito IN ('cdr','directo','andreani') AND es_anulada=0
    UNION ALL
    SELECT 'Control MCR','MCR', fecpicking, feccontrolado
      FROM stg.v_1060 WHERE circuito IN ('cdr','directo') AND es_anulada=0
    UNION ALL
    SELECT 'Cola de despacho MCR','MCR', feccontrolado, fecsalidacdrweb
      FROM stg.v_1060 WHERE circuito IN ('cdr','directo','andreani') AND es_anulada=0
    UNION ALL
    SELECT 'Transito MCR a CDR','Transporte', fecsalidacdrweb, fecllegadacdr
      FROM stg.v_1060 WHERE circuito='cdr' AND es_anulada=0
    UNION ALL
    SELECT 'Dentro del CDR','CDR', fecllegadacdr, fecsalidacdr
      FROM stg.v_1060 WHERE circuito='cdr' AND es_anulada=0
    UNION ALL
    SELECT 'Transito CDR a sucursal','Transporte', fecsalidacdr, fecrec_item
      FROM stg.v_1060 WHERE circuito IN ('cdr','local') AND es_anulada=0
    UNION ALL
    SELECT 'Transito MCR a sucursal','Transporte', fecsalidacdrweb, fecrec_item
      FROM stg.v_1060 WHERE circuito='directo' AND es_anulada=0
    UNION ALL
    SELECT 'En Andreani','Andreani', fecsalidacdrweb, fecrec_item
      FROM stg.v_1060 WHERE circuito='andreani' AND es_anulada=0
)
SELECT c.dia, t.etapa, t.nodo, COUNT(*) AS lineas_en_cola
FROM calendario c
JOIN tramos t
  ON t.abre IS NOT NULL
 AND CAST(t.abre AS DATE) <= c.dia
 AND (t.cierra IS NULL OR CAST(t.cierra AS DATE) > c.dia)
GROUP BY c.dia, t.etapa, t.nodo
ORDER BY t.etapa, c.dia
OPTION (MAXRECURSION 1000);

/* --------- 3.2 Pulmon envejecido: la metrica robusta ------------- */
/* Cuantas lineas llevan mas de N dias en su etapa. A diferencia del WIP
   total, esta no se infla por el borde de los datos: una linea que entro
   ayer no puede llevar 5 dias. Es la que conviene mirar todos los dias. */

DECLARE @corte DATETIME2(0) = (SELECT MAX(fecplanificacion) FROM stg.circuito_1060);
DECLARE @n INT = 5;

SELECT etapa, nodo,
       COUNT(*)                                        AS lineas_envejecidas,
       AVG(CAST(DATEDIFF(DAY, abre, @corte) AS FLOAT))  AS dias_promedio,
       MAX(DATEDIFF(DAY, abre, @corte))                 AS dias_max
FROM (
    SELECT 'Cola de despacho MCR' AS etapa,'MCR' AS nodo, feccontrolado AS abre, fecsalidacdrweb AS cierra
      FROM stg.v_1060 WHERE circuito IN ('cdr','directo','andreani') AND es_anulada=0
    UNION ALL
    SELECT 'Dentro del CDR','CDR', fecllegadacdr, fecsalidacdr
      FROM stg.v_1060 WHERE circuito='cdr' AND es_anulada=0
    UNION ALL
    SELECT 'Transito CDR a sucursal','Transporte', fecsalidacdr, fecrec_item
      FROM stg.v_1060 WHERE circuito IN ('cdr','local') AND es_anulada=0
    UNION ALL
    SELECT 'En Andreani','Andreani', fecsalidacdrweb, fecrec_item
      FROM stg.v_1060 WHERE circuito='andreani' AND es_anulada=0
) t
WHERE abre IS NOT NULL AND cierra IS NULL
  AND DATEDIFF(DAY, abre, @corte) > @n
GROUP BY etapa, nodo
ORDER BY lineas_envejecidas DESC;
