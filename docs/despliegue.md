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

### 1. Base de datos

Vercel no incluye Postgres. Crear una en [Neon](https://neon.tech) o
[Supabase](https://supabase.com) (ambas tienen plan gratuito suficiente para
esto) y copiar la cadena de conexión.

```bash
npm run db:migrate    # crea las 18 tablas
```

Se puede lanzar en local apuntando `DATABASE_URL` a la base remota.

### 2. Variables de entorno

En el panel de Vercel, **Settings → Environment Variables**. Las
imprescindibles para que arranque:

| Variable | Cómo se obtiene |
|---|---|
| `DATABASE_URL` | De Neon o Supabase |
| `TOKEN_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | Cualquier cadena larga y aleatoria |

Las que hacen falta para que sirva de algo están en
[`reglas.md`](reglas.md): `FANTASY_B2C_TOKEN_URL`, `FANTASY_B2C_CLIENT_ID`,
`FANTASY_B2C_SCOPE`, `FANTASY_LEAGUE_ID` y `FANTASY_CLAUSE_MULTIPLIER`.

**`FANTASY_EMAIL` y `FANTASY_PASSWORD` no deberían subirse a Vercel.** El login
se hace una vez en local y lo que queda guardado en la base de datos es el
refresh token, cifrado. Vercel solo necesita poder refrescarlo.

### 3. Crons

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

### 4. Comprobar que funciona

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
