# Fantasy Advisor

Asistente de decisión privado para **LaLiga Fantasy Oficial**. Sincroniza el
estado real de tu liga y responde con números, no con corazonadas:

1. ¿Qué once alineo?
2. ¿A quién blindo, y con cuánto?
3. ¿A quién clausulo, y me compensa?
4. ¿Qué compro, qué vendo, y **cuánto pujo exactamente**?
5. ¿Hay algún jugador que me renta comprar **solo para revenderlo más caro**, y
   hasta qué precio?

> **El motor calcula, la IA explica. Nunca al revés.** Todo número sale de
> código determinista, versionado y testeable.

El plan completo, con las fórmulas de cada motor, está en el documento de plan
del proyecto. Las reglas del juego confirmadas y las pendientes, en
[`docs/reglas.md`](docs/reglas.md).

---

## Estado

**Fase 0 completada**: esqueleto, cliente de la API, ingesta, snapshots,
fuentes secundarias, correcciones manuales y panel mínimo.

Los motores de decisión (fases 1-3) todavía no existen. Es deliberado: la fase 0
es la única urgente, porque **cada día sin sincronizar es histórico de mercado
perdido para siempre** y no se recupera hacia atrás.

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Ingesta, snapshots, allowlist, overrides | hecho |
| 1 | Caja de rivales + radar de cláusulas | pendiente |
| 2 | Puntos esperados + optimizador de alineación | pendiente |
| 3 | Subasta, modelo de precios y fichajes | pendiente |
| 4 | Alertas por Telegram | pendiente |

---

## Solo lectura, por construcción

La app **recomienda**; tú ejecutas en la app oficial. El cliente de la API solo
expone `get()`, y toda ruta pasa por una allowlist antes de salir a la red: los
endpoints de puja, clausulazo y blindaje están deliberadamente fuera. No es
disciplina, es que no hay forma de llamarlos.

```bash
npm run sync -- --offline   # imprime las rutas y confirma que todas son de lectura
```

Además: uso personal, sin redistribución de datos, rate limiting secuencial, y
`robots.txt` respetado con caché agresiva en los scrapers.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env          # rellena DATABASE_URL y TOKEN_ENCRYPTION_KEY
npm run db:migrate            # crea las 16 tablas
npm run sync -- --offline     # valida rutas sin credenciales ni red
npm run sync -- --login       # login inicial; guarda el refresh token cifrado
npm run sync -- --dry-run --shape
npm run sync                  # sincroniza de verdad
npm run dev
```

`--dry-run` lee de la API pero **no escribe nada**. `--shape` añade el informe
de mapeo de campos: qué no se encontró (hay que corregir el parser) y qué llega
pero nadie lee (datos disponibles sin aprovechar). Ese informe es lo que cierra
la mayoría de las incógnitas de `docs/reglas.md`.

Después, programa `GET /api/cron/sync` una vez al día con la cabecera
`Authorization: Bearer $CRON_SECRET`. **Actívalo cuanto antes**, aunque no haya
interfaz que mirar todavía.

---

## Arquitectura de datos: tres capas

1. **Cruda** (`raw_*`), append-only: la respuesta tal cual. Permite reprocesar
   el pasado cuando mejore un parser y diagnosticar qué cambió el día que la
   API no oficial se rompa.
2. **Derivada** (`players`, `managers`, `roster_entries`, `activity_events`…):
   normalizada y reconstruible al 100% desde la cruda.
3. **Correcciones manuales** (`manual_overrides`): se aplican **al leer**, no al
   escribir. Una resincronización jamás pisa una corrección hecha a mano, y la
   interfaz marca qué dato viene de dónde.

Encima, los **snapshots diarios** (`player_value_snapshots`, `roster_snapshots`,
`manager_snapshots`): el activo más valioso del proyecto y el único que no se
puede recuperar retroactivamente.

### El feed de actividad

`activity_events` es la tabla que lo cambia todo. De ahí salen dos cosas que
ninguna web pública puede darte, porque ninguna conoce tu liga privada:

- la **caja de cada rival**, reconstruida movimiento a movimiento
- **cuánto suele pujar cada uno por encima del valor de mercado**

Cuando el feed no expone un importe, el evento se marca `amountCertain: false` y
la caja se convierte en una **banda**, no en un número. Una banda ancha y honesta
vale más que una cifra estrecha e inventada.

---

## Honestidad sobre lo que no está verificado

Tres cosas se han construido sin poder contrastarlas contra la realidad, y están
marcadas como tales en el código en vez de disimuladas:

- **Nombres de campo de la API**: los parsers prueban varios alias por campo y
  reportan lo que fallan (`--shape`). Ninguno inventa un valor por defecto que
  luego se confundiría con un dato real.
- **Selectores de los scrapers**: el entorno de desarrollo no tiene salida a
  jornadaperfecta.com ni futbolfantasy.com. Están aislados en una constante
  `SELECTORS` por adaptador; confirmarlos es tocar un solo sitio. Los tests usan
  fixtures propias, así que validan la extracción, no el marcado remoto.
- **Parámetros del login B2C**: `FANTASY_B2C_TOKEN_URL`, `_CLIENT_ID` y
  `_SCOPE` se obtienen observando el login de la app oficial. Sin ellos la app
  falla con un mensaje claro.

Una fuente que responde 200 pero devuelve cero jugadores se trata como **caída**,
no como "hoy no juega nadie": confundir esas dos cosas envenenaría todas las
proyecciones.

---

## Desarrollo

```bash
npm test          # 76 tests
npm run typecheck
npm run build
```

Los tests cubren lo que se puede verificar sin red: la allowlist (incluido que
rechaza los endpoints de escritura conocidos), el efecto de cada evento sobre la
caja, la tolerancia de los parsers, el consenso ponderado entre fuentes y la
capa de correcciones manuales.
