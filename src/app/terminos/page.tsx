import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { availablePrizes, enabledGames } from "@/lib/repo";
import { parseSettings, type RewardGame } from "@/lib/types";
import { Dato, LegalPage, publicRestaurant } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Términos de la promoción" };
export const dynamic = "force-dynamic";

const GAME_NAMES: Record<RewardGame, string> = { ruleta: "Ruleta", rasca: "Rasca y gana", gato: "Gato contra la máquina" };

export default async function TerminosPage() {
  const data = await publicRestaurant();
  if (!data) notFound();
  const { restaurant: r, fromTable } = data;
  const settings = parseSettings(r.settings);
  const { legal } = settings;
  const games = enabledGames(settings);
  const prizes = await availablePrizes(r.id);

  return (
    <LegalPage
      title="Términos de la promoción “Premio de la mesa”"
      updated="26 de noviembre de 2026"
      backHref={fromTable ? "/mesa/premio" : "/"}
      logoUrl={r.logo_url}
    >
      <section>
        <h2>1. Organizador</h2>
        <p>
          La promoción la organiza <Dato value={legal.owner} label="Responsable" />, con domicilio en{" "}
          <Dato value={legal.address} label="Domicilio" />, operador de <b>{r.name}</b> (en adelante, “el Negocio”).
        </p>
      </section>

      <section>
        <h2>2. Vigencia</h2>
        <p>
          La promoción está vigente mientras aparezca disponible en la app de la mesa. El Negocio puede modificarla,
          suspenderla o terminarla en cualquier momento; los cambios se publican en esta página y no afectan los premios
          ya ganados.
        </p>
      </section>

      <section>
        <h2>3. Quién puede participar</h2>
        <p>
          Pueden participar los clientes que se encuentren en el local y cuya mesa haya sido activada por el personal.
          La participación no tiene costo adicional dentro de la app.
        </p>
      </section>

      <section>
        <h2>4. Mecánica</h2>
        <ul>
          <li>Cada mesa tiene <b>un intento por visita</b>, compartido por todas las personas de la mesa.</li>
          <li>
            Se elige uno de los juegos disponibles:{" "}
            {games.length ? games.map((g) => GAME_NAMES[g]).join(", ") : "ninguno por el momento"}.
          </li>
          <li>
            El resultado lo determina el sistema del Negocio de forma aleatoria en el momento de jugar; las animaciones
            solo muestran ese resultado.
          </li>
          {games.includes("gato") && (
            <li>
              En el gato, la máquina juega para no perder. En algunas partidas, elegidas al azar, comete un error que
              permite ganarle; aun así, el cliente debe completar su línea para obtener el premio.
            </li>
          )}
          <li>El personal puede, a su criterio, otorgar un intento adicional a una mesa.</li>
        </ul>
      </section>

      {games.length > 0 && (
        <section>
          <h2>5. Probabilidad aproximada de obtener premio</h2>
          <ul>
            {games.map((g) => (
              <li key={g}>
                {GAME_NAMES[g]}: {settings.games[g].winChance}%
                {g === "gato" ? " de partidas en las que la máquina se equivoca" : ""}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Son probabilidades por partida; con pocas partidas el resultado real puede variar. Si se agotan los premios,
            la promoción se pausa hasta que se repongan.
          </p>
        </section>
      )}

      <section>
        <h2>6. Premios</h2>
        {prizes.length ? (
          <ul>
            {prizes.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.stock !== null ? " (existencias limitadas)" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>Por el momento no hay premios disponibles.</p>
        )}
        <ul>
          <li>Al ganar, la app muestra un <b>código de 6 caracteres</b> y avisa al personal.</li>
          <li>El premio se entrega durante la <b>misma visita</b> y en la misma mesa, mostrando el código al personal.</li>
          <li>
            Los premios están sujetos a disponibilidad, no son canjeables por dinero ni transferibles, y no se acumulan
            con otras promociones, salvo que el Negocio indique lo contrario.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. Uso indebido</h2>
        <p>
          El Negocio puede anular un premio si detecta un uso indebido de la app, por ejemplo intentar manipular el
          resultado, participar sin estar en el local o reutilizar un código.
        </p>
      </section>

      <section>
        <h2>8. Reseñas en Google</h2>
        <p>
          Dejar una reseña en Google es <b>totalmente voluntario y no tiene ninguna relación con esta promoción</b>: no
          se otorga ningún premio ni beneficio por dejar una reseña, ni por su contenido.
        </p>
      </section>

      <section>
        <h2>9. Dudas y aclaraciones</h2>
        <p>
          Escríbenos a <Dato value={legal.email} label="Correo de contacto" /> o pregunta al personal del Negocio. Como
          consumidor, también puedes acudir a la Procuraduría Federal del Consumidor (PROFECO).
        </p>
      </section>
    </LegalPage>
  );
}
