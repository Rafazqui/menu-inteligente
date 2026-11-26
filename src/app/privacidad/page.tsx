import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseSettings } from "@/lib/types";
import { Dato, LegalPage, publicRestaurant } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Aviso de privacidad" };
export const dynamic = "force-dynamic";

export default async function PrivacidadPage() {
  const data = await publicRestaurant();
  if (!data) notFound();
  const { restaurant: r, fromTable } = data;
  const { legal, sessionMaxHours } = parseSettings(r.settings);

  return (
    <LegalPage title="Aviso de privacidad" updated="26 de noviembre de 2026" backHref={fromTable ? "/mesa" : "/"} logoUrl={r.logo_url}>
      <section>
        <h2>1. Quién es responsable de tus datos</h2>
        <p>
          <Dato value={legal.owner} label="Responsable" />, con domicilio en <Dato value={legal.address} label="Domicilio" />,
          operador de <b>{r.name}</b>, es responsable del tratamiento de los datos que se generan al usar la app de la
          mesa. Contacto: <Dato value={legal.email} label="Correo de contacto" />.
        </p>
      </section>

      <section>
        <h2>2. Qué datos tratamos</h2>
        <p>
          <b>La app no te pide nombre, teléfono, correo ni ningún dato para identificarte.</b> Al usarla se registra
          únicamente:
        </p>
        <ul>
          <li>El número y área de tu mesa, y la hora en que se activó y se cerró.</li>
          <li>Lo que solicitas al personal: llamadas, los mensajes que escribes al mesero y los juegos de mesa que pides.</li>
          <li>El resultado del juego de premio y, si ganas, el código y el premio.</li>
          <li>Qué secciones abres (menú, ludoteca) y si abres el enlace para dejar una reseña.</li>
          <li>
            Datos técnicos: una cookie de sesión de mesa (un identificador cifrado que dura como máximo 12 horas) y tu
            dirección IP, que se usa solo momentáneamente para evitar abusos y no se guarda en nuestra base de datos.
          </li>
        </ul>
        <p>
          Te pedimos <b>no escribir datos personales</b> en los mensajes al mesero (por ejemplo, tu teléfono).
        </p>
        <p>
          Del personal del Negocio se guarda su nombre, su usuario, su contraseña cifrada y las acciones que realiza en
          el panel.
        </p>
      </section>

      <section>
        <h2>3. Para qué los usamos</h2>
        <ul>
          <li>Atender tu mesa: avisar al personal, mostrarte el menú y la ludoteca, y operar el juego de premio.</li>
          <li>Prevenir abusos, por ejemplo llamadas repetidas o el uso del código QR fuera del local.</li>
          <li>Generar estadísticas generales del Negocio (por ejemplo, horas con más movimiento), sin identificar personas.</li>
        </ul>
        <p>No usamos tus datos para publicidad ni los vendemos.</p>
      </section>

      <section>
        <h2>4. Con quién se comparten</h2>
        <p>
          Los datos se almacenan con proveedores de servicios en la nube (alojamiento de la app y base de datos) que los
          procesan únicamente por cuenta del Negocio. Si decides abrir el enlace para dejar una reseña, saldrás de la app
          hacia Google y aplicarán sus propias políticas de privacidad.
        </p>
      </section>

      <section>
        <h2>5. Cookies y almacenamiento en tu dispositivo</h2>
        <p>
          Solo usamos cookies necesarias para que la app funcione: la sesión de tu mesa y, para el personal, la sesión
          del panel. No usamos cookies de publicidad ni de rastreo de terceros. Los minijuegos guardan tu récord solo en
          tu propio dispositivo.
        </p>
      </section>

      <section>
        <h2>6. Cuánto tiempo se conservan</h2>
        <p>
          Tu sesión de mesa termina cuando el personal cierra la mesa o, como máximo, a las {sessionMaxHours} horas. El
          registro de la visita se conserva mientras sea útil para la operación y las estadísticas del Negocio, y puedes
          pedir su eliminación con los datos de contacto de este aviso.
        </p>
      </section>

      <section>
        <h2>7. Tus derechos</h2>
        <p>
          Puedes solicitar el acceso, rectificación, cancelación u oposición al tratamiento de tus datos (derechos ARCO),
          así como revocar tu consentimiento, escribiendo a <Dato value={legal.email} label="Correo de contacto" />. Te
          responderemos en los plazos que establece la legislación mexicana aplicable en materia de protección de datos
          personales.
        </p>
      </section>

      <section>
        <h2>8. Cambios a este aviso</h2>
        <p>Cualquier cambio se publicará en esta misma página, indicando la fecha de la última actualización.</p>
      </section>
    </LegalPage>
  );
}
