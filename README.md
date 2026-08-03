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
| 2 | Puntos esperados + optimizador de alineación | hecho |
| 3 | Subasta, modelo de precios y fichajes | hecho |
| 4 | Alertas por Telegram | hecho |

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

## Los motores de la fase 2

### Modelo de equipos (`lib/engine/team-model.ts`)

Dixon-Coles ajustado por máxima verosimilitud sobre los resultados reales, con
decaimiento temporal:

```
λ_local     = exp(μ + ataque_local     + defensa_visitante + ventaja_local)
λ_visitante = exp(μ + ataque_visitante + defensa_local)
```

Sustituye la típica "dificultad del rival del 1 al 5" por números con
significado, y da directamente `P(portería a cero)`, que es lo que más pesa en
los puntos de porteros y defensas.

Hay un test que exige que **bata a la línea base** "todos los equipos iguales
con la media de goles de la liga". Si no la batiera, no habría motivo para
usarlo.

### Puntos esperados (`lib/engine/expected-points.ts`)

```
EP = P(titular) · E[puntos | titular] + P(suplente) · E[puntos | suplente]
```

Tres decisiones que marcan la diferencia:

1. **No se modelan puntos, se modelan minutos.** El 80% de la varianza es
   "¿juega?". Un crack que no es titular vale cero, y el motor lo refleja.
2. **Shrinkage bayesiano** hacia la media de la posición:
   `r̂ = (n·r + k·r_pos) / (n + k)`. Sin eso, dos partidazos disparan la
   proyección de un jugador que en realidad es del montón.
3. El ajuste por rival reparte los puntos entre la parte que depende de no
   encajar y la que depende de atacar, y escala cada una con el modelo de
   equipos. A un portero le importa la portería a cero; a un delantero, los
   goles esperados.

Lesión y sanción son **puertas duras**, y no solo para la titularidad: un
lesionado tampoco entra desde el banquillo.

Este motor **no necesita el baremo de puntuación** del juego —que no está
confirmado— porque trabaja con los puntos fantasy históricos que ya da la API.

### Optimizador de alineación (`lib/engine/lineup.ts`)

**Modo valor esperado — exacto.** Se enumeran todas las formaciones legales y
dentro de cada una se asigna con **flujo de coste mínimo**. Cuando cada jugador
solo puede ocupar su posición esto equivale a coger los N mejores de cada una;
la gracia es que si hay jugadores versátiles el problema deja de ser separable
y el algoritmo sigue dando el óptimo sin cambiar nada.

**Modo contra un rival — simulación.** Maximizar `P(superar al rival)` no se
resuelve con medias. Se simula con Monte Carlo, remuestreando el histórico de
cada jugador cuando lo hay en vez de suponer una forma de distribución, y se
busca por intercambios de un jugador. **No garantiza el óptimo global**, y así
está dicho en el código.

La consecuencia es contraintuitiva y hay un test que la fija: **cuando ir sobre
seguro es perder seguro, el once óptimo es el de más varianza**, aunque sume
menos puntos esperados.

## Los motores de la fase 3

Se ejecutan en este orden y no es casual: el optimizador de fichajes produce el
**coste real del euro**, y sin ese número la puja óptima estaría mal calculada.

### Modelo de precios (`lib/engine/value.ts`)

Predice el **retorno**, no el precio absoluto, y por **cuantiles, no por la
media**: para decidir si especular no basta `E[r]`, hace falta `P(r < 0)`. Un
modelo que solo da la media no permite gestionar riesgo, y sin gestión de
riesgo la especulación es apostar.

Regresión lineal regularizada con pérdida pinball. Con pocos datos bate a
modelos más complejos, así que se empieza por ahí.

**Se valida con separación temporal estricta** —entrenar con el pasado,
predecir el futuro, sin mezclar fechas nunca— y tiene que **batir a la línea
base ingenua** "mañana vale lo mismo que hoy". Si no la bate, la interfaz lo
dice y desaconseja usarlo. Hay un test que comprueba que no finge habilidad
cuando los datos son puro ruido.

### Optimizador de fichajes (`lib/engine/transfers.ts`)

Evalúa combinaciones de ventas y compras reoptimizando **la alineación entera**
en cada una, porque los puntos que ganas o pierdes no son los del jugador sino
los del once: vender a un suplente no cuesta puntos por bueno que sea.

De aquí sale el **precio sombra del dinero**. Y aquí hay un detalle que importa:
en un problema combinatorio el óptimo es una función escalonada de la caja, así
que una diferencia finita pequeña daría cero justo cuando te falta poco para
algo que vale mucho. Se mide en su lugar el **mejor rendimiento marginal
disponible en el entorno**.

### Subasta (`lib/engine/auction.ts`)

```
P(ganar | b)     = Π_i P(puja_i < b)
E[excedente](b)  = P(ganar | b) · (V − c·b)
```

La pieza que ninguna web puede tener: **la distribución de pujas de cada rival**,
aprendida del feed de tu propia liga. Unos pujan un 5% por encima del valor,
otros un 40%. Con poco historial de un rival se mezcla con el de la liga
entera, porque con dos observaciones no se puede afirmar que alguien sea
conservador.

Devuelve la curva completa para poder decidir "por 2M más subo del 55% al 80%",
más los dos consejos que salen de las reglas: **pujar pronto** (los empates los
gana el primero) y **pujar cifras no redondas**.

### Especulación (`lib/engine/speculation.ts`)

```
b_max = max { b : E[valor_salida] ≥ c·b + coste_de_plaza  ∧  P(r < 0) ≤ tolerancia }
```

Comprar a alguien que nunca vas a alinear, solo porque va a subir. Tres cosas
impiden que sea dinero gratis y las tres están dentro: el coste real del euro,
el coste de ocupar una plaza, y la liquidez de salida.

Incluye las reglas de salida —objetivo alcanzado, momentum agotado, stop de
tesis, coste de oportunidad— y el **clausulazo como salida**: si la cláusula
está por encima de lo que pagaste, que te lo quiten cierra la posición con
beneficio y sin esperar.

## Alertas (fase 4)

`GET /api/cron/alerts`, pensado para dispararse un rato antes del cierre de
mercado. Es independiente de la sincronización a propósito: si la ingesta
falla, este job sigue corriendo y precisamente eso es lo primero de lo que
avisa.

El criterio de diseño es uno solo: **si no hay nada accionable, no manda
nada**. Una app que avisa todos los días se deja de leer, y entonces el aviso
que de verdad importaba pasa desapercibido.

- **Umbral de prioridad**: solo interrumpe lo alto y lo medio. Un chollo
  especulativo es prioridad baja y nunca llega al móvil — si se pasa la
  oportunidad, no pasa nada.
- **Enfriamiento por tipo**: un riesgo de cláusula sigue ahí mañana y no hace
  falta recordarlo cada día (48h); una puja caduca con el mercado y conviene
  repetirla mientras siga viva (20h).
- **Claves estables**: la de una puja incluye el día, la de un riesgo de
  cláusula no, y la de un movimiento identifica la operación. Así cada aviso
  se repite exactamente con la frecuencia que merece.
- Lo enviado se registra **solo tras un envío correcto**: si Telegram falla, se
  reintenta mañana en vez de dar por avisado algo que nunca llegó.

`?dry-run=1` compone el mensaje y lo devuelve sin enviarlo, para ajustar
umbrales sin llenarte el móvil de pruebas.

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
npm test          # 287 tests
npm run typecheck
npm run build
```

Los tests cubren lo que se puede verificar sin red: la allowlist (incluido que
rechaza los endpoints de escritura conocidos), el efecto de cada evento sobre la
caja, la propagación de la incertidumbre a las bandas, la calibración contra el
saldo propio, la tolerancia de los parsers, el consenso ponderado entre fuentes,
la capa de correcciones manuales y los cuatro motores de la fase 1.
