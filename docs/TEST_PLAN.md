# TEST_PLAN.md — Plan de pruebas de ASTRA HEALTH

**Versión:** 2.2.1 — actualizada el 2 de noviembre de 2026; incorpora D-19 a D-35 (1 y 2 de noviembre de 2026) y las correcciones 2.2.1.

## 1. Objetivo

Establecer los criterios de calidad, las pruebas y las evidencias necesarias para verificar ASTRA HEALTH durante NASA Space Apps Challenge 2026.

La prioridad es demostrar que el recorrido del MVP funciona de extremo a extremo, sin pérdida silenciosa de datos, sin duplicaciones, sin entregas anticipadas y sin afirmaciones médicas injustificadas.

Este documento define pruebas pendientes. **Ninguna ha sido ejecutada.**

## 2. Herramientas

| Herramienta | Uso | Fase |
|---|---|---|
| Vitest | `health-engine` y lógica del frontend | MVP |
| Jest | Backend NestJS (ejecutor por defecto) | MVP |
| Supertest | Endpoints HTTP | MVP |
| Pruebas manuales guionadas | Recorrido completo, offline, accesibilidad, interfaz; con video o capturas como evidencia | MVP |
| Playwright | Flujos completos automatizados | Posterior (o si sobra tiempo) |

No instalar herramientas adicionales sin una necesidad concreta.

**Responsables de ejecución (D-24):** Benito ejecuta los casos automatizados; Lalo ejecuta los casos manuales guionados y documenta la evidencia; Bruno revisa los resultados de los casos críticos.

## 3. Prioridades

- **MVP:** debe pasar para considerar viable la demostración.
- **MVP opcional:** solo aplica si la funcionalidad opcional se integra.
- **Fase 2:** se ejecuta si la funcionalidad de Fase 2 se implementa.
- **Posterior:** fuera del hackathon.

## 4. Mediciones

### QA-001 — Registro válido
MVP. Dada una medición válida, se conservan `id`, `astronautId`, indicador, valor, unidad, contexto, origen, `capturedAtReal`, `capturedAtSim`, `clockVersion`, perfil y versión de entorno.

### QA-002 — Validación de entradas
MVP. Se rechazan formatos inválidos, unidades no permitidas, contextos fuera del catálogo y datos incompletos según el diccionario de datos (T-005) y los esquemas Zod de `packages/contracts`. El backend aplica los mismos esquemas independientemente del frontend.
No se usan límites clínicos como sustituto de validaciones estructurales.

### QA-003 — Persistencia tras recarga
MVP. Una medición guardada localmente sigue disponible después de recargar y después de cerrar y volver a abrir la pestaña.

### QA-004 — Historial
MVP. Las mediciones se muestran en orden temporal correcto por momento de captura, respetando unidades y contexto.

## 5. Offline y sincronización

### Prueba técnica vertical previa (D-33, T-011; no depende de V-2)
En repositorio desechable y con límite de seis horas efectivas: (1) registrar sin conexión; (2) sincronizar al reconectar; (3) confirmar persistencia en servidor; (4) verificar que la consola no muestra el registro antes de `deliverAt` y sí después; (5) recargar sin conexión y confirmar que el registro persiste; (6) reenviar y confirmar que no duplica; (7) Bruno explica cada parte sin el agente. Registrar PASS/FAIL/BLOCKED/NOT_RUN para cada criterio y tiempo total. Este ensayo no equivale a dos ensayos completos ni a publicación.

Salvaguarda: **ningún código del repositorio desechable se lleva al evento.** V-2 sigue rigiendo qué materiales se llevan al evento.

### QA-009 — Captura numérica de sueño
MVP (D-30). La entrada de sueño usa la unidad y validación acordadas en el diccionario, persiste localmente, sobrevive a recarga y se sincroniza sin duplicados. No genera etiquetas ni interpretación clínica.

### QA-101 — Registro sin conexión
MVP. Con la red desactivada, una medición se guarda localmente (`SAVED_LOCAL` y `PENDING_SYNC`).

### QA-102 — Reconexión
MVP. Al restablecer la red, la operación pendiente se envía y queda `CONFIRMED`.

### QA-103 — Idempotencia
MVP. Reenviar la misma operación con el mismo UUID y el mismo contenido no crea duplicados y devuelve el resultado original (`DUPLICATE`, con la transmisión original).

### QA-104 — Error del servidor
MVP. Con el backend detenido, la operación queda en `SYNC_ERROR` reintentable o en `PENDING_SYNC`, sin perderse, y se reintenta automáticamente.

### QA-105 — Estado visible
MVP. La interfaz distingue guardado localmente, en cola, confirmado, en tránsito, entregado y error. "Confirmado" nunca se muestra como "entregado".

### QA-106 — Recarga con operaciones pendientes
MVP. Recargar con operaciones pendientes no las pierde; se recuperan y reintentan.

### QA-107 — Recarga sin conexión del app shell
MVP. Tras una carga inicial con conexión, recargar sin conexión abre la aplicación y muestra los datos locales.

Condiciones:
- Build de producción servido con `vite preview` en `localhost`.
- Desconexión con el modo Offline de las herramientas de desarrollo del navegador.
- Se comprueba en la pestaña de red que las peticiones al backend fallan.
- La aplicación no depende de recursos externos: tipografías y guía vienen en el build.

### QA-108 — Varias pestañas
Fase 2. Con dos pestañas abiertas, solo una sincronización está activa y no hay envíos duplicados.

### QA-109 — Mismo UUID con contenido distinto
MVP. El servidor responde `CONFLICT` (409) y conserva el registro original. La comparación sigue la regla de igualdad de `ARCHITECTURE.md` §5.2.

### QA-110 — Lote mixto
MVP. Un lote con cuatro elementos:
1. un elemento nuevo válido,
2. uno ya aceptado con el mismo contenido,
3. uno con UUID reutilizado y contenido distinto,
4. uno estructuralmente inválido.

Resultado esperado: `ACCEPTED`, `DUPLICATE` (con la transmisión original), `CONFLICT` e `INVALID`, respectivamente. La respuesta del lote es 200. Los elementos aceptados persisten aunque otros fallen. El cliente aplica a cada elemento su estado correspondiente.

### QA-111 — Errores permanentes y transitorios
MVP.
- Un `INVALID` o `CONFLICT` deja el dato en `SYNC_ERROR` permanente: sin reintento automático, conservado y visible.
- Un error de red o 5xx se reintenta automáticamente sin duplicar.
- Un `SEQUENCE_GAP` se reintenta.

### QA-112 — Hidratación del historial inicial
MVP. Tras el reinicio de la demo y la primera carga en línea, el cliente descarga por API el historial propio de Sam y lo guarda en IndexedDB. La evaluación de la medición de demo usa al menos tres registros comparables. Sin conexión, el historial sigue disponible.

## 6. Evaluación personal

### QA-201 — Separación de evaluaciones
MVP. La evaluación personal y la clínica producen resultados independientes.

### QA-202 — Historial insuficiente
MVP. Con menos de tres registros comparables previos, el estado es `INSUFFICIENT_DATA`.

### QA-203 — Mediana personal
MVP. Con tres a siete registros comparables previos, la mediana y las diferencias absoluta y porcentual son correctas. La presión arterial se evalúa por componente.

Se aplican las reglas deterministas de `ARCHITECTURE.md` §8 y T-304:
- los siete registros comparables más recientes por `capturedAtSim`;
- desempate por `capturedAtReal` y después por `id`;
- mediana con número par = promedio de los dos centrales;
- diferencia porcentual nula, con motivo explícito, si la mediana es 0;
- sin redondeo en el motor.

### QA-204 — Compatibilidad
MVP. No se mezclan unidades, contextos ni registros de otros astronautas.

### QA-205 — Orden temporal
MVP. No se usan mediciones capturadas después de la evaluada (por `capturedAtSim`).

### QA-206 — Trazabilidad y lenguaje neutral
MVP. El resultado muestra los registros usados, criterios, `rulesVersion` y `engineVersion`. No aparece ninguna etiqueta diagnóstica.

### QA-207 — Reglas clínicas desactivadas
MVP. La evaluación clínica devuelve `CLINICAL_RULES_NOT_AVAILABLE`. Ninguna regla clínica se activa sin fuente, revisión y justificación documentadas.

### QA-208 — Estado de ánimo
MVP. Para estado de ánimo no se calcula mediana; solo se muestra el historial.

Los casos de QA-201 a QA-208 se definen en T-304 **antes** de implementar el motor e independientemente de la implementación.

## 7. Incidentes

### QA-301 — Inicio de incidente
MVP. Se crea con UUID único, estado inicial `ACTIVE` y evento `INCIDENT_OPENED`. No se permite un segundo incidente no terminado para el mismo astronauta.

### QA-302 — Transiciones
MVP. Solo se aceptan las transiciones de `PROJECT_SPEC.md` §7.2; las demás se rechazan.

### QA-303 — Persistencia offline
MVP. Iniciar, avanzar y reportar un incidente sin conexión, recargar y recuperar estado y eventos.

### QA-304 — Recursos disponibles
MVP. La guía puede consultarse sin conexión si se almacenó previamente.

### QA-305 — Historial de eventos
MVP. Los eventos conservan secuencia (`sequence` consecutiva por incidente para los eventos de la nave), actor, tiempos y UUID.

### QA-306 — Orientación no clínica
MVP. Los textos solo sugieren repetir la medición, reposar o avisar al médico de vuelo; no contienen rangos numéricos ni etiquetas de estado.

### QA-312 — Guía educativa de emergencia
MVP condicionado a revisión. Verificar fuente y versión visibles, etiqueta de prototipo educativo, alcance exclusivo `MARS_TRANSIT`, ausencia de diagnóstico/medicamentos y registro de revisión competente. Si la revisión no existe, confirmar que la interfaz muestra diseño pendiente o referencia comentada y no expone instrucciones operativas.

### QA-307 — Cancelación
MVP. Desde `ACTIVE`, `GUIDED` o `AWAITING_REVIEW`, el astronauta cancela con motivo; se registra `INCIDENT_CANCELLED` y el estado es terminal.

### QA-308 — Tierra no cambia el estado
MVP. El servidor rechaza cualquier evento de cambio de estado con actor Tierra; solo acepta `EARTH_REVIEW`.

### QA-309 — Revisión de Tierra con la nave sin conexión y revisión tardía
MVP.
- Una revisión enviada mientras la nave está sin conexión se recibe al reconectar, una vez entregada.
- Una revisión entregada tras `CLOSED` o `CANCELLED` se conserva sin cambiar el estado.
- `REVIEWED` solo se acepta si hay al menos un `EARTH_REVIEW` entregado; en otro caso, se usa `CLOSED_WITHOUT_REVIEW`.

### QA-310 — Secuencia de eventos en el servidor
MVP.
- Un evento de la nave cuyo predecesor (`sequence − 1`) no fue aceptado devuelve `INVALID` con código `SEQUENCE_GAP` reintentable y no altera la proyección.
- Al aceptarse el predecesor, el reintento del evento se acepta.
- Un mismo par (`incidentId`, `sequence`) con otro UUID devuelve `CONFLICT`.
- Una transición inválida devuelve `INVALID` permanente.

### QA-311 — `EARTH_REVIEW` contra la proyección visible para Tierra
MVP.
- Se rechaza (`INVALID`) si el `REPORT_SUBMITTED` aún no está entregado a Tierra.
- Se acepta si está entregado, aunque exista un `INCIDENT_CLOSED` o `INCIDENT_CANCELLED` de la nave aún no entregado; no cambia el estado.
- La proyección para Tierra usa solo el prefijo contiguo de eventos entregados.

## 8. Comunicaciones

### QA-401 — Envío de mensaje
MVP. Un mensaje creado por el astronauta persiste localmente y, al sincronizar, como transmisión en el servidor.

### QA-402 — Retraso simulado
MVP. La consola terrestre no recibe un mensaje antes de `deliverAt`.

### QA-403 — Respuesta de Tierra
MVP. Una respuesta de Tierra llega a la nave solo después de `deliverAt`.

### QA-404 — Reinicio del backend
MVP. Reiniciar el servidor con transmisiones en tránsito conserva su `deliverAt` y su entrega.

### QA-405 — Relojes separados
MVP. El tiempo real y el simulado no se confunden; `simNow` coincide con la fórmula de `ARCHITECTURE.md` §10.3. Servidor y cliente usan la misma función compartida `computeSimNow`.

### QA-406 — Desconexión frente a retraso
MVP. Una pérdida de enlace se muestra como "sin conexión" o "en cola", nunca como "en tránsito".

### QA-407 — Reintentos sin duplicar
MVP. Los reintentos no generan transmisiones duplicadas ni entregas repetidas.

### QA-408 — Visibilidad por `deliverAt` para todo
MVP. La API no devuelve a Tierra mediciones, eventos de incidente ni mensajes antes de `deliverAt`, ni a la nave respuestas antes de su `deliverAt`. Se verifica en la API con la cabecera `X-Demo-Role`, no solo en la interfaz.

### QA-409 — Cambio de factor y reinicio
MVP. Al cambiar el factor, `simNow` es continuo, se incrementa `clockVersion` y las transmisiones en tránsito conservan su `deliverAt`. Tras reiniciar el servidor, `simNow` sigue siendo correcto.

### QA-410 — Momento de captura preservado
MVP. Una medición capturada sin conexión (con el `clockVersion` vigente) conserva `capturedAtReal` y `capturedAtSim` originales. Tras reconectar, `acceptedAtReal`, `acceptedAtSim` y `deliverAt` son posteriores y distintos. La consola muestra ambos momentos.

La limitación de `ARCHITECTURE.md` §10.3 (factor cambiado con la nave desconectada) queda fuera de esta aserción.

### QA-411 — Recepción entrante
MVP. El servicio único de recepción descarga las revisiones y mensajes entregados a la nave, deduplica por UUID (dos descargas no crean duplicados) y los persiste en IndexedDB. No se descarga nada de Tierra con `deliverAt` futuro.

### QA-412 — Consola terrestre: fuente de datos y refresco
MVP. La consola obtiene sus datos exclusivamente de la API, sin leer IndexedDB como fuente de datos de misión. Refresca periódicamente: una transmisión aparece sin recarga manual después de su `deliverAt`.

### QA-413 — Atomicidad de registro y transmisión
MVP. Medición, evento o mensaje y su transmisión se crean en la misma transacción. Si la creación de la transmisión falla, no queda el registro sin transmisión, y el reintento produce un resultado coherente.

## 9. Entornos

### QA-501 — Cambio de entorno
Posterior. Cambiar entre `MARS_TRANSIT`, `ORBITAL_STATION` y `LUNAR_BASE`.

### QA-502 — Historial inmutable
MVP. Cambiar los parámetros del entorno (incluido el retraso) no altera registros, mensajes ni `deliverAt` ya calculados.

### QA-503 — Parámetros documentados
MVP. Los parámetros presentados como datos científicos tienen fuente; si no la tienen, se rotulan como simulados.

## 10. Interfaz

### QA-601 — Responsive
MVP. Navegación y formularios utilizables en escritorio y móvil.

### QA-602 — Accesibilidad básica
MVP. Navegación por teclado, etiquetas, foco visible, contraste suficiente; los estados críticos no dependen solo del color.

### QA-603 — Internacionalización
MVP: el inglés no tiene textos sin traducir en los flujos principales y el idioma elegido persiste tras recargar. Fase 2: lo mismo para español.

### QA-604 — Estados de carga y error
MVP. Mensajes claros cuando una operación está pendiente, falla o no hay datos.

### QA-605 — Visualizaciones
- Tendencia simple (T-605): MVP, protegida en el recorte (D-31).
- SVG estático (T-602): MVP opcional, protegido en el recorte (D-31); solo aplica si se integra y la demo no depende de él.
- La figura interactiva continúa en fase Posterior.

Ninguna visualización representa información inexistente ni diagnósticos.

## 11. Seguridad e integración técnica

### QA-701 — Validación del backend
MVP. El servidor rechaza entradas malformadas independientemente del frontend.

### QA-702 — Secretos
MVP. No hay claves privadas, contraseñas ni tokens en el repositorio. El archivo de SQLite está excluido.

### QA-703 — Modo demo
MVP. El selector de rol está rotulado "modo demo" y no se presenta como autenticación. Una petición sin `X-Demo-Role` válido recibe 400.

### QA-704 — Manejo de errores
MVP. Los errores no revelan secretos, trazas sensibles ni detalles innecesarios del servidor.

### QA-705 — Paquetes compartidos y compilación
MVP.
- `apps/web` y `apps/api` importan un tipo, un esquema Zod y una función de `packages/contracts`, y una función de `packages/health-engine`.
- `apps/api` compila y arranca con NestJS.
- `apps/web` compila con `vite build` y se sirve con `vite preview`.
- Prisma genera su cliente y migra dentro del workspace.

### QA-706 — CORS local
MVP. La API acepta peticiones desde los orígenes de desarrollo y de `vite preview` configurados y rechaza otros orígenes.

### QA-707 — Reinicio protegido
MVP. El endpoint de reinicio de la demo no está disponible si la variable de entorno que lo habilita no está activa.

## 12. Prueba integral de demostración

### QA-801 — Escenario completo
MVP. Coincide con `PROJECT_SPEC.md` §12, salvo el plan B, que queda fuera de este caso. Los pasos 0 y 8a son verificaciones de QA que no se muestran en la demo.

**Precondiciones (D-25):**
- Build de producción servido en `localhost`.
- Nave (Sam) y Tierra en ventanas separadas, ambas en línea al inicio.
- La consola de Tierra consulta exclusivamente la API.
- No se cambia el factor del reloj con la nave desconectada.

**Pasos:**
0. *(Verificación de QA.)* Ejecutar el reinicio de la demo (QA-802) y comprobar que la nave hidrató su historial en línea (QA-112).
1. Abrir ASTRA HEALTH en modo demo como Sam, misión `MARS_TRANSIT`, reloj acelerado rotulado.
2. Antes de registrar la medición, activar el modo Offline de las herramientas de desarrollo en la ventana de la nave. Comprobar en la pestaña de red que sus peticiones al backend fallan, que la interfaz muestra "sin conexión" y que la ventana de Tierra sigue conectada.
3. Registrar sin conexión la medición ficticia de frecuencia cardíaca; queda guardada localmente y en cola.
4. Ver la evaluación personal calculada sin conexión (mediana, diferencias neutrales, registros usados), "sin reglas clínicas validadas" y la orientación no clínica.
5. Iniciar un incidente y consultar la guía educativa disponible sin conexión. Si la revisión competente está pendiente, confirmar que no aparecen instrucciones operativas.
6. Enviar explícitamente el reporte; queda en cola.
7. Recargar; la aplicación abre sin conexión y recupera la medición pendiente, el incidente y el reporte, sin pérdida.
8. Desactivar el modo Offline; las transmisiones quedan confirmadas y en tránsito.
8a. *(Verificación de QA.)* Con la nave ya reconectada, reenviar la operación y comprobar que no crea duplicados.
9. Verificar en la consola que nada aparece antes de `deliverAt`; después, sin recarga manual, aparecen la medición (con su momento de captura original, anterior a la reconexión) y la alerta.
10. Enviar una revisión desde Tierra.
11. Recibir la revisión en la nave tras el retraso y cerrar el incidente con motivo `REVIEWED`.

**Plan B:** fuera de QA-801. Una ejecución que recurra al plan B no se registra como PASS de este caso ni sirve como evidencia de sincronización real.

**Aceptación:** recorrido completo sin pérdida de datos ni intervención manual en la base de datos. Datos y reloj simulados identificados en pantalla. Evidencia: video.

### QA-802 — Reinicio reproducible
MVP. El procedimiento de reinicio (T-706) deja SQLite, el reloj e IndexedDB en el estado inicial, y el cliente vuelve a hidratar su historial. Dos ejecuciones consecutivas producen estados equivalentes. Solo difieren los anclajes reales del reloj (`realEpoch`), que dependen del momento de ejecución.

## 13. Evidencia de verificación

Para cada caso ejecutado, registrar:
- Identificador.
- Fecha.
- Responsable.
- Entorno de prueba.
- Pasos ejecutados.
- Resultado esperado.
- Resultado observado.
- Estado: PASS, FAIL, BLOCKED o NOT_RUN.
- Evidencia disponible.
- Incidencias relacionadas.

Nunca convertir automáticamente NOT_RUN en PASS.

## 14. Política de defectos

**Crítico:** impide la demostración, pierde datos, duplica operaciones, entrega información antes de `deliverAt` o presenta información médica insegura.

**Alto:** rompe un flujo principal sin alternativa razonable.

**Medio:** afecta una función secundaria o produce errores recuperables.

**Bajo:** problemas visuales que no comprometen los flujos principales.

Corregir defectos críticos antes de incorporar funcionalidades nuevas.

## 15. Trazabilidad del MVP

| Requisito MVP (`PROJECT_SPEC.md` §13) | Tickets | Pruebas |
|---|---|---|
| 1. Registro de una medición | T-102, T-104, T-201, T-202 | QA-001, QA-002, QA-003, QA-004 |
| 2. Comparación explicable con datos personales | T-301, T-304, T-302, T-303, T-105, T-203 | QA-201 a QA-208, QA-112 |
| 3. Funcionamiento y persistencia offline | T-202, T-206, T-205 | QA-101, QA-106, QA-107 |
| 4. Creación y reporte explícito de un incidente | T-401, T-402, T-403, T-404 | QA-301 a QA-307, QA-312 |
| 5. Reconexión y sincronización | T-203, T-501, T-405 | QA-102 a QA-105, QA-109, QA-110, QA-111, QA-310, QA-413 |
| 6. Tránsito simulado hacia Tierra | T-502, T-501, T-601 | QA-405, QA-406, QA-407, QA-409, QA-410, QA-502 |
| 7. Recepción en consola tras el retraso | T-501, T-503, T-405 | QA-402, QA-408, QA-308, QA-311, QA-412 |
| 8. Respuesta de Tierra y entrega diferida | T-503, T-505, T-504, T-203 | QA-403, QA-309, QA-404, QA-411 |
| Inglés completo | T-103, T-603 | QA-603 |
| Reinicio reproducible | T-706 | QA-802, QA-707 |
| Demo local | T-702, T-704 | QA-801 |
| Seguridad básica | T-101, T-103, T-104, T-405, T-701 | QA-701 a QA-704, QA-706 |
| Base técnica del monorepo | T-101, T-102 | QA-705 |

## 16. Criterios de finalización

Una funcionalidad se considera terminada únicamente cuando:
1. Cumple sus criterios de aceptación.
2. Está integrada con sus dependencias.
3. Tiene pruebas apropiadas ejecutadas.
4. No introduce regresiones críticas conocidas.
5. Sus limitaciones están documentadas.
6. Su estado real se refleja en el tablero de tareas.

## 17. Estado actual

Todas las pruebas están pendientes (NOT_RUN) hasta contar con evidencia.

Claude y los agentes deben distinguir entre código generado, código revisado y comportamiento verificado.
