# Despliegue en Vercel

## Se puede desplegar ya, con un matiz importante

La aplicación **compila y arranca**, y desplegarla ya merece la pena por una
razón concreta: **activar el cron cuanto antes**. Cada día sin sincronizar es
histórico de mercado que no se recupera hacia atrás, y el modelo de precios no
empieza a ser fiable hasta acumular unas 200 muestras.

Pero hasta que no se resuelva el login (`FANTASY_B2C_*`), la sincronización
fallará y la app enseñará la pantalla de configuración. **Desplegar es útil
aunque el login todavía no funcione** —deja la infraestructura lista— pero no
verás datos hasta cerrar ese punto.

## Pasos

### 1. Base de datos: Neon desde el propio Vercel

"Vercel Postgres" ya no existe como producto propio: en diciembre de 2024
Vercel migró esas bases a Neon. Hoy se crea desde el Marketplace, sin salir del
panel:

> **Storage → Create Database → Neon**

La integración **inyecta las variables sola** en el proyecto, así que no hay
que copiar ninguna cadena a mano. Las dos que importan:

| Variable | Qué es | Quién la usa |
|---|---|---|
| `DATABASE_URL` | Conexión *pooled* (PgBouncer, host con `-pooler`) | La app |
| `DATABASE_URL_UNPOOLED` | Conexión **directa** | Las migraciones |

Neon encaja bien con esta app en particular porque tiene *scale-to-zero*: esto
es un cron diario y un panel que se mira de vez en cuando, o sea que está
parada casi todo el tiempo. El plan gratuito sobra.

**No son intercambiables**, y usar la que no toca no falla de forma limpia
—falla a ratos—, así que el código las distingue solo (`lib/db/config.ts`):

- La app abre la pooled **sin prepared statements**. `postgres-js` los usa por
  defecto y PgBouncer en modo transacción no los soporta; el síntoma serían
  errores intermitentes en producción. Se puede reactivar con
  `DATABASE_PREPARE=true`, pero solo contra un Postgres directo.
- El pool es de **1 conexión en Vercel** (cada instancia tiene el suyo y se
  multiplican; el pooling real lo hace PgBouncer) y de 5 fuera, donde el
  proceso es único y de larga vida. Se ajusta con `DATABASE_POOL_MAX`.
- `drizzle.config.ts` coge la **directa** para el DDL, y cae a `DATABASE_URL`
  cuando no hay una declarada, que es el caso de un Postgres local.

### 2. Migraciones: se aplican solas en cada despliegue

`npm run build` ejecuta `db:deploy` antes de compilar, así que **cada
despliegue deja el esquema al día** sin que haya que hacer nada. También en los
previews, que en Neon tienen su propia rama y arrancarían vacíos.

Detalles que importan (`scripts/migrate.ts`):

- Usa el migrador programático de `drizzle-orm`, que es dependencia de
  producción, en vez de `drizzle-kit`, que es de desarrollo. Así no depende de
  que el entorno de build conserve las devDependencies.
- Usa la conexión **directa**, porque PgBouncer en modo transacción no lleva
  bien el DDL.
- Si no hay base de datos configurada **no falla: avisa y sigue**. Eso permite
  colgarlo del `build` sin romper un `npm run build` en un portátil sin `.env`.
- Si hay base pero la migración falla, **sí rompe el build**. Desplegar contra
  un esquema viejo produce errores mucho peores de leer, del tipo
  `relation "sync_runs" does not exist`.

Con terminal, lo mismo a mano:

```bash
npm run db:deploy    # 19 tablas
```

### 3. Variables de entorno

En el panel de Vercel, **Settings → Environment Variables**. Las de la base de
datos ya están puestas por la integración; faltan estas dos:

| Variable | Cómo se obtiene |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | Cualquier cadena larga y aleatoria |

Los parámetros del login (`FANTASY_B2C_*`) **ya no hace falta ponerlos**: tienen
valor por defecto. Lo que sí conviene fijar cuando se sepa es
`FANTASY_LEAGUE_ID` y `FANTASY_CLAUSE_MULTIPLIER`, ambos en
[`reglas.md`](reglas.md).

**`FANTASY_EMAIL` y `FANTASY_PASSWORD` no deberían subirse a Vercel.** El login
se hace una vez en local y lo que queda guardado en la base de datos es el
refresh token, cifrado. Vercel solo necesita poder refrescarlo.

### 4. Login, una sola vez

**Desde el navegador**, que es lo que no exige tener nada instalado:

> `https://TU-APP.vercel.app/setup/login`

Pide tres cosas: el `CRON_SECRET` (que es lo que protege la página), y el email
y la contraseña de LaLiga Fantasy. **La contraseña no se guarda en ningún
sitio** —ni en la base ni en las variables de entorno—: se usa para pedir el
token y se descarta. Lo único que queda almacenado es el refresh token,
cifrado.

Con terminal, el equivalente es `npm run sync -- --login`. En ese caso hay que
apuntar a la base **remota**, porque el token se guarda en Postgres y no en un
fichero:

```bash
DATABASE_URL="<la de Neon>" npm run sync -- --login
```

Hacerlo contra un Postgres local deja a Vercel sin token, y el cron falla con
*"No hay refresh token guardado"*.

Ojo: ROPC solo funciona con cuentas locales de email y contraseña. Si la cuenta
del juego es de Google, Apple o Facebook, esto falla por diseño y hace falta el
flujo interactivo, todavía sin implementar. Ver [`reglas.md`](reglas.md).

### 5. Crons

`vercel.json` ya los declara:

| Ruta | Horario (UTC) | Para qué |
|---|---|---|
| `/api/cron/sync` | 05:00 | Sincronizar y capturar el snapshot del día |
| `/api/cron/alerts` | 10:00 | Aviso antes del cierre de mercado |

Tres límites del plan Hobby que condicionan esto:

- **Un disparo al día por cron.** Suficiente: el snapshot diario es lo que
  hace falta, y el aviso diario también.
- **Solo UTC.** Hay que convertir desde hora peninsular a mano: en verano
  restar 2 horas, en invierno 1.
- **Se dispara en cualquier momento dentro de la hora indicada.** Con `0 10 * * *`
  puede sonar entre las 10:00 y las 10:59 UTC. Por eso el aviso lleva margen
  respecto al cierre de mercado.

> El horario de las alertas es provisional: la **hora exacta de cierre de
> mercado sigue sin confirmar** (regla nº 6). Cuando se sepa, hay que ajustar
> ese cron para que avise con margen suficiente y contando con la hora de
> imprecisión de Vercel.

Vercel llama a estas rutas con la cabecera `Authorization: Bearer $CRON_SECRET`
automáticamente, que es lo que las rutas comprueban.

### 6. Comprobar que funciona

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://TU-APP.vercel.app/api/cron/alerts?dry-run=1
```

`dry-run=1` compone el aviso y lo devuelve sin enviarlo. Es la forma de
verificar el despliegue sin tocar nada ni llenarte el móvil.

## Alternativas

Si el límite de un disparo diario se queda corto —por ejemplo para reaccionar a
los onces confirmados una hora antes de cada partido— hay dos caminos: subir a
Vercel Pro, o alojar en algo con cron libre (Fly.io, Railway, un VPS). Para lo
que hace hoy la app, un disparo diario basta.

## Sobre la privacidad

El repositorio es público. En el código no hay ningún secreto —`.env` está en
`.gitignore` y solo se versiona `.env.example` con los nombres— pero conviene
tenerlo presente: las credenciales viven únicamente en las variables de entorno
de Vercel y en tu `.env` local.
