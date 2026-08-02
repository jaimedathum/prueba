# Reglas del juego: lo confirmado y lo pendiente

Este documento es la única fuente de verdad sobre las reglas de LaLiga Fantasy
Oficial que usa el proyecto. **Nada de lo que está en la sección "pendiente" se
hardcodea en el código**: los motores que dependen de ello o no existen todavía,
o fallan con un mensaje claro. Una recomendación calculada sobre una regla
inventada es peor que no dar recomendación.

---

## Confirmado

### El mercado es una subasta ciega a primer precio

- Las pujas son **secretas**: no se ven las de los demás.
- Gana **la más alta**.
- En caso de empate, gana **la puja realizada antes**.
- **No se puede pujar por debajo del valor de mercado**: ese es el suelo.

**Consecuencias de diseño**, todas ya recogidas en el plan:
- La puja óptima tiene solución matemática (`lib/engine/auction.ts`, fase 3).
- Conviene pujar **pronto**, porque los empates los gana el primero.
- Conviene pujar **cifras no redondas**: un euro por encima de un número
  psicológico redondo gana muchos empates.

### El valor de mercado lo mueve un algoritmo de 24 horas

Los factores conocidos son las compras y ventas de los managers, **el número y
el valor de las pujas**, y el rendimiento reciente del jugador.

**Consecuencia**: el precio es demanda, y la demanda es parcialmente observable
desde el mercado y el feed de actividad. Por eso el snapshot diario guarda
`ownedCount` y `onMarket` además del valor.

### Existe el blindaje

Se puede pagar para subir la cláusula de un jugador propio. El **cuánto** está
en la sección pendiente, y es justo el número del que depende toda la
recomendación de blindaje.

### Presupuesto inicial de referencia

200M. Se usa como semilla de la inferencia de caja y se **calibra** contra el
saldo propio, que sí es visible.

---

## Pendiente de confirmar en la fase 0

Cada una indica cómo confirmarla y qué se rompe si se asume mal.

### 1. Coste del blindaje y multiplicador de la cláusula

**Cómo**: observar la petición y la respuesta de `PUT .../buyout/player` al
blindar a un jugador en la app oficial, y contrastar con las reglas publicadas.

**Depende de esto**: la `k` de la fórmula de blindaje

```
E[beneficio de blindar Δ] = (V_yo − C) · [ p(C) − p(C + k·Δ) ] − Δ
```

Sin `k` no hay recomendación de blindaje posible. Es el número más importante
de toda esta lista.

### 2. Fórmula de la cláusula inicial y su evolución

**Cómo**: comparar `buyoutClause` y `marketValue` de varios jugadores recién
fichados y seguir su evolución en los snapshots diarios durante una semana.

**Depende de esto**: el radar de exposición y —clave— saber si te interesa que
te clausulen. Si la cláusula sube sola con el valor, la exposición cambia sin
que hagas nada.

### 3. ¿Hay suplentes automáticos?

**Cómo**: comprobar en una jornada pasada si un titular que no jugó fue
sustituido por un suplente en la puntuación (`/lineup/week/{week}` frente a los
puntos de esa jornada).

**Depende de esto**: el objetivo del optimizador de alineación. Con suplentes
automáticos, el banquillo tiene valor y hay que optimizar los 15; sin ellos,
solo importan los 11 y el "riesgo de cero" pesa mucho más.

### 4. ¿Hay capitán o multiplicadores?

**Cómo**: revisar la respuesta de `/lineup` en busca de un campo de capitán, y
las formaciones de `/v4/teams/lineup/formations?option=premium`.

**Depende de esto**: si existe, el optimizador tiene que decidir también a quién
poner el multiplicador, que no es simplemente el de más puntos esperados cuando
se optimiza `P(ganar)` en vez de la media.

### 5. Premios por jornada

**Cómo**: buscar en el feed de actividad eventos de tipo premio y contrastar el
saldo propio antes y después de una jornada.

**Depende de esto**: la calibración de la caja de los rivales. Si hay premios y
no se modelan, la caja estimada se queda corta y el riesgo de clausulazo sale
subestimado — el error peligroso.

### 6. Cierre de mercado y bloqueo de alineación

**Cómo**: observar `expirationDate` en el mercado y comprobar cuándo deja de
aceptarse un cambio de alineación.

**Depende de esto**: cuándo tienen que llegar las alertas. Si la alineación se
bloquea por jugador al empezar *su* partido, hay ventana para reaccionar a los
onces confirmados; si se bloquea toda de golpe, no la hay.

### 7. ¿La venta al mercado es instantánea?

¿Se vende al instante por el valor de mercado, o hay que listar y esperar pujas?

**Cómo**: vender un jugador de poco valor en la app y ver si el dinero entra al
momento.

**Depende de esto**: **la viabilidad entera del trading especulativo**. Con
salida instantánea y garantizada, el riesgo de liquidez es casi cero y comprar
para revender es una jugada sólida. Si hay que listar y esperar, hay que
descontar el riesgo de quedarse pillado con el jugador.

### 8. ¿Hay histórico de valores en la API?

Los scrapers antiguos mencionan un endpoint `market-values` con precios por
fecha. Comprobar si `/v1/competition/{cmp}/player/{id}/league/{leagueId}` lo
devuelve.

**Cómo**: `npm run sync -- --shape` lista los campos de la respuesta que nadie
está leyendo. Si aparece algo tipo `marketValues`, está ahí.

**Depende de esto**: **el calendario del modelo de precios**. Con histórico se
hace backfill de la temporada entera y el trading está operativo en la semana 1;
sin él hay que esperar 4-6 semanas a acumular snapshots propios. Es la primera
comprobación que hay que hacer.

Plan B si no existe: FútbolFantasy y Comuniate publican histórico diario de
subidas y bajadas, scrapeable.

### 9. Identificadores de posición

`lib/domain/positions.ts` asume `1=PT, 2=DF, 3=MC, 4=DL`.

**Cómo**: contrastar el `positionId` de cuatro jugadores conocidos, uno por
posición.

**Depende de esto**: el optimizador de alineación colocaría a la gente en
puestos equivocados, y sería un error silencioso — los números seguirían
saliendo, solo que mal.

---

## Configuración del login (también pendiente)

`lib/fantasy/auth.ts` necesita tres variables que se obtienen observando la
petición de login de la app oficial:

| Variable | Qué es |
|---|---|
| `FANTASY_B2C_TOKEN_URL` | Endpoint de token del tenant Azure B2C de LaLiga |
| `FANTASY_B2C_CLIENT_ID` | `client_id` que usa la app |
| `FANTASY_B2C_SCOPE` | Scope solicitado |

Sin ellas la app falla con un mensaje explícito en vez de intentar adivinarlas.

---

## Cómo se cierra esta lista

```bash
npm run sync -- --offline    # valida rutas sin credenciales ni red
npm run sync -- --login      # login inicial (una sola vez)
npm run sync -- --dry-run --shape
```

`--dry-run` lee de la API pero **no escribe nada**. `--shape` añade el informe
de mapeo: qué campos no se encontraron (hay que corregir el parser) y qué
campos llegan pero nadie lee (datos disponibles sin aprovechar). Con ese informe
delante se cierran de golpe los puntos 1, 2, 4, 8 y 9.
