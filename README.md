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

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Ingesta, snapshots, allowlist, overrides | hecho |
| 1 | Caja de rivales + radar de cláusulas | hecho |
| 2 | Puntos esperados + optimizador de alineación | pendiente |
| 3 | Subasta, modelo de precios y fichajes | pendiente |
| 4 | Alertas por Telegram | pendiente |

## Los motores de la fase 1

### Caja de los rivales (`lib/engine/budget.ts`)

Se reconstruye movimiento a movimiento desde el feed de actividad, y el
resultado es una **banda `[mín, máx]`**, nunca una cifra. Cuando el feed no
expone un importe, la banda se ensancha en lugar de asumir un valor; y el
acotado no es arbitrario: una compra no puede haber costado menos que el valor
de mercado (regla confirmada), y el techo sale del **multiplicador de puja
aprendido de tu propia liga**.

**Se calibra contra tu propio saldo**, que es el único visible. El residuo mide
exactamente lo que no se está modelando (premios por jornada, un presupuesto
inicial distinto), se aplica a todos y además ensancha sus bandas: saber que
falta algo no es lo mismo que saber cuánto es. Si el modelo no clava tu saldo,
no acierta el de nadie — por eso es el test de aceptación del motor.

### Exposición a cláusulas (`lib/engine/exposure.ts`)

Proceso de Poisson: cada rival aporta una intensidad de amenaza y las
intensidades se suman.

```
λ_i = ataques_esperados_i · P(caja_i ≥ C) · atractivo_i · ganga_i
p   = 1 − exp(−Σ λ_i)
```

Cada factor responde a una pregunta distinta: ¿este rival ataca? (tasa
histórica con shrinkage), ¿puede pagarlo? (de la banda de caja), ¿le sirve de
algo? (a quien ya tiene a Lewandowski no le interesa tu delantero), ¿le sale a
cuenta? (el techo de lo que esta liga paga por encima del valor).

Frente a multiplicar factores sueltos, sumar intensidades da probabilidades
acotadas sin recortes artificiales y hace que el horizonte temporal entre solo.

### Blindaje (`lib/engine/clause-defense.ts`)

```
E[beneficio de blindar Δ] = (V_yo − C) · [ p(C) − p(C + k·Δ) ] − Δ
```

Lo primero que hace es descartar a quien no hay que blindar:

> Si tu cláusula ya está por encima de lo que el jugador vale para ti, que te lo
> clausulen es un buen negocio. No hay que blindar: hay que desearlo.

`V_yo` es el **coste de reposición** — lo que costaría ganar la subasta por un
equivalente, con el multiplicador aprendido de tu liga — no el valor de mercado
a secas. En la fase 2 pasa a ser puntos esperados.

`k` es el multiplicador de blindaje y está **sin confirmar**, así que llega como
parámetro obligatorio: sin él el motor no se ejecuta y la interfaz dice qué
falta y cómo averiguarlo.

Un aviso que sale del propio modelo: **blindar casi nunca compensa.** Solo sale
a cuenta con jugadores cuya cláusula está muy por debajo de lo que valen para ti.
En el resto de casos el dinero rinde más en otra parte.

### Clausulazos (`lib/engine/clause-attack.ts`)

```
Neto = (V_yo − C) − daño_por_financiar_al_rival
```

El término que casi nadie considera: **al pagar una cláusula le pones ese dinero
en la caja al rival**. El motor recalcula su banda tras el pago y mide cuánto
sube la exposición de tu propia plantilla. Si el agujero que abre supera la
ganancia, la recomendación es negativa aunque el jugador esté "barato".

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
npm test          # 143 tests
npm run typecheck
npm run build
```

Los tests cubren lo que se puede verificar sin red: la allowlist (incluido que
rechaza los endpoints de escritura conocidos), el efecto de cada evento sobre la
caja, la propagación de la incertidumbre a las bandas, la calibración contra el
saldo propio, la tolerancia de los parsers, el consenso ponderado entre fuentes,
la capa de correcciones manuales y los cuatro motores de la fase 1.
