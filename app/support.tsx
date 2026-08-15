import { ApoyoIcon } from "./icons";
import { DONATE_URL, SPONSOR, SPONSOR_CONTACT } from "./support-config";

/**
 * El pie de la publicación.
 *
 * La app es gratis, sin cuenta y sin rastreo, y se mantiene con
 * donaciones. Eso hay que decirlo en algún sitio, y el sitio natural en
 * una página compuesta como un periódico es el **colofón**: al final,
 * fuera del contenido, con la nota de quién la paga y el anuncio de
 * texto al lado, como los reclamos de la contraportada.
 *
 * Está en el layout, así que sale en todas las pantallas, pero nunca
 * dentro de una decisión: ni un anuncio se cuela entre una puja y su
 * motivo. El dinero paga la app; no se mete en lo que la app recomienda.
 */
export function SupportBand() {
  return (
    <footer
      className="mt-16 border-t-2"
      style={{ borderColor: "var(--color-rule)" }}
    >
      <div className="mx-auto max-w-[1180px] px-4 lg:px-8">
        <div className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
          <div>
            <p className="eyebrow">Colofón</p>
            <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-muted">
              <strong className="font-semibold text-ink">
                Fantasy Advisor es gratis
              </strong>
              , sin cuenta y sin rastreo, y va a seguir siéndolo. Lo que cuesta
              es el servidor y las horas: si te ahorra un clausulazo al año, ya
              se ha pagado solo.
            </p>

            {DONATE_URL && (
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="press mt-4 inline-flex items-center gap-2 border px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] no-underline"
                style={{
                  background: "var(--color-brand)",
                  borderColor: "var(--color-brand)",
                  color: "var(--color-on-brand)",
                }}
              >
                <ApoyoIcon size={14} />
                Invitar a un café
              </a>
            )}
          </div>

          <SponsorSlot />
        </div>

        <div
          className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t py-3.5"
          style={{ borderColor: "var(--color-line)" }}
        >
          <p className="eyebrow">El motor calcula, la IA explica</p>
          <p className="eyebrow">Sin cuentas · sin cookies · sin rastreo</p>
        </div>
      </div>
    </footer>
  );
}

/**
 * El anuncio: un recuadro de clasificados.
 *
 * Cuando hay patrocinador se enseña su nombre y su reclamo, **en texto**.
 * Nunca un script de terceros ni una imagen remota: la app no carga nada
 * que pueda rastrear a quien la usa, y no va a empezar por aquí.
 *
 * Cuando no lo hay, el hueco no se cierra: se queda reservado y ofrecido,
 * que es como se ve un espacio libre en una página impresa.
 */
function SponsorSlot() {
  if (SPONSOR) {
    const contenido = (
      <>
        <p className="eyebrow">Espacio patrocinado</p>
        <p className="slug mt-2.5 text-ink">{SPONSOR.name}</p>
        {SPONSOR.claim && (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            {SPONSOR.claim}
          </p>
        )}
        {SPONSOR.url && (
          <span className="eyebrow mt-3 inline-flex items-center gap-1.5">
            Visitar
            <span aria-hidden className="row-arrow">
              →
            </span>
          </span>
        )}
      </>
    );

    if (!SPONSOR.url) {
      return (
        <div
          className="border p-4"
          style={{ borderColor: "var(--color-line-strong)" }}
        >
          {contenido}
        </div>
      );
    }

    return (
      <a
        href={SPONSOR.url}
        target="_blank"
        rel="noreferrer noopener sponsored"
        className="row-link block border p-4 no-underline"
        style={{ borderColor: "var(--color-line-strong)" }}
      >
        {contenido}
      </a>
    );
  }

  return (
    <div
      className="border border-dashed p-4"
      style={{ borderColor: "var(--color-line-strong)" }}
    >
      <p className="eyebrow">Espacio publicitario</p>
      <p className="slug mt-2.5 text-ink">Tu marca aquí</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
        Un anuncio de texto, sin scripts de terceros y sin rastrear a nadie.
        Solo un nombre, una frase y un enlace.
      </p>
      {SPONSOR_CONTACT && (
        <a
          href={SPONSOR_CONTACT}
          className="row-link -mx-1 mt-3 inline-flex items-center gap-1.5 px-1 no-underline"
        >
          <span className="eyebrow">Escríbeme</span>
          <span aria-hidden className="row-arrow font-mono text-[11px] text-faint">
            →
          </span>
        </a>
      )}
    </div>
  );
}
