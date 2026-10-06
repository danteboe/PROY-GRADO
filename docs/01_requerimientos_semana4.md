# Documento de requerimientos inicial (Semana 4)

**Etapa CRISP-DM:** Comprensión del problema.
**Objetivo específico asociado:** OE1.

> Este documento convierte la actividad de la semana 4 del cronograma
> ("reunión inicial y levantamiento detallado de requerimientos") en un
> entregable concreto. Dado que la ejecución del proyecto se realiza sobre un
> conjunto de datos ya entregado y anonimizado, los requerimientos se formulan a
> partir de la propuesta aprobada y se **validan contra la disponibilidad real
> de datos** verificada en las semanas 5-6. Cuando una necesidad de la propuesta
> no es sustentable con los datos entregados, se deja constancia explícita.

## 1. Perfiles de usuario

| Perfil | Descripción | Necesidad principal |
|---|---|---|
| Analista de la Oficina de Internacionalización | Consulta y reporta indicadores de participación. | Explorar participación por programa, facultad, periodo y modalidad sin depender del desarrollador. |
| Coordinación / dirección de la Oficina | Toma decisiones de planeación y promoción. | Visión agregada, tendencias temporales y comparación entre unidades. |
| Equipo técnico / futuro mantenedor | Mantiene y actualiza la herramienta. | Pipeline reproducible y documentación de transformaciones. |

## 2. Preguntas analíticas prioritarias

Derivadas de la sección de metodología de la propuesta y priorizadas según la
disponibilidad de datos confirmada:

1. **PA1 — Evolución temporal.** ¿Cómo ha evolucionado la participación en
   movilidad a lo largo de los años? ¿Se observa el efecto de la pandemia?
2. **PA2 — Participación por unidad académica.** ¿Qué facultades y programas
   presentan mayor participación (en volumen y en tasa)?
3. **PA3 — Modalidades.** ¿Qué modalidades de movilidad son más frecuentes
   (intercambio internacional, doble titulación, semana internacional, etc.)?
4. **PA4 — Momento de la trayectoria.** ¿En qué punto del avance académico
   (semestre) ocurre típicamente la movilidad?
5. **PA5 — Perfil académico asociado.** ¿Qué características académicas de
   ingreso y trayectoria (ICFES, PGA, percentil, nivel de inglés) se asocian con
   participar frente a no participar?
6. **PA6 — Diferencias entre grupos.** ¿Hay diferencias de participación por
   género, estrato o tipo de admisión?
7. **PA7 — Modelamiento (fase posterior).** ¿Es posible estimar la probabilidad
   de participación de un estudiante a partir de información previa al evento?

## 3. Indicadores relevantes (preliminares)

- Número y tasa de estudiantes con movilidad (global, por facultad, por programa).
- Participación por año y por modalidad.
- Semestre de avance promedio al momento de la movilidad.
- Comparación de perfil académico (participantes vs. no participantes).

## 4. Dimensiones de segmentación

Año/periodo, facultad, programa, nivel (pregrado/posgrado), modalidad, género,
estrato social, tipo de admisión, rango de PGA y de percentil.

## 5. Casos de uso (alcance funcional del dashboard, fases posteriores)

- CU1: Ver resumen general e indicadores principales.
- CU2: Explorar participación filtrando por facultad/programa/periodo/modalidad.
- CU3: Comparar perfil académico de participantes y no participantes.
- CU4: Consultar resultados del modelo analítico y su explicabilidad.

## 6. Requerimientos

### Funcionales
- RF1: Integrar las fuentes autorizadas en un dataset analítico reproducible.
- RF2: Calcular indicadores de participación por las dimensiones de segmentación.
- RF3: Presentar visualizaciones interactivas con filtros (fase 5).
- RF4: Incorporar un componente de modelamiento con explicabilidad (fase 4-5).

### No funcionales
- RNF1: Reproducibilidad (pipeline ejecutable extremo a extremo).
- RNF2: Privacidad y minimización de datos (Ley 1581 de 2012).
- RNF3: Trazabilidad de las decisiones metodológicas.
- RNF4: Mantenibilidad (código modular y documentado).

## 7. Restricciones y supuestos

- Los datos están anonimizados; no se dispone de una tabla explícita de
  "experiencias de internacionalización": la participación debe **derivarse** de
  los registros académicos (ver `docs/03_calidad_datos` y el notebook 03).
- Se prioriza la minimización: variables sensibles (estrato, género) se usan solo
  para análisis agregado de equidad, no como insumo obligatorio del modelo.
- El foco principal de modelamiento es el **pregrado**, nivel con mayor volumen y
  mejor cobertura de la señal de movilidad.

## 8. Criterios de éxito iniciales (semanas 1-9)

- CE1: Dataset analítico documentado y reproducible desde las fuentes.
- CE2: Señal de internacionalización definida, justificada y auditable.
- CE3: Informe de calidad de datos con reglas de limpieza aplicadas.
- CE4: EDA que responde PA1-PA6 con figuras e indicadores.
- CE5: Selección justificada de la(s) pregunta(s) de modelamiento (PA7).
