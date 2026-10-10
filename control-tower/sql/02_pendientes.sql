/* =====================================================================
   OI CONTROL TOWER - 02. Pendientes y excepciones
   ---------------------------------------------------------------------
   Esta es la consulta que hoy no existe y que resuelve el problema
   principal del area: "no se pueden identificar individualmente las UT
   atrasadas". Devuelve una fila por UT detenida, con su numero, su
   sucursal, en que hito quedo, hace cuantos dias y quien la tiene.

   @corte: fecha de observacion. Por defecto el ultimo hito cargado, NO
   GETDATE(): si el export se cargo hace tres dias, usar la fecha de hoy
   inventa tres dias de atraso en todas las filas.
   ===================================================================== */

DECLARE @corte DATETIME2(0) = (
    SELECT MAX(x) FROM (
        SELECT MAX(fecrec_item) AS x FROM stg.circuito_1060
        UNION ALL SELECT MAX(fecsalidacdr) FROM stg.circuito_1060
        UNION ALL SELECT MAX(fecplanificacion) FROM stg.circuito_1060
    ) t
);
DECLARE @umbral_dias INT = 5;

/* --------- 2.1 UT detenidas, una fila por UT --------------------- */
SELECT
    u.ut,
    u.codsuc, u.sucursal,
    COALESCE(u.cod_cdr,'directo')          AS cdr,
    u.circuito,
    u.lineas, u.pedidos,
    u.ultimo_hito,
    u.f_ultimo_hito,
    DATEDIFF(DAY, u.f_ultimo_hito, @corte) AS dias_detenida,
    DATEDIFF(DAY, u.f_alta,        @corte) AS dias_desde_alta,
    u.lt_prometido,
    DATEDIFF(DAY, u.f_alta, @corte) - u.lt_prometido AS dias_sobre_la_promesa,
    CASE
        WHEN u.ultimo_hito IN ('planificada','pickeada','controlada') THEN 'MCR'
        WHEN u.ultimo_hito = 'despachada de MCR' AND u.circuito='andreani' THEN 'Andreani'
        WHEN u.ultimo_hito = 'despachada de MCR' THEN 'Transporte'
        WHEN u.ultimo_hito IN ('llegada al CDR','en recepcion del CDR') THEN 'CDR'
        WHEN u.ultimo_hito IN ('despachada del CDR') THEN 'Transporte'
        WHEN u.ultimo_hito = 'recibida en sucursal (caja)' THEN 'Sucursal'
        ELSE 'Abastecimiento'
    END                                     AS nodo_responsable,
    CASE
        WHEN DATEDIFF(DAY, u.f_ultimo_hito, @corte) >= 20 THEN 'critica'
        WHEN DATEDIFF(DAY, u.f_ultimo_hito, @corte) >= 10 THEN 'alta'
        ELSE 'media'
    END                                     AS severidad
FROM fact.ut u
WHERE u.cerrada = 0
  AND u.todas_anuladas = 0
  AND DATEDIFF(DAY, u.f_ultimo_hito, @corte) > @umbral_dias
ORDER BY dias_detenida DESC, u.ut;

/* --------- 2.2 El mismo pendiente resumido por nodo y etapa ------ */
/* Para la reunion: cuantas UT y cuantas lineas hay detenidas en cada
   lugar. La lista individual de 2.1 es para quien tiene que ir a buscarlas. */
SELECT
    u.ultimo_hito,
    COUNT(*)                                       AS ut_detenidas,
    SUM(u.lineas)                                  AS lineas,
    COUNT(DISTINCT u.codsuc)                       AS sucursales,
    MIN(DATEDIFF(DAY, u.f_ultimo_hito, @corte))    AS dias_min,
    MAX(DATEDIFF(DAY, u.f_ultimo_hito, @corte))    AS dias_max,
    AVG(CAST(DATEDIFF(DAY, u.f_ultimo_hito, @corte) AS FLOAT)) AS dias_promedio
FROM fact.ut u
WHERE u.cerrada = 0 AND u.todas_anuladas = 0
  AND DATEDIFF(DAY, u.f_ultimo_hito, @corte) > @umbral_dias
GROUP BY u.ultimo_hito
ORDER BY ut_detenidas DESC;

/* --------- 2.3 Lineas sin circuito asignado y sin anular --------- */
/* El agujero mas invisible: el pedido existe, el cliente lo pago, no
   tiene deposito asignado, no esta anulado y no aparece en ningun
   tablero de operacion porque no entro a ningun circuito. */
SELECT
    v.nropedidoweb, v.fecaltaped, v.codsuc, v.nombre_suc,
    v.codart, v.descripcion, v.cantbackorder,
    CASE WHEN v.fecplanificacion IS NULL THEN 'nunca se planifico'
         ELSE 'planificada sin deposito' END        AS situacion,
    DATEDIFF(DAY, v.fecaltaped, @corte)             AS dias_desde_alta
FROM stg.v_1060 v
WHERE v.circuito = 'sin_origen'
  AND v.es_anulada = 0
  AND v.fecrec_item IS NULL
  AND DATEDIFF(DAY, v.fecaltaped, @corte) > 7
ORDER BY dias_desde_alta DESC;

/* --------- 2.4 Backorder envejecido ------------------------------ */
SELECT
    v.nropedidoweb, v.fecaltaped, v.codsuc, v.nombre_suc,
    v.descripcion, v.cantbackorder,
    DATEDIFF(DAY, v.fecaltaped, @corte) AS dias_desde_alta
FROM stg.v_1060 v
WHERE v.cantbackorder > 0
  AND v.es_anulada = 0
  AND v.fecrec_item IS NULL
  AND DATEDIFF(DAY, v.fecaltaped, @corte) > 10
ORDER BY dias_desde_alta DESC;

/* --------- 2.5 Pedidos que necesitaron mas de un envio ----------- */
/* Un reenvio no es una linea mas del mismo pedido: es un segundo intento
   completo. Duplica el costo de entrega y el cliente ya espero una vez. */
SELECT
    v.nropedidoweb,
    COUNT(DISTINCT CAST(v.fecaltaped AS DATE)) AS intentos,
    MIN(CAST(v.fecaltaped AS DATE))            AS primer_intento,
    MAX(CAST(v.fecaltaped AS DATE))            AS ultimo_intento,
    MAX(v.nombre_suc)                          AS sucursal,
    MAX(v.descripcion)                         AS articulo,
    DATEDIFF(DAY, MIN(v.fecaltaped), MAX(COALESCE(v.fecrec_item, @corte)))
                                               AS dias_totales_de_espera
FROM stg.v_1060 v
GROUP BY v.nropedidoweb
HAVING COUNT(DISTINCT CAST(v.fecaltaped AS DATE)) > 1
ORDER BY intentos DESC, dias_totales_de_espera DESC;
