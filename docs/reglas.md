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

## Configuración del login

**Ya no está pendiente.** Los parámetros del tenant Azure B2C están puestos por
defecto en `lib/fantasy/auth.ts` y el login se puede probar sin configurar nada:

| Parámetro | Valor por defecto |
|---|---|
| Token URL | `https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token` |
| Política ROPC | `B2C_1A_ResourceOwnerv2` |
| `client_id` | `af88bcff-1157-40a0-b579-030728aacf0b` |
| Scope | `openid {client_id} offline_access` |

Cada uno se sobreescribe con su `FANTASY_B2C_*` correspondiente.

**Procedencia**: salen de leer el código de
[Externoak/LaLigaApp](https://github.com/Externoak/LaLigaApp), un proyecto
activo que ataca este mismo juego y la misma API.

**Verificados contra la red el 2026-08-03.** Un intento de login devolvió
`AADB2C90225: The username or password provided in the request are invalid`,
que es un error del propio tenant emitido **después** de aceptar la petición
entera. Para llegar hasta ahí tuvieron que ser correctos la URL de token, la
política, el `client_id` y la forma del grant: si alguno fallara, el error
sería otro (`policy not found`, `invalid client`…). Lo único que quedó sin
validar en esa prueba fueron las credenciales.

De paso, eso cierra la duda de fondo: **se puede hablar con el servidor de
autenticación de LaLiga desde un servidor cualquiera**, sin proxy ni móvil de
por medio.

### Dos cosas que conviene no volver a aprender

**El bearer de la API es el `id_token`, no el `access_token`.** Con scope
`openid`, B2C devuelve `id_token` y puede no devolver `access_token` en
absoluto. El código exigía `access_token`, así que **un login correcto fallaba**
con "Fallo de autenticación" — que se lee como "la API está cerrada" cuando lo
único que pasaba es que mirábamos el campo equivocado. Hay tests que lo fijan en
`lib/fantasy/auth.test.ts`.

**ROPC solo funciona con cuentas locales de B2C**, las de email y contraseña.
Con una cuenta de Google, Apple o Facebook el tenant tendría que redirigir al
proveedor externo para validar, y en un grant de contraseña no hay redirección
posible: devuelve `AADB2C90225` —"username or password invalid"— **aunque la
contraseña sea correcta**. Confirmado en la práctica, no es teoría.

Para esas cuentas está el flujo interactivo, ya implementado:

| Parámetro | Valor |
|---|---|
| Política | `B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN` (`FANTASY_B2C_INTERACTIVE_POLICY`) |
| Redirect URI | `authredirect://com.lfp.laligafantasy` (`FANTASY_B2C_REDIRECT_URI`) |
| PKCE | S256, obligatorio |

Dos detalles que cuestan un rato descubrir:

- **No se manda `prompt=login`.** Esta política personalizada lo rechaza.
- **El refresh token queda atado a la política que lo emitió.** Refrescar uno
  del flujo interactivo con la política de contraseña falla, así que la
  política se guarda junto al token (`auth_tokens.policy`) y se reutiliza.

### El copiar-pegar del login interactivo

La dirección de retorno registrada en el tenant es la de la **app móvil**
(`authredirect://…`), y registrar una nuestra no está en nuestra mano. El
navegador no puede navegar a ese esquema, así que `/setup/login` pide pegar la
URL de vuelta a mano. Es un paso feo pero de una sola vez.

`FANTASY_B2C_REDIRECT_URI` existe justo para poder quitarlo: si algún día se
comprueba que el tenant acepta el origen del despliegue, se pone ahí y el
copiar-pegar desaparece.

### Lo que el cierre de la web NO significa

El juego oficial es hoy **solo app móvil**. Eso mata una vía concreta de
conseguir el token —abrir el juego en el navegador y sacarlo de `localStorage`—
que **este proyecto nunca usó**: aquí siempre se ha hecho ROPC directo contra
B2C. La API `fantasy-api.llt-services.com` sigue viva porque es la que consume
la app móvil.

Tampoco hace falta un MITM entre el móvil y un PC para la ingesta diaria. El
MITM sigue siendo útil, pero como **herramienta de diagnóstico puntual** para
cerrar los pendientes de arriba (sobre todo la `k` del blindaje y el punto 8),
no como arquitectura permanente: obligaría a tener el móvil emparejado en cada
sincronización y moriría en cuanto la app active certificate pinning.

### Sin confirmar: el prefijo `/api`

LaLigaApp apunta a `https://fantasy-api.llt-services.com/api` mientras que aquí
se usa la raíz. Los nombres de ruta coinciden exactamente en todo lo demás. Si
la sincronización da **404 en todas las rutas** —no en una suelta— es esto, y se
arregla poniendo `FANTASY_API_BASE` con el sufijo.

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
