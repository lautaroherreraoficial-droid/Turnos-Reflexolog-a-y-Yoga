/* =====================================================================
   OI CONTROL TOWER - 04. Controles de calidad del dato
   ---------------------------------------------------------------------
   Se corren ANTES que cualquier alerta. Si estos fallan, las alertas
   mienten. Cada control devuelve: nombre, filas afectadas, porcentaje y
   un umbral de tolerancia. El resultado medido sobre jun-ago 2026 esta
   en el comentario de cada bloque, para poder comparar.
   ===================================================================== */

DECLARE @corte DATETIME2(0) = (SELECT MAX(fecplanificacion) FROM stg.circuito_1060);

/* --- C1. Secuencia de hitos ------------------------------------- */
/* Medido jun-ago 2026: 34 lineas invertidas en alta->planificacion y 10
   en control->salida. Todas las demas transiciones: 0. El dato es sano.  */
SELECT 'C1 secuencia' AS control, par, invertidos, evaluados,
       100.0*invertidos/NULLIF(evaluados,0) AS pct, 0.5 AS tolerancia_pct
FROM (
  SELECT 'alta -> planificacion' AS par,
         SUM(CASE WHEN fecplanificacion < fecaltaped THEN 1 ELSE 0 END) AS invertidos,
         SUM(CASE WHEN fecplanificacion IS NOT NULL AND fecaltaped IS NOT NULL THEN 1 ELSE 0 END) AS evaluados
    FROM stg.circuito_1060
  UNION ALL
  SELECT 'planificacion -> picking',
         SUM(CASE WHEN fecpicking < fecplanificacion THEN 1 ELSE 0 END),
         SUM(CASE WHEN fecpicking IS NOT NULL AND fecplanificacion IS NOT NULL THEN 1 ELSE 0 END)
    FROM stg.circuito_1060
  UNION ALL
  SELECT 'picking -> control',
         SUM(CASE WHEN feccontrolado < fecpicking THEN 1 ELSE 0 END),
         SUM(CASE WHEN feccontrolado IS NOT NULL AND fecpicking IS NOT NULL THEN 1 ELSE 0 END)
    FROM stg.circuito_1060
  UNION ALL
  SELECT 'control -> salida MCR',
         SUM(CASE WHEN fecsalidacdrweb < feccontrolado THEN 1 ELSE 0 END),
         SUM(CASE WHEN fecsalidacdrweb IS NOT NULL AND feccontrolado IS NOT NULL THEN 1 ELSE 0 END)
    FROM stg.circuito_1060
  UNION ALL
  SELECT 'salida MCR -> llegada CDR',
         SUM(CASE WHEN fecllegadacdr < fecsalidacdrweb THEN 1 ELSE 0 END),
         SUM(CASE WHEN fecllegadacdr IS NOT NULL AND fecsalidacdrweb IS NOT NULL THEN 1 ELSE 0 END)
    FROM stg.circuito_1060
  UNION ALL
  SELECT 'salida CDR -> recepcion item',
         SUM(CASE WHEN fecrec_item < fecsalidacdr THEN 1 ELSE 0 END),
         SUM(CASE WHEN fecrec_item IS NOT NULL AND fecsalidacdr IS NOT NULL THEN 1 ELSE 0 END)
    FROM stg.circuito_1060
) s;

/* --- C2. fecfinrecepcdr NO es secuencial ------------------------- */
/* Medido: cierra DESPUES de fecsalidacdr en el 26,7% de las lineas
   (mediana 19,4 h despues). No es un error de carga: la recepcion del CDR
   se cierra por lote de la expedicion de entrada, y esa expedicion mezcla
   mas de una sucursal en el 21,5% de los casos (hasta 16 sucursales en
   una). Conclusion operativa: fecfinrecepcdr NO sirve para medir el paso
   por el CDR. La cadena usa fecllegadacdr -> fecsalidacdr. */
SELECT 'C2 finrecep fuera de secuencia' AS control,
       SUM(CASE WHEN fecfinrecepcdr > fecsalidacdr THEN 1 ELSE 0 END) AS filas,
       COUNT(*) AS evaluados,
       100.0*SUM(CASE WHEN fecfinrecepcdr > fecsalidacdr THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0) AS pct,
       'informativo: no usar este hito para medir' AS nota
FROM stg.circuito_1060
WHERE fecfinrecepcdr IS NOT NULL AND fecsalidacdr IS NOT NULL;

/* --- C3. Campos clave faltantes --------------------------------- */
/* Sin UT y sin numero de expedicion no se puede reclamar una entrega al
   transporte: no hay con que identificarla.
   Medido: el circuito Andreani tiene 93,5% de lineas sin UT. */
SELECT 'C3 campos clave' AS control, circuito, campo, faltan, total,
       100.0*faltan/NULLIF(total,0) AS pct, 2.0 AS tolerancia_pct
FROM (
  SELECT circuito, 'unidadtransporte' AS campo,
         SUM(CASE WHEN unidadtransporte IS NULL OR unidadtransporte='' THEN 1 ELSE 0 END) AS faltan,
         COUNT(*) AS total
    FROM stg.v_1060 WHERE es_anulada=0 AND circuito<>'sin_origen' GROUP BY circuito
  UNION ALL
  SELECT circuito, 'nroexpddecdrweb',
         SUM(CASE WHEN nroexpddecdrweb IS NULL OR nroexpddecdrweb='' THEN 1 ELSE 0 END),
         COUNT(*)
    FROM stg.v_1060 WHERE es_anulada=0 AND circuito IN ('cdr','directo') GROUP BY circuito
  UNION ALL
  SELECT circuito, 'coddeposito3',
         SUM(CASE WHEN coddeposito3 IS NULL OR coddeposito3='' THEN 1 ELSE 0 END),
         COUNT(*)
    FROM stg.v_1060 WHERE es_anulada=0 AND circuito='cdr' GROUP BY circuito
) s
WHERE total >= 50;

/* --- C4. Duplicados en el grano declarado ----------------------- */
/* El grano del export es (pedido, linea, fecha de alta). Si esto devuelve
   filas, cualquier conteo de lineas esta inflado. */
SELECT 'C4 duplicados' AS control, nropedidoweb, nrolinea, fecaltaped, COUNT(*) AS veces
FROM stg.circuito_1060
GROUP BY nropedidoweb, nrolinea, fecaltaped
HAVING COUNT(*) > 1
ORDER BY veces DESC;

/* --- C5. Una UT, una sucursal ----------------------------------- */
/* Invariante verificada: 0 UT con mas de una sucursal sobre 14.123.
   Si esto empieza a devolver filas, fact.ut deja de ser confiable y hay
   que revisar como se asigna la UT en origen. */
SELECT 'C5 UT multisucursal' AS control, unidadtransporte,
       COUNT(DISTINCT codsuc) AS sucursales
FROM stg.circuito_1060
WHERE unidadtransporte IS NOT NULL AND unidadtransporte <> ''
GROUP BY unidadtransporte
HAVING COUNT(DISTINCT codsuc) > 1;

/* --- C6. Cobertura temporal ------------------------------------- */
/* Para saber a que fecha esta observando el tablero, y que no se tome
   GETDATE() como corte cuando el export tiene tres dias de atraso. */
SELECT 'C6 cobertura' AS control,
       MIN(fecaltaped) AS primer_alta, MAX(fecaltaped) AS ultima_alta,
       MAX(fecplanificacion) AS ultima_planificacion,
       MAX(fecrec_item)      AS ultima_recepcion,
       DATEDIFF(DAY, MAX(fecplanificacion), SYSDATETIME()) AS dias_de_atraso_del_export
FROM stg.circuito_1060;

/* --- C7. Promesa ausente ---------------------------------------- */
/* Sin leadtimetotal no se puede medir cumplimiento en esa linea. */
SELECT 'C7 sin promesa' AS control,
       SUM(CASE WHEN leadtimetotal IS NULL OR leadtimetotal = 0 THEN 1 ELSE 0 END) AS filas,
       COUNT(*) AS total,
       100.0*SUM(CASE WHEN leadtimetotal IS NULL OR leadtimetotal = 0 THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0) AS pct
FROM stg.circuito_1060 WHERE fecanulado IS NULL;
