# Plan de implementación — Pestañas "Explorador" / "Insights" en el dashboard

Contexto y convenciones (verificado leyendo el repo):

- Proyecto: `dashboard/` es React 18 + Vite 5 + Recharts. NO hay framework de tests
  (`package.json` solo define `dev`, `build`, `preview`). **Verificación única disponible:
  `npm run build` desde `dashboard/`** (debe terminar sin errores). No existe linter.
- Idioma de UI y documentación: español. NO añadir dependencias nuevas.
- Toda la UI del dashboard vive en un solo archivo `dashboard/src/App.jsx` con tres
  componentes: `App` (estado de `cube` y `filters`), `Sidebar` (filtros) y `Dashboard`
  (todo el contenido de `<main className="main">`), más `DonutResultado` como función
  local al final del archivo.
- Paleta real en `styles.css` (usar variables existentes, no colores sueltos nuevos salvo
  donde el enunciado pide azul explícito): `--accent: #1d4ed8`, `--accent-soft: #dbe4ff`,
  `--ink: #1c2733`, `--muted: #64748b`, `--line: #e2e8f0`, `--panel: #ffffff`,
  `--shadow`. El enunciado menciona `#2563eb`; se usa `var(--accent)` (#1d4ed8), que es
  el azul del proyecto, para no romper la coherencia de paleta. Ya existe `.sidebar-note`
  (fondo `--accent-soft`) reutilizable para la nota del sidebar en Insights.
- La subsección LaTeX a ampliar está en `latex/informe_proyecto.tex`, abre en la línea
  ~780 (`\subsection{Decisiones de diseño, accesibilidad y UX}`) y su `itemize` cierra
  con `\end{itemize}` justo antes de `\subsection{Reproducibilidad del dashboard}`.

Decisiones de diseño tomadas aquí (no había diseño previo para las tabs):

1. **El estado del tab se eleva a `App`** (no a `Dashboard`), porque el Sidebar debe
   recibirlo para mostrar la nota contextual y `App` es el ancestro común de `Sidebar` y
   `Dashboard`. El estado de `filters` ya vive en `App`, así que cambiar de pestaña no lo
   pierde (los componentes no se desmontan de forma que borre `filters`).
2. **Ambos paneles permanecen montados y se ocultan con CSS** (`hidden` + `.tabpanel`),
   en vez de desmontar el panel inactivo. Así los `useMemo` de `Dashboard` no se
   recalculan al alternar pestañas y el estado interno de los componentes (p. ej. toggles
   de métrica en `BarRanking`) se conserva. `Dashboard` renderiza ambos `<section
   role="tabpanel">` y recibe `tab` para fijar el atributo `hidden`.
3. **La footnote va solo en el panel Explorador**, porque su texto habla de la selección y
   de datos agregados; en Insights habría un encabezado propio. (Coherente y evita
   duplicarla.)
4. **Sidebar en Insights: nota discreta, no atenuación.** Se muestra una `.sidebar-note`
   extra con el texto "Los filtros aplican a la pestaña Explorador." cuando `tab ===
   'insights'`. No se deshabilitan los filtros (el usuario puede prepararlos antes de
   volver a Explorador). Más limpio que atenuar todo el sidebar.
5. **IDs ARIA fijos**: tabs `tab-explorador` / `tab-insights`; paneles `panel-explorador`
   / `panel-insights`. `aria-controls` del botón apunta al panel; `aria-labelledby` del
   panel apunta al botón.

---

# Implementation Plan

- [ ] 1. Añadir el estado del tab en `App` y pasarlo a `Sidebar` y `Dashboard`.
      En `App` añadir `const [tab, setTab] = useState('explorador')`. Pasar `tab` como prop
      a `<Sidebar ... tab={tab} />` y pasar `tab`, `setTab` a `<Dashboard ... tab={tab}
      setTab={setTab} />`. NO tocar el estado `filters` ni los callbacks existentes.
      Files: `dashboard/src/App.jsx`
      Verify: `cd dashboard && npm run build` compila sin errores (el tab aún no se usa en
      la UI, solo se declara y propaga).

- [ ] 2. En `Sidebar`, añadir la nota contextual cuando la pestaña activa es Insights.
      Ampliar la firma de `Sidebar({ ... })` para aceptar `tab`. Dentro del `<aside
      className="sidebar">`, inmediatamente después del `<div className="sidebar-note">`
      existente (el de "El número junto a cada opción…"), renderizar condicionalmente
      `{tab === 'insights' && (<div className="sidebar-note">Los filtros aplican a la
      pestaña <strong>Explorador</strong>. La pestaña Insights muestra hallazgos globales
      del histórico completo.</div>)}`. No cambiar nada más del Sidebar.
      Files: `dashboard/src/App.jsx`
      Verify: `cd dashboard && npm run build` compila sin errores.

- [ ] 3. Construir la barra de pestañas accesible dentro de `Dashboard`, como primer hijo
      de `<main className="main">` (antes de `main-head`). Ampliar la firma de `Dashboard`
      para aceptar `tab` y `setTab`. Insertar:
      un `<div className="tabs" role="tablist" aria-label="Vistas del tablero">` con dos
      `<button type="button" role="tab" className={tab==='explorador' ? 'tab active' :
      'tab'} id="tab-explorador" aria-selected={tab==='explorador'}
      aria-controls="panel-explorador" onClick={() => setTab('explorador')}>Explorador
      </button>` y su equivalente `tab-insights` / `panel-insights` / "Insights". Añadir
      navegación por teclado con `onKeyDown` en cada botón: flecha derecha activa y enfoca
      la otra pestaña, flecha izquierda idem (usar `document.getElementById('tab-insights'
      /'tab-explorador').focus()` y `setTab`). Los botones ya son enfocables con Tab y
      activables con Enter/Espacio por ser `<button>`.
      Files: `dashboard/src/App.jsx`
      Verify: `cd dashboard && npm run build` compila sin errores.

- [ ] 4. Envolver el contenido actual de `Dashboard` en dos paneles `role="tabpanel"` y
      repartir las secciones. Reestructurar el `return` de `Dashboard` así:
      - **Panel Explorador**: `<section id="panel-explorador" role="tabpanel"
        aria-labelledby="tab-explorador" className="tabpanel" hidden={tab !==
        'explorador'}>` que contiene, en este orden y tal como están hoy: `main-head`
        (ver item 6), `kpis`, `TemporalLine`, sección "Participantes vs. no participantes"
        (`section-title` + `grid` con `DonutParticipacion` + 3 `CompareProfile`), sección
        "Distribuciones y tasa de participación" (`section-title` + `grid` de 4
        `NumericDist`), sección "Participación por categorías" (`section-title` + `grid`
        de 7 `BarRanking`), y una NUEVA sección con `<div className="section-title">
        Oportunidad y equidad (según la selección)</div>` seguida de `OpportunityScatter`
        (prop `data={oportunidadSel}`) y `Heatmap` (prop `data={heatmapSel}`) — ambos
        movidos aquí desde la antigua sección "Preguntas de negocio". Cerrar con la
        `<p className="footnote">…</p>` existente (se mueve dentro de este panel).
      - **Panel Insights**: `<section id="panel-insights" role="tabpanel"
        aria-labelledby="tab-insights" className="tabpanel" hidden={tab !== 'insights'}>`
        con el encabezado del item 5, seguido de `ModalityArea` ("Composición de
        modalidades por año"), `StackedByFaculty` ("¿Qué modalidad prefiere cada
        facultad?"), y un `<div className="grid">` con `SeasonBars` + `<DonutResultado
        resultado={cube.resultadoMov} />`.
      Eliminar el antiguo `<div className="section-title">Modalidades en el tiempo</div>`
      y `<div className="section-title">Preguntas de negocio</div>` (ya no agrupan lo
      mismo); `ModalityArea` pasa a Insights sin ese section-title o con uno nuevo
      coherente si se desea. NO alterar ninguna lógica `useMemo` ni los cálculos; solo se
      reordena JSX y se reparten los componentes ya existentes.
      Files: `dashboard/src/App.jsx`
      Verify: `cd dashboard && npm run build` compila sin errores. Abrir `npm run dev` y
      confirmar que al cambiar de pestaña se conservan los filtros y que Explorador
      muestra scatter/heatmap reaccionando a filtros.

- [ ] 5. Añadir el encabezado introductorio del panel Insights (en español, sin causalidad).
      Como primer hijo del panel Insights, insertar un bloque `main-head` reutilizando el
      estilo existente: `<div className="main-head"><h2>Insights: hallazgos del histórico
      completo</h2><p>Estas vistas son <strong>agregados del histórico completo</strong> de
      eventos de movilidad y <strong>no se ven afectadas por los filtros</strong> del
      Explorador. Resumen los hallazgos principales del proyecto.</p></div>`. Opcional: una
      frase de hallazgo descriptivo como subtítulo adicional (p. ej. "La mayoría de los
      eventos de movilidad se concentran en el segundo semestre y en unas pocas
      facultades.") redactada sin afirmar causa-efecto.
      Files: `dashboard/src/App.jsx`
      Verify: `cd dashboard && npm run build` compila sin errores.

- [ ] 6. Quitar la coletilla "(no responde a los filtros)" de los subtítulos de las vistas
      que ahora viven en Insights, y ajustar el texto introductorio de Explorador.
      Cambios puntuales de string en `App.jsx`:
      - `ModalityArea` subtitle: quitar "Vista histórica global (no responde a los
        filtros)." → dejar "Eventos por modalidad desde 2010."
      - `StackedByFaculty` subtitle: quitar "Vista histórica global (no responde a los
        filtros)." → dejar "Composición (%) de los eventos de movilidad por facultad."
      - `SeasonBars` subtitle: quitar "Vista histórica global (no responde a los
        filtros)." → dejar "Eventos por año, separando primer y segundo semestre."
      - En la función `DonutResultado`, el `<p className="card-sub">`: quitar "Vista
        histórica global (no responde a los filtros)." → dejar "Resultado académico del
        curso de movilidad."
      - En `main-head` de Explorador: el párrafo introductorio puede ajustarse para
        mencionar que las vistas globales están en la pestaña Insights (p. ej. añadir una
        frase final "Las vistas globales del histórico están en la pestaña Insights.").
      NO tocar los subtítulos de `OpportunityScatter` ni de `Heatmap` (siguen diciendo
      "Según la selección.", que es correcto en Explorador).
      Files: `dashboard/src/App.jsx`
      Verify: `cd dashboard && npm run build` compila sin errores.

- [ ] 7. Añadir las reglas CSS de las pestañas en `styles.css`, siguiendo la paleta
      existente. Insertar un bloque nuevo (sugerido tras la sección "Main"/antes de los
      componentes de tarjeta) con EXACTAMENTE estas reglas:
      - `.tabs` — contenedor flex de la tablist: `display: flex; gap: 4px; border-bottom:
        1px solid var(--line); margin-bottom: 18px;`
      - `.tab` — botón de pestaña: `appearance: none; background: none; border: none;
        border-bottom: 3px solid transparent; padding: 10px 16px; font-size: 14px;
        font-weight: 600; color: var(--muted); cursor: pointer; margin-bottom: -1px;`
      - `.tab:hover` — `color: var(--ink);`
      - `.tab:focus-visible` — foco visible coherente con el resto: `outline: 2px solid
        var(--accent); outline-offset: 2px; border-radius: 4px;`
      - `.tab.active` — pestaña activa con borde inferior azul: `color: var(--accent);
        border-bottom-color: var(--accent);`
      - `.tabpanel` — `` (contenedor del panel; sin estilos propios obligatorios). El
        ocultamiento se logra con el atributo HTML `hidden`, que el navegador ya aplica
        como `display:none`; si se quiere reforzar, añadir `.tabpanel[hidden] { display:
        none; }`.
      No introducir colores literales nuevos salvo los ya definidos como variables.
      Files: `dashboard/src/styles.css`
      Verify: `cd dashboard && npm run build` compila sin errores; en `npm run dev` la
      pestaña activa muestra borde inferior y color azul, y el foco de teclado es visible.

- [ ] 8. Ampliar la subsección LaTeX "Decisiones de diseño, accesibilidad y UX" con la
      división en pestañas. En `latex/informe_proyecto.tex`, DENTRO del `itemize`
      existente (antes del `\end{itemize}` que precede a `\subsection{Reproducibilidad del
      dashboard}`), añadir un nuevo `\item` sin borrar lo existente, con la motivación y la
      accesibilidad del patrón de tabs. Contenido (adaptar redacción al estilo del
      documento):
      `\item \textbf{División en pestañas ``Explorador'' e ``Insights''.}` — párrafo con la
      motivación: separar lo interactivo-filtrable (KPIs, series, distribuciones, rankings,
      matriz de oportunidad y mapa de calor) de lo global-narrativo (modalidades en el
      tiempo, modalidad por facultad, estacionalidad y resultado de la experiencia);
      evitar que el usuario espere que las vistas globales reaccionen a los filtros; y dar
      un espacio dedicado a presentar los hallazgos principales. Incluir un sub-`itemize`
      o frase sobre accesibilidad del patrón: contenedor `role=tablist`, cada pestaña
      `<button role=tab>` con `aria-selected` y `aria-controls`, cada panel
      `role=tabpanel` con `aria-labelledby`, indicación visual de la pestaña activa (borde
      inferior azul) y navegación por teclado (Tab/Enter/Espacio y flechas izquierda /
      derecha entre pestañas).
      Files: `latex/informe_proyecto.tex`
      Verify: no hay toolchain LaTeX garantizado en el entorno; verificación mínima =
      revisar que el `\item` quede dentro del `itemize` (entre su apertura y
      `\end{itemize}`), que los entornos estén balanceados y que no se haya borrado texto
      previo. Si `pdflatex`/`latexmk` está disponible, compilar `informe_proyecto.tex` y
      confirmar que genera PDF sin errores nuevos.

Notas finales / supuestos:
- No se añaden tests porque el proyecto no tiene framework de pruebas; la verificación es
  `npm run build` + comprobación visual en `npm run dev`. Esto es consistente con el repo.
- No se modifican `data.js`, los componentes de `components/`, ni los `useMemo` de
  `Dashboard`: la tarea es puramente de presentación (reorganización de JSX + CSS + estado
  de tab + doc). Si durante la implementación se descubre que `cube.resultadoMov` u otra
  prop cambió de nombre, respetar el nombre real del código (hoy es `cube.resultadoMov`).
