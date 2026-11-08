"""Modelo de la casa + local (servicios, tienda y venta online).

La fuente de verdad es modelo.json: ambientes (poligonos), paredes (en
cualquier angulo, con puertas y ventanas) y muebles (con giro). El visor web
lo edita y lo guarda en su base; para pasar esos cambios a Revit se baja el
plano guardado a modelo.json y se corre este script.

Genera:
  - casa-negocio.ifc : modelo BIM. Se abre en Revit (Archivo > Abrir > IFC),
                       ArchiCAD, SketchUp o visores gratis como BIMvision.
  - visor.html       : el visor 3D editable (sale de visor_plantilla.html).

Uso:  pip install ifcopenshell  &&  python generar_modelo.py
      python generar_modelo.py --desde plano.json   (usa el plano guardado
      en el visor: el documento "planos/actual" bajado de su base)
Medidas en metros. Plano visto desde arriba: x crece a la derecha,
y crece hacia la calle.
"""
import json
import math
import os
import sys

import numpy as np
import ifcopenshell
import ifcopenshell.api as api
import ifcopenshell.api.aggregate, ifcopenshell.api.context, ifcopenshell.api.feature  # noqa: E401
import ifcopenshell.api.geometry, ifcopenshell.api.project, ifcopenshell.api.pset  # noqa: E401
import ifcopenshell.api.root, ifcopenshell.api.spatial, ifcopenshell.api.unit  # noqa: E401
from ifcopenshell.util.shape_builder import ShapeBuilder

AQUI = os.path.dirname(os.path.abspath(__file__))

# centro aproximado de las puertas y ventanas que arma ifcopenshell, medido
# sobre el espesor de la pared (para que queden centradas en el muro)
CENTRO_MARCO = {"puerta": 0.04, "porton": 0.04, "ventana": 0.09}


def area(puntos):
    s = 0.0
    for i, (x0, y0) in enumerate(puntos):
        x1, y1 = puntos[(i + 1) % len(puntos)]
        s += x0 * y1 - x1 * y0
    return round(abs(s) / 2, 1)


def cargar():
    with open(os.path.join(AQUI, "modelo.json"), encoding="utf-8") as fh:
        return json.load(fh)


def a_ifc(m, destino):
    zonas = m["zonas"]
    alto = m["alto"]
    # el IFC usa Y hacia el fondo: se invierte respecto del plano
    fondo = max(max(p["y0"], p["y1"]) for p in m["paredes"])

    def ifc_xy(x, y):
        return x, fondo - y

    def matriz(x, y, z=0.0, angulo=0.0):
        mm = np.eye(4)
        c, s = math.cos(angulo), math.sin(angulo)
        mm[0][0], mm[0][1], mm[1][0], mm[1][1] = c, -s, s, c
        mm[0][3], mm[1][3], mm[2][3] = x, y, z
        return mm

    f = api.project.create_file(version="IFC4")
    proyecto = api.root.create_entity(f, ifc_class="IfcProject", name="Casa + negocio")
    unidades = [api.unit.add_si_unit(f, unit_type=t) for t in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
    api.unit.assign_unit(f, units=unidades)
    ctx = api.context.add_context(f, context_type="Model")
    cuerpo = api.context.add_context(f, context_type="Model", context_identifier="Body",
                                     target_view="MODEL_VIEW", parent=ctx)
    sitio = api.root.create_entity(f, ifc_class="IfcSite", name="Terreno")
    edificio = api.root.create_entity(f, ifc_class="IfcBuilding", name="Casa + negocio")
    planta = api.root.create_entity(f, ifc_class="IfcBuildingStorey", name="Planta baja")
    api.aggregate.assign_object(f, products=[sitio], relating_object=proyecto)
    api.aggregate.assign_object(f, products=[edificio], relating_object=sitio)
    api.aggregate.assign_object(f, products=[planta], relating_object=edificio)
    sb = ShapeBuilder(f)
    contenidos = []

    def pset(el, props):
        ps = api.pset.add_pset(f, product=el, name="Casa_Negocio")
        api.pset.edit_pset(f, pset=ps, properties=props)

    # contrapiso: caja que envuelve todas las paredes
    xs = [v for p in m["paredes"] for v in (p["x0"], p["x1"])]
    ys = [v for p in m["paredes"] for v in (p["y0"], p["y1"])]
    losa = api.root.create_entity(f, ifc_class="IfcSlab", name="Contrapiso")
    ancho, prof = max(xs) - min(xs) + 0.2, max(ys) - min(ys) + 0.2
    rep = sb.get_representation(cuerpo, [sb.extrude(sb.rectangle(size=(ancho, prof)), magnitude=0.15)])
    api.geometry.assign_representation(f, product=losa, representation=rep)
    api.geometry.edit_object_placement(f, product=losa, matrix=matriz(*ifc_xy(min(xs) - 0.1, max(ys) + 0.1), -0.15))
    contenidos.append(losa)

    # paredes en cualquier angulo, con sus aberturas
    for p in m["paredes"]:
        dx, dy = p["x1"] - p["x0"], p["y1"] - p["y0"]
        largo = math.hypot(dx, dy)
        if largo < 0.05:
            continue
        ux, uy = dx / largo, dy / largo            # direccion en el plano
        iux, iuy = ux, -uy                          # direccion en el IFC
        inx, iny = -iuy, iux                        # normal (eje y local) en el IFC
        ang = math.atan2(iuy, iux)
        t = p["t"]
        extra = t / 2
        pared = api.root.create_entity(f, ifc_class="IfcWall",
                                       name="Pared exterior" if t >= 0.2 else "Tabique")
        rep = api.geometry.add_wall_representation(f, context=cuerpo, length=largo + 2 * extra,
                                                   height=alto, thickness=t, offset=-t / 2)
        api.geometry.assign_representation(f, product=pared, representation=rep)
        x0, y0 = ifc_xy(p["x0"] - ux * extra, p["y0"] - uy * extra)
        api.geometry.edit_object_placement(f, product=pared, matrix=matriz(x0, y0, 0, ang))
        contenidos.append(pared)
        for o in p["aberturas"]:
            a, b = max(0.0, o["a"]), min(largo, o["b"])
            if b - a < 0.05:
                continue
            ancho_ab, alto_ab = b - a, o["dintel"] - o["antepecho"]
            ox, oy = ifc_xy(p["x0"] + ux * a, p["y0"] + uy * a)
            hueco = api.root.create_entity(f, ifc_class="IfcOpeningElement", name=o["nombre"])
            rep = api.geometry.add_wall_representation(f, context=cuerpo, length=ancho_ab, height=alto_ab,
                                                       thickness=t + 0.1, offset=-(t + 0.1) / 2)
            api.geometry.assign_representation(f, product=hueco, representation=rep)
            api.geometry.edit_object_placement(f, product=hueco, matrix=matriz(ox, oy, o["antepecho"], ang))
            api.feature.add_feature(f, feature=hueco, element=pared)
            if o["tipo"] == "pase":
                continue
            if o["tipo"] == "ventana":
                el = api.root.create_entity(f, ifc_class="IfcWindow", name=o["nombre"])
                rep = api.geometry.add_window_representation(f, context=cuerpo, overall_height=alto_ab,
                                                             overall_width=ancho_ab)
            else:
                el = api.root.create_entity(f, ifc_class="IfcDoor", name=o["nombre"])
                op = "DOUBLE_DOOR_SINGLE_SWING" if o["tipo"] == "porton" else "SINGLE_SWING_LEFT"
                rep = api.geometry.add_door_representation(f, context=cuerpo, overall_height=alto_ab,
                                                           overall_width=ancho_ab, operation_type=op)
            el.OverallHeight, el.OverallWidth = alto_ab, ancho_ab
            api.geometry.assign_representation(f, product=el, representation=rep)
            c = CENTRO_MARCO.get(o["tipo"], 0.05)
            api.geometry.edit_object_placement(
                f, product=el, matrix=matriz(ox - inx * c, oy - iny * c, o["antepecho"], ang))
            api.feature.add_filling(f, opening=hueco, element=el)
            contenidos.append(el)

    # ambientes (IfcSpace) con su zona y m2
    for amb in m["ambientes"]:
        esp = api.root.create_entity(f, ifc_class="IfcSpace", name=amb["num"] or amb["nombre"])
        esp.LongName = amb["nombre"]
        pts = [ifc_xy(x, y) for x, y in amb["puntos"]]
        perfil = sb.polyline([(x, y) for x, y in pts], closed=True)
        rep = sb.get_representation(cuerpo, [sb.extrude(sb.profile(perfil), magnitude=alto)])
        api.geometry.assign_representation(f, product=esp, representation=rep)
        api.geometry.edit_object_placement(f, product=esp, matrix=np.eye(4))
        api.aggregate.assign_object(f, products=[esp], relating_object=planta)
        pset(esp, {"Zona": zonas.get(amb["zona"], amb["zona"]), "Area_m2": area(amb["puntos"]),
                   "Uso": amb.get("info") or amb["nombre"]})

    # muebles: caja centrada, con giro
    for mu in m["muebles"]:
        el = api.root.create_entity(f, ifc_class="IfcFurniture", name=mu["nombre"])
        el.ObjectType = mu["nombre"]
        perfil = sb.rectangle(size=(mu["w"], mu["d"]), position=(-mu["w"] / 2, -mu["d"] / 2))
        rep = sb.get_representation(cuerpo, [sb.extrude(perfil, magnitude=max(mu["h"], 0.01))])
        api.geometry.assign_representation(f, product=el, representation=rep)
        x, y = ifc_xy(mu["x"], mu["y"])
        api.geometry.edit_object_placement(f, product=el,
                                           matrix=matriz(x, y, mu.get("z", 0), -math.radians(mu.get("rot", 0))))
        pset(el, {"Zona": zonas.get(mu["zona"], mu["zona"]), "Uso": mu.get("info") or mu["nombre"]})
        contenidos.append(el)

    api.spatial.assign_container(f, products=contenidos, relating_structure=planta)
    f.write(destino)


def a_visor(m):
    """Mete el modelo adentro de la pagina del visor, como plano de partida."""
    datos = json.dumps(m, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    with open(os.path.join(AQUI, "visor_plantilla.html"), encoding="utf-8") as fh:
        pagina = fh.read().replace("__MODELO__", datos)
    with open(os.path.join(AQUI, "visor.html"), "w", encoding="utf-8") as fh:
        fh.write(pagina)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--desde":
        with open(sys.argv[2], encoding="utf-8") as fh:
            bajado = json.load(fh)
        bajado = bajado.get("modelo", bajado)
        with open(os.path.join(AQUI, "modelo.json"), "w", encoding="utf-8") as fh:
            json.dump(bajado, fh, ensure_ascii=False, indent=1)
        print("modelo.json actualizado con el plano guardado")
    modelo = cargar()
    a_ifc(modelo, os.path.join(AQUI, "casa-negocio.ifc"))
    a_visor(modelo)
    print("Listo: casa-negocio.ifc y visor.html")
