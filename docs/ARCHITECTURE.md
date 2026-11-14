# ARCHITECTURE.md — Arquitectura técnica de ASTRA HEALTH

**Versión:** 2.2 — actualizada el 2 de noviembre de 2026; incorpora D-19 a D-35 (1 y 2 de noviembre de 2026).
**Estado:** arquitectura objetivo. **No existe implementación verificada.**

## 1. Objetivo arquitectónico

ASTRA HEALTH será una PWA offline-first con frontend React, backend NestJS, almacenamiento local IndexedDB y, en el MVP, base de datos SQLite mediante Prisma.

La arquitectura debe permitir:
- que el astronauta registre mediciones, consulte su evaluación personal y gestione un incidente sin conexión;
- que los datos se sincronicen al reconectarse;
- que toda información entre nave y Tierra respete un retraso simulado.

Prioridades: simplicidad, integridad de datos, pruebas y una demostración local funcional.

## 2. Estructura del monorepositorio

npm workspaces, con esta estructura objetivo:

```text
astra-health/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── contracts/
│   └── health-engine/
├── docs/
├── AGENTS.md
├── CLAUDE.md
└── package.json
```

`docker-compose.yml` no forma parte del MVP; se incorporará junto con PostgreSQL en una fase posterior.

Responsabilidades:
- `apps/web`: interfaz del astronauta, consola terrestre, PWA, almacenamiento local, sincronización y ejecución del motor de evaluación.
- `apps/api`: API REST, persistencia, validación, canal de transmisiones, reloj simulado e incidentes.
- `packages/contracts`: esquemas Zod, tipos derivados, contratos de API y la función pura compartida del reloj (`computeSimNow`).
- `packages/health-engine`: evaluación personal pura, explicable y verificable.
- `docs`: decisiones, diccionario de datos, fuentes, contenido revisado, pruebas y demo.

Dirección de dependencias, sin ciclos:
- `packages/contracts` depende solo de Zod.
- `packages/health-engine` puede importar tipos de `contracts`.
- `apps/web` y `apps/api` importan ambos paquetes.
- Ningún paquete importa de las apps.

## 3. Frontend

Tecnologías aprobadas:
- React y TypeScript.
- Vite.
- Tailwind CSS.
- Recharts (una tendencia simple en el MVP).
- react-i18next (inglés completo en el MVP; español en Fase 2).
- Dexie e IndexedDB.
- Esquemas Zod importados desde `packages/contracts` (D-19).
- Service worker para el app shell offline mediante **`vite-plugin-pwa`**, autorizado (D-26). Lo integra Justin con revisión de Bruno.

Organización por funcionalidades: mediciones, evaluación, dashboard, incidentes, mensajes, consola terrestre y configuración.

Reglas:
- Los componentes visuales no contienen lógica clínica ni de negocio.
- Los datos persistentes se manejan mediante servicios y repositorios, no solo con estado de React.
- `health-engine` se ejecuta en el cliente para que la evaluación funcione sin conexión.
- Solo una sincronización puede estar activa a la vez; se coordina con `navigator.locks` (verificación con varias pestañas en Fase 2).
- El funcionamiento offline se prueba sobre el build de producción (`vite preview`), porque el modo de desarrollo no reproduce el comportamiento real del service worker.
- **Dexie se abre solo en el rol nave.** La consola terrestre consulta exclusivamente la API y nunca usa IndexedDB como fuente de datos de misión.
- La consola terrestre refresca sus consultas periódicamente (intervalo configurable) para mostrar entregas nuevas. No hay push en el MVP.
- Todos los recursos necesarios para abrir la aplicación sin conexión (incluidas tipografías y contenido de la guía) se sirven desde el propio build. No se depende de CDN ni de recursos externos.
- Durante el desarrollo paralelo, la interfaz puede usar respuestas simuladas construidas y validadas con los esquemas de `packages/contracts`. Se retiran al integrar con la API real. No se añade ninguna librería para ello.

## 4. Backend

NestJS como monolito modular.

Módulos del MVP:
- `measurements`: persistencia y consulta de mediciones.
- `incidents`: eventos, validación de secuencia y proyección del estado del incidente por rol.
- `communications`: canal de transmisiones, recepción de lotes (`POST /api/sync/batch`), `deliverAt`, mensajes y filtrado de visibilidad.
- `missions`: reloj simulado, perfil de entorno y reinicio de la demo.
- `crew`: astronautas ficticios y seed.
- `health`: estado operativo de la API.

**`assessments` pasa a fase Posterior (D-27).** No forma parte del recorrido del MVP. La evaluación es determinista y se calcula en el cliente.

Controladores, servicios y repositorios con responsabilidades separadas.

La validación de entradas usa un pipe propio que aplica los esquemas Zod de `packages/contracts`, sin librerías adicionales de integración. Los errores siguen el formato común `ApiError`.

No crear microservicios ni introducir Kafka.

## 5. Contratos compartidos

### 5.1 Entidades y esquemas

Los contratos son la fuente de verdad entre frontend y backend. Se expresan como **esquemas Zod en `packages/contracts`**, de los que se derivan los tipos de TypeScript (D-19).
- React y NestJS reutilizan los mismos esquemas.
- El backend valida todas las entradas relevantes aunque el frontend ya las haya validado.
- TypeScript no sustituye la validación en tiempo de ejecución.
- La validación estructural no constituye evaluación clínica.

Antes del evento se describen en un diccionario de datos en markdown (T-005, condicionado a V-2); durante el evento se implementan en `packages/contracts` (T-102).

Entidades del MVP:

| Entidad | Contenido principal |
|---|---|
| `Astronaut` | Astronauta ficticio |
| `MissionClock` | `simEpoch`, `realEpoch`, `factor`, `clockVersion` |
| `EnvironmentProfile` | Perfil, versión, retraso de un sentido (tiempo simulado), descripción |
| `Measurement` | Campos de `PROJECT_SPEC.md` §3; sueño numérico simple en el MVP con unidad/validación definidas en T-005 (D-30) |
| `PersonalAssessment` | Estado, mediana, diferencias, registros usados, criterios, versiones (solo cliente en el MVP) |
| `ClinicalAssessment` | En el MVP, siempre `CLINICAL_RULES_NOT_AVAILABLE` (solo cliente en el MVP) |
| `Incident` | Estado proyectado a partir de eventos |
| `IncidentEvent` | UUID, `incidentId`, `sequence` (solo eventos de la nave), tipo, actor, datos, tiempos real y simulado de creación |
| `Message` | Dirección, contenido validado, incidente asociado opcional, tiempos de creación |
| `Transmission` | Dirección, tipo y UUID del contenido, `acceptedAtReal`, `acceptedAtSim`, `deliverAt`, perfil y versión de entorno |
| `SyncBatchRequest` / `SyncBatchResponse` | Lote de elementos y resultados por elemento (§5.2) |
| `SyncItemResult` | Resultado de un elemento: estado, código, transmisión, error, reintentable |
| `ApiError` | Formato común de errores |

Función pura compartida: `computeSimNow(clock, realNow)`, la única implementación de la fórmula de §10.3.

El estado de sincronización (`SyncOperation`) es exclusivo del cliente y no forma parte de los contratos compartidos.

Los cambios incompatibles en contratos se coordinan con el líder técnico antes de modificar módulos consumidores.

OpenAPI pasa a fase posterior, salvo exigencia oficial.

### 5.2 Superficie mínima de API del MVP (D-20)

Este es el conjunto mínimo que satisface el recorrido aprobado. T-005 detalla el esquema Zod de cada solicitud y respuesta, y el contrato se congela al cerrar T-005/T-102. Cualquier ruta adicional requiere decisión del líder técnico.

| Método | Ruta | Rol | Propósito | Solicitud | Respuesta |
|---|---|---|---|---|---|
| GET | `/api/health` | Cualquiera | Estado operativo | — | Estado de la API |
| GET | `/api/mission/config` | Nave, Tierra | Reloj y perfil vigentes | — | `MissionClock`, `EnvironmentProfile`, `serverSimNow` |
| POST | `/api/mission/clock/factor` | Modo demo | Cambiar el factor con re-anclaje | `factor` | `MissionClock` actualizado |
| GET | `/api/crew` | Nave, Tierra | Astronautas ficticios | — | `Astronaut[]` |
| POST | `/api/sync/batch` | Nave, Tierra | Enviar transmisiones | `SyncBatchRequest` | `SyncBatchResponse` |
| GET | `/api/measurements?astronautId=` | Nave: todas las propias. Tierra: solo entregadas | Hidratación de la nave y consola | — | Mediciones con su transmisión, `serverSimNow` |
| GET | `/api/incidents?astronautId=` | Proyección por rol (§9) | Recepción de la nave y consola | — | Incidentes proyectados con sus eventos y transmisiones, `serverSimNow` |
| GET | `/api/messages` | Propios y entregados del otro lado | Recepción de la nave y consola | — | Mensajes con su transmisión, `serverSimNow` |
| POST | `/api/demo/reset` | Modo demo, solo si `DEMO_RESET_ENABLED` | Reinicio de SQLite y reloj | — | `MissionClock` inicial |

**Selección de rol en modo demo:**
- Cabecera `X-Demo-Role: SHIP | EARTH`, obligatoria en todas las rutas excepto `/api/health`.
- Si falta o es inválida, se responde 400 con `ApiError`.
- No es autenticación ni control de acceso.

**Elementos permitidos por rol en `/api/sync/batch`:**
- `SHIP`: `MEASUREMENT`; `INCIDENT_EVENT` con actor nave; `MESSAGE` en dirección nave→Tierra.
- `EARTH`: `INCIDENT_EVENT` de tipo `EARTH_REVIEW` con actor Tierra; `MESSAGE` en dirección Tierra→nave.
- Cualquier otra combinación devuelve `INVALID`.

**Consultas:**
- Cada elemento listado incluye su transmisión (`acceptedAtReal`, `acceptedAtSim`, `deliverAt`, perfil y versión de entorno) y `transportStatus` (`IN_TRANSIT` | `DELIVERED`), calculado con el `simNow` del servidor en el momento de la consulta.
- En el MVP se devuelve la consulta completa y el cliente deduplica por UUID. La paginación y los cursores quedan para una fase posterior.

**Resultado por elemento (`SyncItemResult`):**

| Estado | Código | Significado | Efecto en el cliente |
|---|---|---|---|
| `ACCEPTED` | 201 | Creado junto con su transmisión | `CONFIRMED` |
| `DUPLICATE` | 200 | Mismo UUID y mismo contenido; devuelve la transmisión original | `CONFIRMED` |
| `CONFLICT` | 409 | Mismo UUID con contenido distinto, o par (`incidentId`, `sequence`) ya ocupado por otro UUID | `SYNC_ERROR` permanente, sin reintento automático |
| `INVALID` | 400 | Falla la validación estructural, el rol o actor no está permitido, o la transición es inválida | `SYNC_ERROR` permanente; excepción: código `SEQUENCE_GAP`, reintentable (§9.1) |

Cada resultado incluye `id`, `kind`, `status`, `code`, `retryable`, la transmisión (para `ACCEPTED` y `DUPLICATE`) y `ApiError` (para fallos).

**Respuesta del lote completo:**
- 200 cuando el sobre es válido, aunque algunos elementos fallen. Un lote puede tener éxitos y fallos independientes.
- 400 si el sobre es inválido (permanente).
- 413 si supera el límite configurable (permanente; el cliente divide el lote).
- Errores de red, tiempos agotados y 5xx son transitorios: se reintenta el lote completo, que es idempotente.

**Regla de igualdad para la idempotencia:** se compara la serialización canónica (claves ordenadas) del payload después de pasar por el esquema Zod (sin claves desconocidas), excluyendo los campos que asigna el servidor (`acceptedAtReal`, `acceptedAtSim`, `deliverAt` y el perfil y versión de entorno de la transmisión).

## 6. Persistencia

### Almacenamiento local (IndexedDB mediante Dexie, solo rol nave)
- Mediciones (propias capturadas e historial hidratado desde la API).
- Operaciones pendientes (outbox).
- Incidentes y eventos, incluidas las revisiones de Tierra recibidas.
- Mensajes.
- Copia de la configuración del reloj y del perfil de entorno.
- Contenido de la guía de asistencia.
- Opcionalmente, resultados de evaluación (también pueden recalcularse; son deterministas).

Los registros de dominio se conservan después de la sincronización. El outbox puede actualizarse o depurarse tras `CONFIRMED`.

El esquema de Dexie se versiona; cada cambio de contrato que afecte al almacenamiento local incrementa la versión con su migración.

### Almacenamiento del servidor (Prisma)
- **MVP:** SQLite.
- **Posterior:** PostgreSQL, cambiando el `provider` de Prisma y regenerando las migraciones.

Almacena mediciones, eventos de incidente, mensajes, transmisiones, configuración del reloj y perfiles de entorno. Las evaluaciones no se almacenan en el servidor en el MVP (D-27).

Mediciones, eventos y mensajes se crean junto con su `Transmission` **en una sola transacción de Prisma**. Nunca queda un registro sin su transmisión.

SQLite contiene los datos iniciales de la demo (T-105), incluidas las transmisiones de los registros semilla, con `deliverAt` en el pasado simulado.

Las migraciones son explícitas y verificables.

## 7. Sincronización offline-first

Cada operación creada en el cliente tiene un UUID estable.

Flujo:
1. Validar la operación con el esquema Zod.
2. Guardarla localmente (`SAVED_LOCAL`).
3. Añadirla al outbox (`PENDING_SYNC`; estado de transporte `QUEUED`).
4. Cuando haya enlace, ejecutar un **ciclo de sincronización** bajo `navigator.locks`:
   1. **Envío:** mandar las operaciones pendientes a `POST /api/sync/batch`, ordenadas por creación; los eventos de incidente van en orden de `sequence`.
   2. **Resultados:** aplicar el resultado de cada elemento (§5.2).
   3. **Recepción:** ejecutar el servicio de recepción entrante (§7.1).
   4. **Configuración:** actualizar la copia local del reloj y del perfil (`GET /api/mission/config`).
5. El servidor acepta cada elemento, asigna `acceptedAtReal`, `acceptedAtSim` y `deliverAt` en la misma transacción que crea el registro, y responde.
6. Actualizar el estado local a `CONFIRMED`, o a `SYNC_ERROR` si falló.

Reglas:
- Reintentos idempotentes: reenviar el mismo UUID con el mismo contenido devuelve el resultado original (`DUPLICATE`, con la transmisión original).
- Mismo UUID con contenido distinto: se rechaza con **409** (`CONFLICT`) y no sobrescribe.
- Envíos por lotes: cada elemento recibe su propio resultado; un fallo parcial no invalida los demás.
- **Clasificación de errores:**
  - Red, tiempo agotado y 5xx: transitorios. Se reintentan automáticamente; el dato queda en `SYNC_ERROR` reintentable o en `PENDING_SYNC`.
  - `INVALID` y `CONFLICT`: permanentes. No se reintentan automáticamente; el dato se conserva y el error es visible.
  - `SEQUENCE_GAP`: reintentable.
- Un error nunca elimina datos locales. Los registros de dominio se conservan tras `CONFIRMED`; solo el outbox se depura.
- Una sola sincronización activa a la vez (`navigator.locks`).
- La interfaz distingue guardado local, en cola, confirmado, en tránsito, entregado y error.
- **Confirmado no significa entregado.**

### 7.1 Servicio único de recepción entrante (D-22)
- Un único servicio del cliente (rol nave) consulta `GET /api/measurements`, `GET /api/incidents` y `GET /api/messages` con `X-Demo-Role: SHIP`.
- Persiste en Dexie lo recibido: el historial propio y lo que Tierra ya entregó a la nave (revisiones y mensajes).
- Deduplica por UUID: descargar dos veces no crea duplicados.
- La API nunca devuelve a la nave nada de Tierra con `deliverAt` futuro.
- Lo reutilizan la hidratación inicial (§7.2), las revisiones de incidentes (T-405) y los mensajes (T-505).

### 7.2 Hidratación del historial inicial (D-22)
- El backend contiene los datos iniciales de la demostración.
- En la primera carga en línea, y después de cada reinicio de la demo, el cliente obtiene su historial mediante el servicio de §7.1 y lo guarda en IndexedDB.
- `health-engine` usa ese historial local, que permanece disponible sin conexión.
- Si la primera carga ocurre sin conexión, la evaluación muestra `INSUFFICIENT_DATA`. La demo empieza en línea.

## 8. Motor de evaluación

`packages/health-engine` es un paquete TypeScript puro, sin dependencias de React, NestJS ni base de datos. **Se ejecuta en el cliente.** En el MVP el resultado no se almacena en el servidor (D-27): puede guardarse localmente o recalcularse, siempre con su `rulesVersion` y `engineVersion`.

**Entradas:**
- Medición evaluada.
- Historial del mismo astronauta (IndexedDB, hidratado según §7.2).
- Criterios de comparabilidad versionados.

**Historial comparable:** mismo astronauta, indicador, unidad y contexto; capturado antes de la medición evaluada por `capturedAtSim`. Se usan hasta siete registros; mínimo tres.

**Reglas deterministas** (se fijan con ejemplos en T-304):
- Se usan los siete registros comparables **más recientes** anteriores a la medición evaluada, ordenados por `capturedAtSim`.
- Desempate por `capturedAtReal` y, después, por `id`.
- Mediana con número par de registros: promedio de los dos valores centrales.
- Diferencia absoluta = valor − mediana.
- Diferencia porcentual = (valor − mediana) / mediana × 100. Si la mediana es 0, la diferencia porcentual es nula y se indica el motivo de forma explícita.
- El motor no redondea; el redondeo se aplica solo en la interfaz, según el diccionario de datos.

**Salidas de la evaluación personal:**
- `status`: `INSUFFICIENT_DATA` o `COMPUTED`.
- Mediana, diferencia absoluta y diferencia porcentual.
- Número e identificadores de los registros usados.
- Criterios aplicados, `rulesVersion` y `engineVersion`.

Presión arterial: cada componente por separado. Estado de ánimo: sin mediana en el MVP.

**Evaluación clínica:** devuelve `CLINICAL_RULES_NOT_AVAILABLE` en el MVP.

Prohibido: usar registros futuros, mezclar unidades o contextos, generar etiquetas diagnósticas, inventar umbrales.

Responsabilidades (ver `TASKS.md`): Bruno define contratos, arquitectura y criterios de aceptación del motor; Benito lo implementa con apoyo de IA y revisión obligatoria de Bruno; los casos de prueba se definen independientemente de la implementación (T-304).

## 9. Gestión de incidentes

La máquina de estados completa está en `PROJECT_SPEC.md` §7. Resumen técnico:

- Estados persistidos: `ACTIVE`, `GUIDED`, `AWAITING_REVIEW`, `CLOSED`, `CANCELLED`.
- "Sin incidente activo" no se persiste.
- El estado es una **proyección de eventos** de solo agregar (`INCIDENT_OPENED`, `GUIDE_STARTED`, `GUIDE_STEP_COMPLETED`, `REPORT_SUBMITTED`, `EARTH_REVIEW`, `INCIDENT_CLOSED`, `INCIDENT_CANCELLED`).
- Cada evento tiene UUID, actor, tiempos real y simulado de creación, y es idempotente.
- La nave valida y aplica las transiciones localmente y conserva la autoridad sobre ellas. El servidor rechaza eventos de cambio de estado cuyo actor sea Tierra.
- `INCIDENT_CLOSED` registra `closureReason`: `REVIEWED` (solo si hay un `EARTH_REVIEW` entregado) o `CLOSED_WITHOUT_REVIEW`.
- Un `EARTH_REVIEW` entregado tras un estado terminal se conserva sin cambiar el estado.
- Un solo incidente no terminado por astronauta.
- Los eventos cruzan el canal como transmisiones (§10); la consola reconstruye el incidente solo con eventos entregados.
- El contenido de la guía se almacena localmente y está versionado; `GUIDE_STARTED` registra la versión usada. La orientación de mediciones sigue D-29. La guía educativa de emergencia, si se habilita, se limita a `MARS_TRANSIT`, muestra fuente/versión, no incluye diagnóstico ni medicamentos y requiere revisión competente; sin ella se muestra solo como pendiente/referencia comentada (D-28).

### 9.1 Secuencia y política del servidor (D-21)

**Secuencia:**
- Cada evento de la nave lleva `sequence`, un entero consecutivo por incidente que empieza en 1 y lo asigna la nave.
- `EARTH_REVIEW` no lleva secuencia de la nave. Se ordena por su transmisión y nunca altera el estado.

**Eventos de la nave.** El servidor valida, en este orden:
1. Estructura (Zod).
2. Actor nave coherente con `X-Demo-Role: SHIP`, y pertenencia del incidente al astronauta.
3. Secuencia. Si falta un predecesor (`sequence − 1` no aceptado), el resultado es `INVALID` con código `SEQUENCE_GAP` y `retryable: true`; el evento no se guarda ni altera la proyección. Un par (`incidentId`, `sequence`) ya ocupado por otro UUID devuelve `CONFLICT`.
4. Consistencia: la transición debe ser válida según `PROJECT_SPEC.md` §7.2, aplicada sobre los eventos de la nave ya aceptados. Si no lo es, `INVALID` permanente. Además, `INCIDENT_OPENED` exige que no haya otro incidente no terminado del astronauta.
5. `REVIEWED`: requiere al menos un `EARTH_REVIEW` del incidente con `deliverAt <= acceptedAtSim` del cierre.

Una nave correcta envía en orden y nunca recibe `INVALID` por transición. Si un predecesor falla de forma permanente, sus sucesores quedan bloqueados sin corromper la proyección.

**`EARTH_REVIEW`:**
- Se valida contra la **proyección visible para Tierra**: debe existir un `REPORT_SUBMITTED` del incidente con `deliverAt <= simNow` en el momento de la aceptación.
- Se acepta aunque existan eventos terminales de la nave aún no entregados a Tierra.
- Nunca cambia el estado. Una revisión tardía se conserva aunque la nave haya cerrado o cancelado.
- La consola ofrece la acción de revisión solo cuando el estado visible para Tierra es `AWAITING_REVIEW`.

**Proyección por rol en `GET /api/incidents`:**
- Nave: todos sus eventos más las `EARTH_REVIEW` entregadas.
- Tierra: el **prefijo contiguo** de eventos de la nave ya entregados, ordenados por `sequence` (se detiene en el primer evento no entregado), más sus propias revisiones con su estado de transporte.

## 10. Comunicaciones con retraso

### 10.1 Modelo de canal
- El servidor representa el canal hacia la Tierra y el estado terrestre.
- "Sin conexión" = la nave no tiene enlace con el canal.
- Todo lo que cruza nave↔Tierra (mediciones, eventos de incidente, mensajes, respuestas) genera una `Transmission`.
- La transmisión se crea en la misma transacción que el registro que transporta (§6).
- La pérdida de enlace y el retraso de propagación se representan por separado.

### 10.2 Tiempos
| Campo | Fijado por | Descripción |
|---|---|---|
| `capturedAtReal` / `createdAtReal` | Cliente | Momento real de captura o creación |
| `capturedAtSim` / `createdAtSim` | Cliente | Momento simulado de captura o creación |
| `acceptedAtReal` | Servidor | Momento real de aceptación por el canal |
| `acceptedAtSim` | Servidor | Momento simulado de aceptación |
| `deliverAt` | Servidor | `acceptedAtSim + retraso del perfil vigente` (tiempo simulado) |

**El retraso comienza al aceptar la transmisión.** Los tiempos de captura no se reescriben.

### 10.3 Reloj simulado
- Configuración persistida: `simEpoch`, `realEpoch`, `factor`, `clockVersion`.
- `simNow = simEpoch + (realNow − realEpoch) × factor`.
- La fórmula se implementa **una sola vez**, como función pura `computeSimNow` en `packages/contracts`. Servidor y cliente la importan (D-23).
- Cambiar el factor re-ancla el reloj (`realEpoch = ahora`, `simEpoch = simNow actual`) e incrementa `clockVersion`.
- `deliverAt` se guarda en tiempo simulado; las transmisiones en tránsito conservan su entrega simulada aunque cambie el factor.
- El servidor es la autoridad. El cliente guarda la configuración para calcular tiempos simulados sin conexión; el servidor conserva el `clockVersion` reportado y no reescribe esos tiempos.
- **Limitación conocida:** si el factor cambia mientras la nave está desconectada, los `capturedAtSim` offline se calculan con la configuración anterior. Pueden quedar desordenados respecto de capturas posteriores o superar `acceptedAtSim`. En la demo no se cambia el factor con la nave desconectada.
- Como el reloj es una función de datos persistidos, sobrevive a reinicios del servidor sin temporizadores.

### 10.4 Estados de transporte
- `QUEUED`: solo en el cliente, antes de la aceptación.
- `IN_TRANSIT` y `DELIVERED`: **se calculan en cada consulta** (`deliverAt` frente a `simNow`). No hay procesos que actualicen estados, lo que evita condiciones de carrera.
- La entrega efectiva, en tiempo simulado, es `deliverAt`.
- `FAILED` y los reintentos de transporte pasan a fase posterior.

### 10.5 Visibilidad
- La API filtra por rol, indicado con `X-Demo-Role`.
- Cada lado recibe del otro solo transmisiones con `deliverAt <= simNow`, y siempre ve las propias con su estado de transporte.
- La regla se aplica en el servidor, no solo en la interfaz.
- La consola terrestre obtiene sus datos exclusivamente de la API.

## 11. Entornos de misión

- `MARS_TRANSIT`: activo en el MVP.
- P-3 está pendiente: como máximo un perfil extra (`ORBITAL_STATION` o `LUNAR_BASE`), solo después del resultado de P-7, con V-7 resuelta y decisión expresa; ambos permanecen inactivos mientras tanto.
- Cada perfil tiene parámetros versionados. El valor del retraso requiere fuente verificable (V-7); en la demo es un parámetro configurable rotulado como simulado.
- Mientras T-601 no concluya, se usa un **perfil inicial versionado `MARS_TRANSIT`** cargado por la semilla, con el retraso rotulado como simulado.
- Cambiar parámetros no reescribe el historial ni `deliverAt` ya calculados.

## 12. Seguridad

Aplicar como mínimo:
- Validación de entradas en el backend con los esquemas Zod compartidos.
- Restricciones de tamaño: límites configurables del cuerpo de la petición y de elementos por lote.
- Manejo seguro de errores.
- Variables de entorno para secretos y exclusión de secretos (y del archivo de SQLite) del repositorio.
- CORS restringido a los orígenes locales configurados por variable de entorno: el de desarrollo y el de `vite preview`.
- El endpoint de reinicio de la demo existe solo si una variable de entorno local lo habilita.
- Rechazo en el servidor de cambios de estado de incidente con actor Tierra.
- Dependencias revisadas. Dependencias nuevas autorizadas: Zod (D-19) y `vite-plugin-pwa` (D-26).

El MVP **no tiene autenticación**. El rol se elige con un selector rotulado "modo demo", que se envía en la cabecera `X-Demo-Role` y no se presenta como control de acceso. La autenticación real pasa a fase posterior.

## 13. Pruebas

- **Vitest:** `health-engine` y lógica del frontend.
- **Jest y Supertest:** backend (Jest es el ejecutor por defecto de NestJS).
- **E2E manual guionado** con video como evidencia (QA-801).
- La guía educativa de emergencia se prueba como operativa solo tras revisión competente; el estado pendiente nunca muestra instrucciones operativas.
- **Playwright:** fase posterior, salvo que sobre tiempo.

Casos prioritarios (detalle en `TEST_PLAN.md`):
1. Registro online y offline.
2. Recarga sin conexión del app shell.
3. Reconexión y reintento sin duplicación.
4. Mismo UUID con contenido distinto.
5. Lotes mixtos y clasificación de errores.
6. Persistencia tras recarga.
7. Recuperación de incidente, secuencia de eventos y validación de `EARTH_REVIEW`.
8. Visibilidad solo después de `deliverAt`, en ambos sentidos.
9. Conservación del momento de captura de datos offline.
10. Reloj tras reinicio y cambio de factor.
11. Rechazo de cambios de estado desde Tierra.
12. Datos inválidos.
13. Hidratación inicial y recepción entrante.
14. Importación de paquetes compartidos y compilación de ambos workspaces.
15. Reinicio reproducible de la demo.

## 14. Integración y despliegue

- GitHub con ramas y revisión de cambios.
- **Demo local funcional: MVP.**
- **Despliegue público HTTPS: condicional.** Será obligatorio si el formato oficial de entrega lo exige (V-5). Hasta verificarlo no se considera opcional; la demo local y un video grabado son el respaldo.
- CI (GitHub Actions): opcional; se configura solo si sobra tiempo o lo exige una regla oficial.
- Docker Compose: posterior, junto con PostgreSQL.

**Procedimiento de la demo local (D-25):**
- Build de producción servido en `localhost` (`vite build` + `vite preview`). El service worker, `navigator.locks` y `crypto.randomUUID` requieren un contexto seguro.
- Nave y Tierra se abren en ventanas separadas.
- La desconexión de la nave se simula con el modo Offline de las herramientas de desarrollo del navegador en la ventana de la nave. **Apagar el Wi-Fi no desconecta `localhost`.**
- Antes de continuar se comprueba en la pestaña de red que las peticiones de la nave al backend fallan.
- La ventana de Tierra permanece conectada y consulta exclusivamente la API.
- No se cambia el factor del reloj con la nave desconectada (§10.3).

## 15. Principios de implementación

- Construir primero el recorrido completo del MVP.
- **Orden de implementación (D-23):**
  1. Contratos compartidos.
  2. Función pura del reloj y configuración inicial (reloj y perfil `MARS_TRANSIT`).
  3. Persistencia.
  4. Sincronización y núcleo de comunicaciones integrados.
  5. Verificación de visibilidad y retraso.
  6. Resto de funcionalidades del MVP.
- Mantener módulos pequeños.
- No duplicar contratos ni la fórmula del reloj.
- Evitar sobreingeniería.
- Verificar antes de integrar.
- Documentar decisiones importantes en `PROJECT_MEMORY.md`.
- Mantener coherencia entre `AGENTS.md`, `CLAUDE.md` y la documentación del proyecto.
- No añadir inteligencia artificial offline ni funciones predictivas sin decisión explícita.

## 16. Estado actual

Esta es la arquitectura objetivo. No existe repositorio ni módulos implementados.

Las decisiones D-19 a D-35 cierran la planificación v2.2. El siguiente paso es T-101; ninguna decisión implica implementación completada.

Antes de modificar código, inspeccionar el estado real del proyecto.
