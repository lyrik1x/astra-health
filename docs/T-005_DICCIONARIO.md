# T-005 — Diccionario de datos y contratos del MVP (versión reducida del evento)

**Proyecto:** ASTRA HEALTH · **Responsables:** Bruno (decide) y Claude (redacta). Revisa Benito; Lalo revisa los textos visibles (reparto del 14 nov: Sus no asiste).
**Estado:** **CONGELADO 1.0 — 14 nov 2026, 13:06.** Bruno aprobó todas las decisiones de §0, con DEC-6 = opción C. Desde ahora, todo cambio incompatible se coordina con Bruno (AGENTS.md, instrucciones §6.4).
**Fuentes:** ARCHITECTURE.md §5–§11, PROJECT_SPEC.md §3, §4, §6–§8, y las decisiones ya probadas en el ensayo (BITACORA_ETAPA0, ENSAYO_*). En el repositorio va en `docs/T-005_DICCIONARIO.md`.
**Regla:** todos los límites de este documento son **técnicos o de formato, nunca clínicos**. Ningún texto los presenta como rangos de salud.

---

## 0. Decisiones que necesita Bruno antes de congelar

Cada una trae una propuesta. "Aprobado" = se queda como está.

| ID | Decisión | Propuesta | Alternativa |
|---|---|---|---|
| DEC-1 | Unidad de sueño (T-608) | Horas, número con hasta 2 decimales, de 0 a 24 | Minutos enteros, de 0 a 1440 |
| DEC-2 | Una unidad por indicador en el MVP | Sí: °C, mg/dL, bpm, mmHg, h. Así nunca se mezclan unidades | Permitir °F o mmol/L (más validación y más pruebas) |
| DEC-3 | Catálogo de contextos | `AT_REST`, `AFTER_EXERCISE`, `AFTER_WAKING`, `BEFORE_MEAL`, `AFTER_MEAL`; todos válidos para todos los indicadores | Catálogo por indicador |
| DEC-4 | Escala del estado de ánimo | Entero de 1 a 5, sin unidad, rotulada "self-reported, not clinically validated" | Escala de 1 a 10 |
| DEC-5 | Estados de sincronización del cliente (corrige M-6) | Tabla de §6.1 | Volver a la definición de ARCHITECTURE §7 |
| DEC-6 | `astronautId` | **APROBADA opción C (híbrida):** formato validado en contracts (`^[a-z0-9-]{1,40}$`), sin lista fija; el servidor rechaza astronautas que no estén en `crew` (`UNKNOWN_ASTRONAUT`); la nave guarda la tripulación de `GET /api/crew` y el formulario solo ofrece esos astronautas. Se agregan astronautas sin cambiar código | (descartadas: A = lista fija en contracts; B = solo servidor) |
| DEC-7 | `incidentId` en mensajes | Fuera del MVP: los mensajes no se asocian a incidentes | Opcional, validado contra los incidentes del astronauta |
| DEC-8 | `INVALID` reintentable | Se mantienen tres excepciones a "INVALID es permanente": `SEQUENCE_GAP`, `CREATED_AFTER_ACCEPTANCE` y `UNEXPECTED_ITEM_ERROR` (M-16). Sin tope de reintentos | Solo `SEQUENCE_GAP` |
| DEC-9 | `reviewEventId` en el cierre `REVIEWED` | Obligatorio (endurecimiento N3b del ensayo) | Cierre basado solo en tiempos |
| DEC-10 | Reloj y perfil iniciales | Factor 60; `MARS_TRANSIT` v1 con retraso de 120 min simulados (2 min reales), rotulado como simulado (V-7) | Otro factor o retraso según la duración del pitch (V-5/V-6) |

---

## 1. Convenciones comunes

| Concepto | Regla | Esquema Zod |
|---|---|---|
| Identificadores | UUID generado por quien crea el dato (`crypto.randomUUID()`) | `z.string().uuid()` |
| Fechas | ISO 8601 en UTC, **con milisegundos y `Z`** (`2026-11-14T16:08:43.193Z`) | `z.string().datetime({ precision: 3 })`, solo con `Z` |
| Objetos | Estrictos: una clave desconocida → `INVALID` | `.strict()` |
| Textos libres | Se validan **sin transformarlos**; se rechazan los vacíos o solo con espacios | `z.string().refine(s => s.trim().length > 0)` y longitud máxima |
| Enteros | `z.number().int()` con tope `MAX_DB_INT = 2147483647` (límite del `Int` de Prisma, M-15) | |
| Decimales | `z.number().finite()` | |
| Rol | Cabecera `X-Demo-Role: SHIP | EARTH`, obligatoria salvo en `/api/health` | `DemoRoleSchema = z.enum(["SHIP","EARTH"])` |

Todos los esquemas viven en `packages/contracts`; los tipos se derivan con `z.infer`. Ningún otro paquete redefine un esquema.

---

## 2. Entidades

### 2.1 `Astronaut`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `AstronautId` | Texto de 1 a 40 caracteres: minúsculas, dígitos y guiones (`^[a-z0-9-]{1,40}$`). Sin lista fija en el código (DEC-6 C). La existencia se valida en el servidor contra `crew` |
| `displayName` | string | 1–60. En el seed: `sam` → "Sam" y `alex` → "Alex" (ficticios) |

### 2.2 `MissionClock`

| Campo | Tipo | Regla |
|---|---|---|
| `simEpoch` | fecha | Momento simulado del ancla |
| `realEpoch` | fecha | Momento real del ancla |
| `factor` | decimal | `> 0` y `≤ 3600` (límite técnico) |
| `clockVersion` | entero | `≥ 1`; sube en cada re-anclaje |

`computeSimNow(clock, realNow) = simEpoch + (realNow − realEpoch) × factor`. Es la **única implementación** y vive en `packages/contracts` (D-23). Trabaja en milisegundos y devuelve fecha ISO.

### 2.3 `EnvironmentProfile`

| Campo | Tipo | Regla |
|---|---|---|
| `profile` | enum | Solo `MARS_TRANSIT` en el MVP |
| `version` | entero | `≥ 1` |
| `oneWayDelayMinutesSim` | entero | `≥ 0`; minutos **simulados** de un sentido |
| `delaySource` | enum | `SIMULATED` hasta que V-7 tenga fuente; la interfaz lo rotula |
| `description` | string | 1–200 |

### 2.4 `Measurement`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | Cliente |
| `astronautId` | `AstronautId` | |
| `indicator` | enum | `HEART_RATE`, `BODY_TEMPERATURE`, `BLOOD_GLUCOSE`, `BLOOD_PRESSURE`, `MOOD`, `SLEEP` |
| `value` | según indicador | §3 |
| `unit` | según indicador | §3 |
| `context` | enum | §3.2 |
| `origin` | enum | Solo `MANUAL` en el contrato |
| `capturedAtReal` | fecha | Cliente; nunca se reescribe |
| `capturedAtSim` | fecha | Cliente, con `computeSimNow` y la copia local del reloj |
| `clockVersion` | entero | Versión del reloj usada |
| `envProfile`, `envVersion` | enum, entero | Perfil vigente al capturar |

Esquema: **unión discriminada por `indicator`**, para que `value` y `unit` siempre correspondan (§3.1).

### 2.5 `IncidentEvent` (unión discriminada por `type`)

Campos comunes: `id` (UUID), `incidentId` (UUID), `astronautId`, `type`, `actor` (`SHIP` | `EARTH`), `createdAtReal`, `createdAtSim`, `clockVersion` y `data`.
`sequence`: entero `≥ 1` y `≤ MAX_DB_INT` en **todos los eventos de la nave**; **ausente** en `EARTH_REVIEW`.

| `type` | Actor | `data` |
|---|---|---|
| `INCIDENT_OPENED` | SHIP | `{}` |
| `GUIDE_STARTED` | SHIP | `{ guideVersion }` (1–100) |
| `GUIDE_STEP_COMPLETED` | SHIP | `{ stepId }` (1–100) |
| `REPORT_SUBMITTED` | SHIP | `{ note? }` (0–500) |
| `INCIDENT_CLOSED` | SHIP | `{ closureReason: "REVIEWED", reviewEventId }` o `{ closureReason: "CLOSED_WITHOUT_REVIEW" }`. `reviewEventId` es obligatorio con `REVIEWED` y está prohibido sin él (DEC-9) |
| `INCIDENT_CANCELLED` | SHIP | `{ reason }` (1–200) |
| `EARTH_REVIEW` | EARTH | `{ text }` (1–500) |

Estados y transiciones: PROJECT_SPEC §7.2 sin cambios. La máquina de estados es una **función pura en `packages/contracts`** (`projectIncidentState`, `validateNextShipEvent`), la misma en cliente y servidor (ARCHITECTURE §15).

### 2.6 `Message`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | Quien escribe |
| `astronautId` | `AstronautId` | Conversación de ese astronauta |
| `direction` | enum | `SHIP_TO_EARTH` o `EARTH_TO_SHIP` |
| `body` | string | 1–500, validado sin transformar |
| `createdAtReal`, `createdAtSim`, `clockVersion` | | Igual que en los eventos |

Sin `incidentId` en el MVP (DEC-7).

### 2.7 `Transmission`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | Servidor |
| `direction` | enum | `SHIP_TO_EARTH` / `EARTH_TO_SHIP` |
| `contentKind` | enum | `MEASUREMENT`, `INCIDENT_EVENT`, `MESSAGE` |
| `contentId` | UUID | UUID del contenido |
| `acceptedAtReal`, `acceptedAtSim` | fecha | Servidor |
| `deliverAt` | fecha | `acceptedAtSim + oneWayDelayMinutesSim` del perfil vigente |
| `envProfile`, `envVersion` | | Perfil usado para calcular `deliverAt` |

- Única por (`contentKind`, `contentId`). Se crea **en la misma transacción de Prisma** que su contenido.
- **M-10:** cada respuesta valida que `contentKind` coincida con el contenido que acompaña. Ejemplo: un `MeasurementWithTransmission` exige `contentKind: "MEASUREMENT"`.
- `transportStatus` (`IN_TRANSIT` | `DELIVERED`) no se guarda: se calcula en cada consulta con `serverSimNow`. `QUEUED` existe solo en el cliente.

### 2.8 `ApiError`

`{ statusCode, error, message, details? }`. `error` es un código estable en MAYÚSCULAS (§5.3). `details` solo lleva mensajes de validación de Zod sobre la entrada del cliente, nunca trazas ni datos internos.

---

## 3. Indicadores

### 3.1 Forma del valor, unidad y presentación

| `indicator` | `value` | `unit` | Regla técnica | Decimales en pantalla |
|---|---|---|---|---|
| `HEART_RATE` | entero | `bpm` | `> 0`, `≤ MAX_DB_INT` | 0 |
| `BODY_TEMPERATURE` | decimal | `°C` (`"degC"` en código) | finito, `> 0` | 1 |
| `BLOOD_GLUCOSE` | decimal | `mg/dL` (`"mg_dL"`) | finito, `> 0` | 0 |
| `BLOOD_PRESSURE` | `{ systolic, diastolic }`, enteros | `mmHg` | cada uno `> 0`, `≤ MAX_DB_INT` | 0 |
| `MOOD` | entero | `scale_1_5` | 1 a 5 (definición de la escala, DEC-4) | 0 |
| `SLEEP` | decimal | `h` | finito, `≥ 0`, `≤ 24`, hasta 2 decimales (DEC-1) | 1 |

El límite de 24 h es la definición de "horas de sueño en un día", no un umbral de salud. Ningún otro límite superior, porque cualquiera parecería clínico.

### 3.2 Catálogo cerrado de contextos (DEC-3)

| Código | Texto en la interfaz (EN) |
|---|---|
| `AT_REST` | At rest |
| `AFTER_EXERCISE` | After exercise |
| `AFTER_WAKING` | After waking |
| `BEFORE_MEAL` | Before a meal |
| `AFTER_MEAL` | After a meal |

La medición de la demo y su historial usan `AT_REST`.

---

## 4. Evaluación personal (`health-engine`, se ejecuta en el cliente)

Reglas de ARCHITECTURE §8, más las precisiones aprobadas en el ensayo:

- **Comparable:** mismo `astronautId`, `indicator`, `unit` y `context`, y `capturedAtSim` **estrictamente anterior** al de la medición evaluada. La propia medición nunca cuenta, aunque tenga el mismo tiempo (comparación por `id`).
- **Orden y selección:** ascendente por `capturedAtSim`, luego `capturedAtReal`, luego `id`. Entran los **7 últimos**. Mínimo 3.
- **Salida:** `status` ∈ `COMPUTED`, `INSUFFICIENT_DATA` o `NOT_APPLICABLE` (estado de ánimo); `components` en orden fijo (`[systolic, diastolic]` o `[value]`), cada uno con `median`, `absoluteDifference` (con signo), `percentDifference` (o `null` con `percentNullReason: "MEDIAN_IS_ZERO"`); `usedRecordIds` (también con `INSUFFICIENT_DATA` y `NOT_APPLICABLE`); `criteria`, `rulesVersion` y `engineVersion`.
- Porcentaje = `(valor − mediana) / mediana × 100`. **El motor no redondea**; la interfaz redondea a 1 decimal las diferencias y según §3.1 la mediana.
- Clínica: siempre `{ status: "CLINICAL_RULES_NOT_AVAILABLE", rulesVersion: "none" }`.
- Si el valor no tiene la forma de su indicador, el motor lanza un error explícito (no debería ocurrir: `contracts` ya lo valida).
- **Pregunta abierta para T-301 (Benito y Bruno):** ¿una medición propia en `SYNC_ERROR` por `CONFLICT` cuenta para la mediana? Propuesta: sí, porque es un dato capturado por el astronauta que se conserva. Se registra en T-301.

---

## 5. Superficie de API (D-20; nueve rutas, ninguna más)

Todas las respuestas de consulta incluyen `serverSimNow`. Cabecera `X-Demo-Role` obligatoria salvo en `/api/health`; si falta o es inválida: 400 `MISSING_OR_INVALID_ROLE`.

### 5.1 Rutas

| Método y ruta | Solicitud | Respuesta 200 |
|---|---|---|
| `GET /api/health` | — | `{ status: "ok" }` |
| `GET /api/mission/config` | — | `{ clock: MissionClock, profile: EnvironmentProfile, serverSimNow }` |
| `POST /api/mission/clock/factor` | `{ factor }` | `{ clock }` re-anclado, con `clockVersion + 1` |
| `GET /api/crew` | — | `{ crew: Astronaut[] }` |
| `POST /api/sync/batch` | `SyncBatchRequest` | `SyncBatchResponse` |
| `GET /api/measurements?astronautId=` | — | `{ serverSimNow, items: [{ measurement, transmission, transportStatus }] }` |
| `GET /api/incidents?astronautId=` | — | `{ serverSimNow, incidents: [{ incidentId, astronautId, state, events: [{ event, transmission, transportStatus }] }] }` (`state` = proyección **para el rol que consulta**; `null` si Tierra aún no ve el `INCIDENT_OPENED`) |
| `GET /api/messages?astronautId=` | — | `{ serverSimNow, items: [{ message, transmission, transportStatus }] }` |
| `POST /api/demo/reset` | — | `{ clock }` inicial. Solo existe si `DEMO_RESET_ENABLED=true`; si no, 404 |

**Visibilidad (se filtra en la consulta del servidor):**
- Mediciones: SHIP ve todas las suyas; EARTH solo las de `deliverAt <= serverSimNow`.
- Mensajes: cada lado ve los propios siempre y los del otro lado solo entregados.
- Incidentes: SHIP ve todos sus eventos y solo las `EARTH_REVIEW` entregadas. EARTH ve el **prefijo contiguo** de eventos de la nave ya entregados (ordenados por `sequence`) más sus propias revisiones con su `transportStatus`.

### 5.2 Lote de sincronización

`SyncBatchRequest = { items: SyncBatchItem[] }`, de 1 a `SYNC_BATCH_MAX_ITEMS = 50` elementos. El cliente envía como máximo 20.
`SyncBatchItem = { kind: "MEASUREMENT", payload: Measurement } | { kind: "INCIDENT_EVENT", payload: IncidentEvent } | { kind: "MESSAGE", payload: Message }`.

**Permitido por rol:**
- SHIP: `MEASUREMENT`; `INCIDENT_EVENT` con actor SHIP; `MESSAGE` `SHIP_TO_EARTH`.
- EARTH: `INCIDENT_EVENT` de tipo `EARTH_REVIEW` con actor EARTH; `MESSAGE` `EARTH_TO_SHIP`.

`SyncBatchResponse = { serverSimNow, results: SyncItemResult[] }`, en el mismo orden que `items`.

`SyncItemResult = { id, kind, status, code, retryable, transmission?, error? }`:

| `status` | `code` | `retryable` | `transmission` | Efecto en el cliente |
|---|---|---|---|---|
| `ACCEPTED` | 201 | false | sí | `CONFIRMED` |
| `DUPLICATE` | 200 | false | sí, la original | `CONFIRMED` |
| `CONFLICT` | 409 | false | no | `SYNC_ERROR` permanente |
| `INVALID` | 400 | false, salvo DEC-8 | no | `SYNC_ERROR` permanente; si es reintentable, sigue en `PENDING_SYNC` |

**Respuesta del lote:** 200 si el sobre es válido, aunque fallen elementos. 400 si el sobre es inválido. 413 si supera `SYNC_BATCH_MAX_ITEMS` o `BODY_LIMIT` (1 MB); en ese caso el cliente divide el lote a la mitad. Red, tiempo agotado y 5xx son transitorios: se reintenta el lote completo.

**Aislamiento por elemento (M-16):** un error inesperado al procesar un elemento devuelve para **ese** elemento `INVALID`, `UNEXPECTED_ITEM_ERROR`, `retryable: true`, con un mensaje fijo y sin detalles internos. Nunca 500 para todo el lote.

**Igualdad para la idempotencia:** serialización canónica (claves ordenadas) del payload **después** de pasar por Zod, excluyendo lo que asigna el servidor. Se guarda en `payloadCanonical`.

**Orden de validación por elemento** (de la sesión N3b del ensayo):
1. Esquema (Zod).
2. Rol: el `kind`, el actor y la dirección son coherentes con `X-Demo-Role`.
3. UUID: mismo UUID y mismo contenido → `DUPLICATE`; mismo UUID y otro contenido → `CONFLICT`.
4. Pertenencia: el astronauta existe y el incidente es suyo.
5. Evento del futuro: un `createdAtSim` posterior al `acceptedAtSim` que asignaría el canal → `CREATED_AFTER_ACCEPTANCE`.
6. Reglas del actor: máquina de estados, `EARTH_REVIEW`, `REVIEWED`.

### 5.3 Códigos de rechazo (`error.error`)

| Código | `status` | Reintentable | Cuándo |
|---|---|---|---|
| `VALIDATION_FAILED` | INVALID | no | Falla Zod |
| `ROLE_NOT_ALLOWED` | INVALID | no | `kind`, actor o dirección no permitidos para el rol |
| `UNKNOWN_ASTRONAUT` | INVALID | no | `astronautId` no está en `crew` |
| `UUID_CONFLICT` | CONFLICT | no | Mismo UUID con otro contenido |
| `SEQUENCE_OCCUPIED` | CONFLICT | no | Par (`incidentId`, `sequence`) ocupado por otro UUID |
| `SEQUENCE_GAP` | INVALID | **sí** | Falta `sequence − 1` |
| `CREATED_AFTER_ACCEPTANCE` | INVALID | **sí** | Evento o mensaje con `createdAtSim` futuro |
| `INVALID_TRANSITION` | INVALID | no | Transición no permitida en §7.2 |
| `INCIDENT_ALREADY_OPEN` | INVALID | no | Ya hay otro incidente no terminado |
| `INCIDENT_NOT_OWNED` | INVALID | no | El incidente es de otro astronauta |
| `REVIEW_NOT_DELIVERED` | INVALID | no | `reviewEventId` no existe, no es `EARTH_REVIEW` de ese incidente o se entregó después del `createdAtSim` del cierre |
| `REPORT_NOT_DELIVERED` | INVALID | no | `EARTH_REVIEW` antes de que Tierra vea el `REPORT_SUBMITTED` |
| `UNEXPECTED_ITEM_ERROR` | INVALID | **sí** | Fallo inesperado de un elemento (M-16) |
| `MISSING_OR_INVALID_ROLE` | — (400 de la petición) | no | Cabecera ausente o inválida |
| `PAYLOAD_TOO_LARGE` | — (413 de la petición) | no | Lote o cuerpo demasiado grandes |

---

## 6. Solo cliente (no forma parte de los contratos)

### 6.1 Estados de sincronización (DEC-5, corrige M-6)

| Estado | Definición precisa | Cómo se ve en la interfaz |
|---|---|---|
| `SAVED_LOCAL` | Escrito en Dexie junto con su entrada de outbox, en una transacción. **Todavía sin ningún intento de envío** | "Saved on device" |
| `PENDING_SYNC` | Hubo al menos un intento sin confirmación: envío en curso, falla de red o 5xx, o `INVALID` reintentable. Se reintenta solo | "Queued" |
| `CONFIRMED` | El canal respondió `ACCEPTED` o `DUPLICATE`. La entrada de outbox se depura; el registro de dominio se conserva | "Confirmed by channel" + estado de transporte |
| `SYNC_ERROR` | Rechazo **permanente** (`CONFLICT` o `INVALID` no reintentable). Sin reintento automático; dato conservado y error visible | "Sync error: <code>" |

Nota: esto precisa PROJECT_SPEC §6.3, que metía también los errores transitorios en `SYNC_ERROR`. Con esta tabla, un transitorio queda en `PENDING_SYNC`. Si Bruno lo aprueba, se registra en PROJECT_MEMORY §14 y se corrige §6.3.

Transporte en el cliente: `QUEUED` mientras no esté `CONFIRMED`; después, `IN_TRANSIT` o `DELIVERED`, calculados con `computeSimNow` y la copia local del reloj.

### 6.2 Dexie (solo rol nave)

Base `astra-health`, `version(1)` con todas las tablas desde el inicio (repositorio nuevo: no hacen falta migraciones intermedias). Cada cambio posterior sube la versión, con su migración.

| Tabla | Clave e índices | Contenido |
|---|---|---|
| `measurements` | `id`; `[astronautId+indicator]`, `capturedAtSim` | `Measurement` + `syncState`, `transmission?`, `localOrigin` (`CAPTURED` / `HYDRATED`), `savedAtReal`, `lastError?` |
| `incidentEvents` | `id`; único `[incidentId+sequence]`, `incidentId` | `IncidentEvent` + los mismos campos locales |
| `messages` | `id`; `direction` | `Message` + los mismos campos locales |
| `outbox` | `id` (= UUID del contenido); `savedAtReal` | `{ id, kind, savedAtReal, attempts, blockedBy? }` |
| `config` | `key` | Copia de `clock`, `profile` y `crew` (tripulación de `GET /api/crew`, DEC-6 C); idioma elegido |

Envío ordenado por `savedAtReal` y, en empate, por `sequence`. Los eventos posteriores a un evento en `SYNC_ERROR` del mismo incidente no se envían y muestran "blocked by rejected event #n".

### 6.3 Contenido de la guía (local, sin red)

- Versión `astra-guide-1`, rotulada "Educational prototype".
- Orientación no clínica (D-29), con tres pasos: `repeat-measurement` ("Repeat the measurement"), `rest` ("Rest"), `notify-flight-surgeon` ("Notify the flight surgeon").
- Emergencia (D-28, sin revisor, V-9): **solo** el texto "Emergency guide: design pending — not operational instructions (no competent medical review)", sin pasos.

---

## 7. Configuración inicial (la carga el seed, T-105; DEC-10)

- Reloj: `factor = 60` (1 s real = 1 min simulado), `clockVersion = 1`, `simEpoch = realEpoch =` momento del seed o del reinicio.
- Perfil: `MARS_TRANSIT`, `version = 1`, `oneWayDelayMinutesSim = 120` (2 min reales), `delaySource = SIMULATED`.
- Ejemplo de `deliverAt` (base de T-006): si el canal acepta con `acceptedAtSim = 10:00:00.000Z`, entonces `deliverAt = 12:00:00.000Z`. Con factor 60, eso son 2 minutos reales después de la aceptación. Si a la mitad el factor cambia a 120, `deliverAt` sigue en 12:00 simulado y llega 30 s reales después del cambio.

## 8. Seed propuesto (base de T-009/T-105, Benito)

- Sam, `HEART_RATE`, `AT_REST`: seis registros con UUID y fechas **fijos** del 26 al 31 de oct de 2026, valores 68, 72, 70, 75, 66 y 71 (mediana 70.5). Cada uno con su transmisión ya entregada. Es el historial de la demo; la medición en vivo es ficticia (por ejemplo, 80 bpm).
- Sam, `BODY_TEMPERATURE`, `AT_REST`: dos registros → `INSUFFICIENT_DATA` (QA-202).
- Alex: tres registros de `HEART_RATE` `AT_REST`, para comprobar que no se mezclan astronautas.
- Seed repetible: solo crea lo que falta y nunca sobrescribe (M-4).
- Solo datos ficticios.
