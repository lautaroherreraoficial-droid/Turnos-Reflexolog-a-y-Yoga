/* =====================================================================
   OI CONTROL TOWER - 05. Cumplimiento y calibracion de la promesa
   ---------------------------------------------------------------------
   La diferencia que mas plata mueve en todo el tablero: separar la
   sucursal que opera mal de la sucursal que tiene mal puesto el plazo.
   Son dos problemas distintos, con dos duenos distintos y dos costos de
   arreglo muy distintos.

   Resultado medido jun-ago 2026: 30 de 124 sucursales tienen una mediana
   real por encima del plazo que publican, sobre 13.566 envios. Es decir:
   mas de la mitad de esos envios nacen incumplidos aunque la operacion
   funcione perfecto.
   ===================================================================== */

WITH base AS (
    SELECT codsuc, nombre_suc, coddeposito3,
           DATEDIFF(DAY, fecaltaped, fecrec_item) AS dias_real,
           leadtimetotal, leadtimevtaverde
    FROM stg.circuito_1060
    WHERE fecrec_item IS NOT NULL
      AND fecaltaped  IS NOT NULL
      AND leadtimetotal > 0
      AND fecanulado IS NULL
),
pct AS (
    SELECT codsuc, nombre_suc,
           COUNT(*) AS envios,
           /* mediana y percentiles reales de la sucursal */
           MAX(p50) AS real_p50, MAX(p75) AS real_p75, MAX(p90) AS real_p90,
           MAX(promesa) AS promesa_dias,
           AVG(CASE WHEN dias_real > leadtimetotal THEN 1.0 ELSE 0.0 END) AS tasa_incumplimiento
    FROM (
        SELECT b.*,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY dias_real)
                OVER (PARTITION BY codsuc) AS p50,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY dias_real)
                OVER (PARTITION BY codsuc) AS p75,
            PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY dias_real)
                OVER (PARTITION BY codsuc) AS p90,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY CAST(leadtimetotal AS FLOAT))
                OVER (PARTITION BY codsuc) AS promesa
        FROM base b
    ) q
    GROUP BY codsuc, nombre_suc
)
SELECT
    codsuc, nombre_suc, envios,
    promesa_dias, real_p50, real_p75, real_p90,
    promesa_dias - real_p50                     AS holgura_dias,
    ROUND(100.0*tasa_incumplimiento, 1)         AS incumplimiento_pct,
    CASE
        WHEN promesa_dias - real_p50 <= 0 THEN
            'PROMESA MAL CALIBRADA: con el tiempo real actual el plazo no se cumple ni operando bien'
        WHEN tasa_incumplimiento > 0.25 THEN
            'PROBLEMA OPERATIVO: el plazo es alcanzable pero se falla seguido'
        WHEN promesa_dias - real_p90 >= 3 THEN
            'HOLGURA SIN USAR: se podria prometer mas rapido y ganar conversion'
        ELSE 'en linea'
    END                                          AS diagnostico
FROM pct
WHERE envios >= 30
ORDER BY holgura_dias ASC, incumplimiento_pct DESC;

/* --------- 5.2 El plazo prometido ya incluye la venta verde ------ */
/* Verificado: leadtimetotal = leadtimevtaverde + plazo propio de la ruta
   en el 98,0% de las lineas con venta verde. O sea que el plazo publicado
   YA contempla el tiempo del proveedor; no hay que sumarlo aparte, y la
   medicion de cumplimiento contra leadtimetotal es la correcta. */
SELECT
    CASE WHEN leadtimevtaverde > 0 THEN 'con venta verde' ELSE 'de stock' END AS tipo,
    COUNT(*)                                             AS lineas,
    AVG(CAST(leadtimetotal AS FLOAT))                    AS promesa_promedio,
    AVG(CAST(leadtimevtaverde AS FLOAT))                 AS parte_del_proveedor,
    AVG(CAST(DATEDIFF(DAY, fecaltaped, fecrec_item) AS FLOAT)) AS real_promedio,
    AVG(CASE WHEN DATEDIFF(DAY,fecaltaped,fecrec_item) <= leadtimetotal
             THEN 1.0 ELSE 0.0 END)                      AS tasa_cumplimiento
FROM stg.circuito_1060
WHERE fecrec_item IS NOT NULL AND leadtimetotal > 0 AND fecanulado IS NULL
GROUP BY CASE WHEN leadtimevtaverde > 0 THEN 'con venta verde' ELSE 'de stock' END;
