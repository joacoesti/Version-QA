# UNISOL Web V3 Modular

Versión modular de la web de instructivos operativos UNISOL.

## Objetivo

Separar la app visual del contenido operativo para que el proyecto sea más liviano, más escalable y consuma menos tokens al trabajar con Claude/Cowork.

## Cómo probar localmente

Desde esta carpeta:

```cmd
py -m http.server 8000
```

Luego abrir:

```text
http://localhost:8000
```

Clave de acceso:

```text
unisol2026
```

## Estructura

```text
index.html
css/styles.css
js/
config/config.json
data/
docs/
assets/
```

## Datos

- `data/sectores.json`: sectores visibles.
- `data/roles.json`: puestos/roles por sector.
- `data/documentos-index.json`: índice liviano de documentos.
- `data/jerarquia.json`: reporte, nivel y etiqueta de cada rol.
- `data/contenido-original.json`: respaldo de la estructura anterior.

## Documentos

Los textos largos viven en Markdown dentro de `/docs`.

Ejemplo:

```text
docs/cocina/jefe-cocina-tareas-diarias.md
```

La app carga el documento solo cuando el usuario hace click.

## Regla principal

Para cargar o corregir contenido operativo, no modificar `index.html`.  
Modificar solo:

```text
docs/
data/documentos-index.json
data/roles.json
data/sectores.json
```

## Estado

Esta V3 conserva:
- login;
- logo;
- roles;
- organigrama básico;
- buscador;
- descarga de planillas;
- carga modular de documentos.

Pendiente:
- migrar el editor visual anterior para que edite Markdown/JSON modular.


## Cambios V3.1

- Procedimientos ahora se visualiza por **sector → rol/persona → documento**.
- Se agrega `data/organigrama.json` para recuperar y ampliar la estructura del organigrama sin tocar `index.html`.
- `data/roles.json` incluye campos separables:
  - `puesto`
  - `persona`
  - `reporta`
  - `nivel`
- Esto permite cargar nombres propios o referentes más adelante sin modificar la app visual.

## Dónde cargar personas o referentes

Editar:

```text
data/roles.json
data/organigrama.json
```

No tocar `index.html`.


## Cambios V3.2

- Se recupera el organigrama original desde el `index.html` anterior.
- El contenido ahora vive en `data/organigrama.json`.
- Se conserva la lógica de bloques:
  - Dirección estratégica.
  - Administración y Control.
  - Producción y Elaboración.
  - Salón y Atención Comercial.
  - Soporte Operativo.
- Se recuperan tarjetas clickeables con modal de detalle.
- Para modificar el organigrama, editar `data/organigrama.json`. No tocar `index.html`.
