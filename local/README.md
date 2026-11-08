# Casa + negocio: modelo 3D y plan del local

Esta carpeta no tiene nada que ver con el bot ni con el servidor. Es el diseño del local que
va en la casa: una parte para dar el **servicio** (gabinete de masajes y reflexología), una
**tienda** a la calle y la oficina convertida en **depósito** para vender online.

Página con el modelo 3D y el plan completo: https://claude.ai/artifact/QdHqXFLhr8wXBGwt1suP6x

## Qué hay acá

| Archivo | Para qué sirve |
| --- | --- |
| `casa-negocio.ifc` | El modelo para **Revit** (o ArchiCAD, SketchUp, BIMvision). |
| `visor.html` | La página del modelo 3D con el plan de negocio. Es lo que está publicado. |
| `generar_modelo.py` | Tiene todas las medidas. Si cambiás algo, se vuelve a generar todo. |
| `modelo.json` | Las mismas medidas, para el visor 3D. |
| `visor_plantilla.html` | El diseño de la página (sin los datos). |

## Abrirlo en Revit

1. Archivo → Abrir → IFC → elegí `casa-negocio.ifc`.
2. Trae paredes, 10 puertas, 5 ventanas, 10 ambientes con sus m² y 36 muebles.
3. Cada ambiente y mueble tiene la propiedad `Casa_Negocio → Zona`
   (Servicio, Tienda, Venta online, Casa) para filtrar o armar tablas.
4. Guardalo como `.rvt` y seguí trabajando ahí.

## Cambiar medidas

Las medidas están estimadas a partir de capturas (terreno de 10,50 × 11,00 m). Para poner las
reales, editá las listas `AMBIENTES`, `PAREDES` y `MUEBLES` en `generar_modelo.py` y corré:

```bash
pip install ifcopenshell
python generar_modelo.py
```

Eso regenera el IFC, el JSON y `visor.html`.

## El plan en tres líneas

1. **Vender ya:** gift cards y packs de sesiones para Navidad (sin stock, link de Mercado Pago).
2. **Producto propio:** kit "Reflexología en casa" con video por QR. Después aceites y cremas
   con ANMAT, aromas, almohadillas de semillas. Accesorios de yoga solo en el local.
3. **Canales:** catálogo de WhatsApp + Instagram + Mercado Pago. Tiendanube cuando WhatsApp
   no dé abasto. Antes de gastar en obra: habilitación municipal y monotributo.
