# AGENTS.md

## Contexto del proyecto

- **Curso:** SPTI02423 - Proyecto Integrador (Cibertec, Ciclo 6, Sección T6HO)
- **Evaluación:** T1 - Sprint 1 bajo marco Scrum
- **Entregable fuente:** `PROYECTO INTEGRADOR-T1.docx`
- **Secciones requeridas:** documentación del proyecto (nombre, problema, justificación, objetivos, alcance del Sprint 1, SEPTE), Sprint Planning con 5 historias de usuario, Product Backlog, incremento del producto, retrospectiva, evidencia individual por integrante e informe de participación del equipo.

## Regla principal: JSON → HTML → Word

Toda la información del proyecto pasa por tres etapas, siempre en este orden:

1. **JSON = fuente de verdad.** Los datos se editan y viven aquí. Estructura clara, nombres en `camelCase`, fechas en ISO 8601 (`YYYY-MM-DD`).
2. **HTML = vista de revisión.** Se genera a partir del JSON, sin duplicar contenido escrito a mano. Sirve para leer, afinar y validar la información. Debe abrir en el navegador con doble clic, sin servidor ni build.
3. **Word = entregable final.** Solo cuando la información ya está afinada y aprobada, se exporta a `.docx`. El Word se genera desde el mismo JSON, nunca se redacta a mano como fuente.

- **Nunca** dejar datos hardcodeados en el HTML: si un dato cambia, se cambia en el JSON y la vista se regenera.
- **Nunca** editar el `.docx` como fuente. Si hay que corregir algo, se corrige en el JSON y se vuelve a exportar.
- No se acepta contenido de negocio únicamente en Markdown, TXT o suelto en el código.

## Estructura de carpetas

```
/
├── AGENTS.md
├── data/                 # JSON: fuente de verdad
│   ├── proyecto.json     # nombre, problema, justificación, objetivos, alcance, SEPTE
│   ├── integrantes.json  # equipo, roles Scrum, participación
│   ├── historias.json    # historias de usuario (5) con prioridad, estimación, criterios
│   ├── backlog.json      # Product Backlog del Sprint
│   ├── incremento.json   # funcionalidades, evidencias y capturas
│   ├── retrospectiva.json
│   └── individual/       # una evidencia individual por integrante
│       └── <integrante>.json
├── site/                 # HTML: vistas de la información
│   ├── assets/
│   │   ├── estilos.css
│   │   └── evidencias/   # capturas, mockups, tablero, BD
│   ├── index.html        # índice general del informe
│   ├── proyecto.html
│   ├── sprint-planning.html
│   ├── backlog.html
│   ├── incremento.html
│   ├── retrospectiva.html
│   └── equipo.html
├── build/                # generación del Word
│   └── exportar-word.js  # lee data/*.json y produce el .docx
└── entrega/              # solo versiones afinadas y aprobadas
    └── PROYECTO INTEGRADOR-T1.docx
```

## Formato de los JSON

- Un archivo por dominio de información; nada de JSON gigantes mezclando secciones.
- Todo archivo incluye un identificador y su origen:

```json
{
  "id": "proyecto",
  "titulo": "Nombre del proyecto",
  "actualizado": "2026-11-18",
  "secciones": []
}
```

- Colecciones siempre como arreglos de objetos con `id` estable (kebab-case): `"id": "hu-01"`.
- Estados y prioridades con valores controlados: `estado: "pendiente" | "en-progreso" | "hecho"`, `prioridad: "alta" | "media" | "baja"`.
- Texto en español, UTF-8, sin emojis en los datos.

## Formato de los HTML

- HTML5 semántico (`header`, `nav`, `main`, `section`, `table`, `footer`), sin frameworks ni dependencias externas.
- Estilos en un único archivo `site/assets/estilos.css` (o `<style>` compartido), tipografía del sistema, diseño responsive.
- Cada vista: encabezado con el nombre del proyecto, navegación entre secciones y tabla/ficha que refleje los datos del JSON correspondiente.
- Las tablas de Product Backlog e integrantes deben verse como tablas reales, legibles y con encabezados claros.
- Evidencias visuales: enlazar las imágenes desde `site/assets/evidencias/`.
- El HTML debe ser accesible: `lang="es"`, contraste suficiente, `alt` en imágenes y sin depender solo del color.

## Formato del Word (exportación final)

- Formato base: el entregable oficial `PROYECTO INTEGRADOR-T1.docx` (carátula, consolidado y rúbrica se conservan tal cual).
- El contenido de las secciones se inserta en el orden del enunciado: 1. Documentación, 2. Sprint Planning, 3. Product Backlog, 4. Incremento, 5. Retrospectiva, 6. Evidencia individual, 7. Participación del equipo.
- Estilos Word nativos: `Título 1` para las secciones numeradas, `Título 2` para subsecciones, `Normal` para párrafos y tablas con encabezado repetido.
- Tablas del Word: mismas columnas y mismos datos que las tablas HTML (`historias.json`, `backlog.json`, `integrantes.json`).
- Las imágenes de `site/assets/evidencias/` se insertan con su pie de figura ("Figura N: descripción").
- Cada exportación se guarda en `entrega/PROYECTO INTEGRADOR-T1.docx` y la fecha de `actualizado` del JSON queda reflejada en el documento.

## Flujo de trabajo

1. Editar o crear el JSON en `data/`.
2. Actualizar la vista HTML correspondiente en `site/` para reflejar el cambio.
3. Verificar que ambos coinciden (mismos ids, mismos valores, mismos totales).
4. Si el cambio afecta varias secciones, revisar `site/index.html`.
5. Revisar y afinar el contenido leyendo el HTML hasta que el equipo lo apruebe.
6. Solo al aprobar: exportar con `build/exportar-word.js` a `entrega/PROYECTO INTEGRADOR-T1.docx`.

**Regla de oro:** el Word nunca se adelanta. Se exporta únicamente cuando la información del HTML ya está revisada, y siempre después de la última edición del JSON.

## Reglas para el agente

- Antes de responder sobre el contenido del proyecto, leer los JSON, no el `.docx`.
- Al añadir una sección nueva del informe: crear su JSON y su HTML, y enlazarla desde `site/index.html`.
- No crear documentación duplicada en Markdown ni en Word; si se necesita un resumen, va como JSON + HTML.
- Mantener consistencia de nombres entre JSON (`camelCase`) y HTML (`data-*` o `id` en kebab-case).
- Cualquier total, conteo o puntaje mostrado en HTML debe calcularse desde el JSON o coincidir exactamente con él.
- **No exportar a Word sin pedido explícito.** Por defecto se trabaja en JSON + HTML; el `.docx` solo se genera cuando el usuario confirma que la información está afinada.
- Si el usuario pide "pasar a Word", "generar el entregable" o similar: verificar que el JSON y el HTML estén sincronizados, exportar a `entrega/` y reportar qué secciones quedaron incluidas.
- Al cambiar el JSON después de una exportación, marcar el Word como desactualizado e indicarlo al usuario (no reexportar por iniciativa propia).
