# AGENTS.md — Reglas operativas para agentes de ASTRA HEALTH

**Versión:** 2.2.1 — actualizada el 2 de noviembre de 2026; incorpora D-19 a D-35 (1 y 2 de noviembre de 2026) y las correcciones 2.2.1.

## 1. Propósito

Este documento establece las reglas obligatorias para los agentes de IA que colaboren en el desarrollo de ASTRA HEALTH, prototipo educativo de monitoreo de salud de astronautas para NASA Space Apps Challenge 2026.

**La aplicación todavía no ha sido implementada.** Ningún agente debe asumir que existen archivos, módulos o funcionalidades sin comprobarlo.

## 2. Arquitectura obligatoria

- Monorepositorio con npm workspaces.
- React, TypeScript y Vite para frontend.
- NestJS y TypeScript para backend.
- **Prisma con SQLite en el MVP**; PostgreSQL en una fase posterior.
- Dexie e IndexedDB para almacenamiento offline.
- Service worker para el app shell offline mediante **`vite-plugin-pwa`** (autorizado, D-26).
- **Zod** para esquemas y validación en tiempo de ejecución, compartidos desde `packages/contracts` (autorizado, D-19).
- Paquetes compartidos `contracts` y `health-engine`.
- Vitest, Jest y Supertest para pruebas; Playwright en una fase posterior.

La superficie mínima de API del MVP está en `ARCHITECTURE.md` §5.2 y sus esquemas se detallan en T-005.

No introducir microservicios, Kafka, nuevas bases de datos, Docker en el MVP ni frameworks alternativos sin aprobación explícita.

**No añadir inteligencia artificial offline ni funciones predictivas** sin una decisión explícita del líder técnico.

Consultar los documentos relevantes para el ticket (`PROJECT_SPEC.md`, `ARCHITECTURE.md`, `TASKS.md`, `TEST_PLAN.md`) antes de proponer cambios importantes.

Si un documento necesario no está disponible, solicitarlo o indicar la limitación. No fingir que fue consultado.

## 3. Reglas antes de programar

Antes de modificar código:
1. Inspeccionar el estado real del repositorio.
2. Identificar los archivos relevantes.
3. Revisar contratos y dependencias.
4. Confirmar el objetivo y los criterios de aceptación.
5. Identificar posibles conflictos con trabajo de otros integrantes.
6. Proponer un plan breve cuando el cambio sea significativo.

No ejecutar cambios destructivos sin autorización.

No reemplazar implementaciones existentes únicamente porque otra solución parezca más elegante.

## 4. Alcance de las tareas

Cada agente recibe un ticket con los campos de `TASKS.md` §3:
- Identificador y título.
- Responsable.
- Fase.
- Dependencias.
- Objetivo.
- Alcance permitido (archivos o módulos).
- Criterios de aceptación.
- Pruebas asociadas.
- Evidencia de verificación.

Modificar únicamente lo necesario para cumplir el ticket.

Si se detecta un problema fuera del alcance, reportarlo antes de realizar cambios adicionales.

## 5. Coordinación entre agentes

Evitar que varios agentes editen simultáneamente los mismos archivos.

Utilizar ramas Git independientes.

No modificar contratos compartidos sin coordinación con el líder técnico. Los contratos se congelan al cerrar T-005 y T-102.

Antes de integrar una rama:
- Revisar diferencias.
- Ejecutar pruebas relevantes.
- Identificar conflictos.
- Verificar compatibilidad.
- Documentar cambios importantes.

No fusionar cambios con fallos críticos o conflictos sin resolver.

## 6. Reglas de código

- TypeScript con tipos explícitos donde aporten claridad.
- Evitar `any` innecesarios.
- Funciones pequeñas y responsabilidades separadas.
- No duplicar lógica de negocio.
- Validar entradas en el backend con los esquemas Zod de `packages/contracts`. Los tipos de TypeScript no sustituyen la validación en tiempo de ejecución, y la validación estructural no es evaluación clínica.
- Manejar errores explícitamente.
- Evitar dependencias innecesarias.
- No introducir abstracciones complejas sin justificación.
- Nombres de código en inglés.
- Explicaciones y documentación de trabajo principalmente en español.
- Textos de interfaz mediante claves de traducción; inglés como idioma principal del MVP.

Priorizar código comprensible para un equipo mayoritariamente principiante.

## 7. Integridad de datos

- Toda operación offline conserva un UUID estable.
- Los reintentos no producen duplicados.
- Un mismo UUID con contenido distinto se rechaza con 409 (resultado `CONFLICT` en lotes); nunca se sobrescribe.
- En lotes, cada elemento recibe su propio resultado (`ACCEPTED`, `DUPLICATE`, `CONFLICT`, `INVALID`); un lote puede tener éxitos y fallos independientes.
- Los errores permanentes (`INVALID`, `CONFLICT`) no se reintentan automáticamente; los errores de red y los errores transitorios del servidor sí.
- Los registros de dominio locales (mediciones, incidentes, eventos y mensajes) se conservan también después de confirmar la sincronización. Solo el outbox puede actualizarse o depurarse tras `CONFIRMED`. Un error nunca borra datos.
- En el servidor, la medición, el evento o el mensaje se crea junto con su transmisión en una misma transacción.
- Solo una sincronización activa a la vez (`navigator.locks`).
- Distinguir guardado localmente, en cola, confirmado, en tránsito, entregado y error.
- **Confirmado por el servidor no significa entregado al destinatario.**
- Los tiempos de captura (`capturedAtReal`, `capturedAtSim`) nunca se reescriben al sincronizar.
- Las operaciones críticas soportan recuperación tras recarga.

## 8. Seguridad médica y científica

ASTRA HEALTH no es un dispositivo médico certificado.

Nunca inventar umbrales clínicos, diagnósticos, tratamientos, procedimientos de emergencia, referencias científicas ni valores fisiológicos específicos del entorno espacial.

En el MVP (D-28/D-29):
- La evaluación clínica devuelve "sin reglas clínicas validadas".
- La orientación ante mediciones se limita a repetir la medición, reposar o avisar al médico de vuelo; no incluye rangos numéricos ni etiquetas de estado.
- La guía de emergencia (D-28) es un prototipo educativo con esta secuencia básica, tomada de una guía publicada:
  1. Verificar respuesta y respiración.
  2. Pedir ayuda y avisar a Tierra.
  3. Iniciar RCP según la guía de microgravedad.
- Solo puede presentarse como instrucción si tiene fuente y versión visibles, se limita a microgravedad (`MARS_TRANSIT`), no incluye diagnóstico ni medicamentos y fue revisada por una persona competente en medicina (revisor buscado en T-012, fecha límite 8 de noviembre de 2026).
- Los agentes no añaden, detallan ni reordenan pasos por su cuenta. Cualquier detalle de un paso proviene de la guía publicada citada y de la revisión competente.
- Si la revisión competente no se obtiene antes del evento, o si T-012 no consigue revisor antes del 8 de noviembre, mostrar únicamente diseño pendiente o referencia comentada, nunca instrucciones operativas.
- No improvisar procedimientos ni presentar el prototipo como protocolo de misión.

Si falta evidencia científica o revisión requerida, marcar la función como pendiente. Utilizar exclusivamente datos ficticios.

## 9. Motor de evaluación

- `health-engine` es independiente del frontend y backend, y **se ejecuta en el cliente**.
- Evaluación personal: mediana de hasta siete registros previos comparables, mínimo tres.
- Comparable: mismo astronauta, indicador, unidad y contexto; capturado antes por `capturedAtSim`.
- Presión arterial por componente; estado de ánimo sin mediana en el MVP.
- Salida: mediana, diferencia absoluta y porcentual, registros usados, criterios y versiones.
- Detalles deterministas (los siete más recientes, desempates, mediana con número par, diferencia porcentual con mediana 0, redondeo solo en la interfaz) según `ARCHITECTURE.md` §8 y T-304.
- **Sin etiquetas diagnósticas.** Una diferencia estadística no es un diagnóstico. Sin etiquetas de estado clínico (D-29).
- No usar registros futuros ni mezclar unidades o contextos.
- Los casos de prueba se definen antes de implementar (T-304) e independientemente de la implementación.
- La implementación requiere revisión obligatoria del líder técnico.

## 10. Incidentes

Respetar la máquina de estados de `PROJECT_SPEC.md` §7:

`ACTIVE` → `GUIDED` (opcional) → `AWAITING_REVIEW` → `CLOSED`, con `CANCELLED` desde cualquier estado no terminal. La tabla completa de transiciones está en `PROJECT_SPEC.md` §7.2.

- "Sin incidente activo" no se persiste.
- La nave es dueña del incidente; la Tierra solo agrega `EARTH_REVIEW`.
- Rechazar en el servidor cualquier cambio de estado con actor Tierra.
- Cada evento de la nave lleva una secuencia por incidente; el servidor acepta un evento solo si sus predecesores ya fueron aceptados (`ARCHITECTURE.md` §9.1).
- `EARTH_REVIEW` se valida contra la proyección visible para Tierra (un `REPORT_SUBMITTED` ya entregado) y nunca cambia el estado.
- `INCIDENT_CLOSED` registra `REVIEWED` (solo con revisión entregada) o `CLOSED_WITHOUT_REVIEW`.
- La alerta es la transmisión de `REPORT_SUBMITTED`, enviada explícitamente por el astronauta.
- Eventos de solo agregar, con UUID e idempotentes.
- Un solo incidente no terminado por astronauta.
- El incidente se recupera tras recargar.
- No generar procedimientos médicos improvisados.

## 11. Comunicaciones

- Todo lo que cruza nave↔Tierra es una transmisión con `acceptedAtReal`, `acceptedAtSim` y `deliverAt`.
- **El retraso comienza cuando el canal acepta la transmisión.**
- `deliverAt = acceptedAtSim + retraso del perfil vigente`, en tiempo simulado.
- Estados: `QUEUED` (solo cliente), `IN_TRANSIT` y `DELIVERED` (calculados en cada consulta). `FAILED` es posterior.
- Reloj: `simNow = simEpoch + (realNow − realEpoch) × factor`; re-anclaje e incremento de `clockVersion` al cambiar el factor. La fórmula tiene una única implementación compartida en `packages/contracts`.
- La API filtra la visibilidad por rol y `deliverAt`; no basta con ocultarlo en la interfaz.
- El rol de modo demo se envía en cada petición (`X-Demo-Role`); no es autenticación.
- La consola terrestre consulta exclusivamente la API; nunca usa IndexedDB como fuente de datos de misión.
- Las transmisiones sobreviven a reinicios del servidor sin depender de temporizadores.
- No confundir pérdida de enlace con retraso de propagación.

## 12. Pruebas y verificación

Toda funcionalidad debe tener pruebas apropiadas a su riesgo:
- Vitest para lógica pura y frontend.
- Jest y Supertest para backend.
- Pruebas manuales guionadas con evidencia para el recorrido completo.
- Playwright solo en fase posterior o si sobra tiempo.

No afirmar que una prueba pasó si no fue ejecutada.

Reportar resultados mediante PASS, FAIL, BLOCKED o NOT_RUN. Si una prueba no pudo ejecutarse, explicar por qué.

No declarar una tarea como terminada solamente porque el código compila.

## 13. Herramientas, skills y MCP

Utilizar herramientas adicionales solo cuando exista una necesidad concreta.

Antes de instalar una skill, dependencia o servidor MCP:
1. Verificar procedencia.
2. Revisar permisos.
3. Inspeccionar scripts y dependencias.
4. Evaluar compatibilidad.
5. Considerar costo de contexto y tokens.
6. Solicitar autorización cuando implique cambios importantes o acceso sensible.

No instalar colecciones masivas de agentes o skills sin evaluación.

No exponer secretos a herramientas externas.

## 14. Eficiencia de tokens

- Contexto mínimo: este documento, el ticket y solo los documentos relevantes.
- Evitar subagentes innecesarios.
- Utilizar modelos más costosos solo cuando la complejidad lo justifique.
- No repetir archivos completos si basta con consultar secciones relevantes.
- No sacrificar verificación por ahorrar tokens.

## 15. Acciones prohibidas sin autorización

- Eliminar archivos o datos importantes.
- Ejecutar comandos destructivos.
- Reescribir la arquitectura.
- Modificar contratos compartidos de forma incompatible.
- Añadir dependencias importantes distintas de las ya autorizadas (Zod, D-19; `vite-plugin-pwa`, D-26).
- Cambiar configuración de despliegue sensible.
- Publicar secretos.
- Fusionar ramas con fallos críticos.
- Presentar resultados ficticios como pruebas reales.
- Afirmar validación médica inexistente.
- Añadir inteligencia artificial offline o funciones predictivas.

## 16. Formato de entrega de cada agente

**Ticket:** identificador y objetivo.

**Cambios realizados:** módulos y archivos modificados.

**Decisiones técnicas:** justificación breve.

**Pruebas:** comandos ejecutados y resultados reales.

**Limitaciones:** funciones incompletas o no verificadas.

**Riesgos:** problemas que podrían afectar la integración.

**Siguiente paso:** acción concreta recomendada.

## 17. Prioridad del proyecto

La prioridad es el recorrido completo del MVP (`PROJECT_SPEC.md` §13), incluida la captura numérica simple de sueño y la tendencia simple (D-30/D-31):
1. Registro de una medición.
2. Comparación explicable con datos personales anteriores.
3. Funcionamiento y persistencia offline.
4. Creación y reporte explícito de un incidente.
5. Reconexión y sincronización.
6. Tránsito simulado hacia Tierra.
7. Recepción en la consola terrestre tras el retraso.
8. Respuesta desde Tierra y entrega diferida a la nave.

El recorrido tiene prioridad sobre animaciones, gráficos adicionales, traducciones secundarias y mejoras estéticas. Si el tiempo es insuficiente, aplicar la política de recorte de `TASKS.md` §13.

## 18. Estado y reglas oficiales

Este documento es una política de trabajo, no evidencia de implementación.

**Entendimiento actual del equipo, pendiente de confirmar por escrito (V-2):** no se permite llevar código previo al evento; se permite el uso de IA y de materiales que no son código. No asumir que un material concreto está permitido hasta confirmarlo.

La prueba vertical D-33 (T-011) no depende de V-2: se hace en un repositorio desechable y **ningún código del repositorio desechable se lleva al evento**. V-2 sigue rigiendo qué materiales se llevan al evento.

Tampoco asumir requisitos del reto oficial (V-1) ni que el despliegue público es opcional (V-5) sin verificarlo.

Si el enunciado oficial exige una funcionalidad incompatible con el MVP, señalarla y solicitar una decisión antes de eliminarla o posponerla.

Si existen conflictos entre estas instrucciones y las reglas oficiales, señalar el conflicto y solicitar una decisión.
