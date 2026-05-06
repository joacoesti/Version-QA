# Reglas para Claude · UNISOL Web V3 Modular

## Objetivo del repo

Aplicación web documental para consultar sectores, roles, tareas, procedimientos y anexos operativos de UNISOL.

## Regla de bajo consumo

No explorar todo el repo si la tarea no lo requiere.

## Archivos por tipo de tarea

### Cambios de contenido operativo
Tocar solo:
- docs/
- data/documentos-index.json

No tocar:
- index.html
- css/styles.css
- js/app.js
- js/router.js
- js/login.js

### Cambios de roles o sectores
Tocar solo:
- data/sectores.json
- data/roles.json
- data/jerarquia.json
- data/documentos-index.json

### Cambios visuales
Tocar solo:
- css/styles.css

### Cambios de configuración
Tocar solo:
- config/config.json

### Cambios de navegación o carga dinámica
Tocar solo:
- js/router.js
- js/app.js
- js/markdown.js

## Reglas generales

- No refactorizar sin pedido explícito.
- No borrar archivos sin avisar.
- No modificar producción/main sin instrucción explícita.
- Antes de cambios grandes, indicar archivos a tocar.
- Responder corto.
- Mantener compatibilidad con Vercel.


## V3.1 · Personas, roles y organigrama

Para separar rol de persona/referente:
- Editar `data/roles.json`.
- Editar `data/organigrama.json`.

No modificar `index.html`.

Para procedimientos:
- Mantener agrupación por sector → rol/persona → documento.
- Si se agrega un documento nuevo, crear el Markdown en `/docs` y declararlo en `data/documentos-index.json`.


## V3.2 · Organigrama recuperado

El organigrama global está en:
- `data/organigrama.json`

Reglas:
- No hardcodear organigrama en `index.html`.
- Para sumar, quitar o corregir personas/roles del organigrama, modificar solo `data/organigrama.json`.
- Mantener bloques y descripciones.
- No reemplazar el organigrama por una vista genérica.


## Reglas estrictas de bajo consumo

- No abrir `Version QA/` bajo ningún motivo.
- No abrir `data/contenido-original.json` salvo pedido explícito del usuario.
- No analizar `assets/`.
- Para contenido operativo: tocar solo `docs/` y `data/documentos-index.json`.
- Para organigrama: tocar solo `data/organigrama.json` y `data/jerarquia.json`.
- Para diseño: tocar solo `css/styles.css`.
- Para lógica: tocar solo el archivo `js/` específico de la tarea.
