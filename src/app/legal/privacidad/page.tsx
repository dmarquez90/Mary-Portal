import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad | Siconic",
};

const VERSION = "1.0";
const VIGENCIA = "7 de julio de 2026";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-slate-900 mt-8 mb-3">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-600 leading-relaxed mb-3">{children}</p>;
}
function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 text-sm text-slate-600 leading-relaxed mb-3 space-y-1">{children}</ul>;
}

export default function PrivacidadPage() {
  return (
    <article>
      <h1 className="font-display text-2xl font-bold text-slate-900 mb-1">
        Política de Privacidad
      </h1>
      <p className="text-xs text-slate-400 mb-6">
        Versión {VERSION} — vigente desde el {VIGENCIA}
      </p>

      <P>
        <strong>Marquez Project Solutions LLC</strong> (California, Estados Unidos), operadora
        de Siconic / FacturaNIC ("Siconic", "el Servicio", "nosotros"), respeta la privacidad de
        sus Usuarios. Esta Política describe qué datos personales recopilamos, para qué los
        usamos, con quién los compartimos y qué derechos tiene usted sobre ellos, en
        cumplimiento de buenas prácticas internacionales de protección de datos y, en lo
        aplicable, de la Ley N.º 787, Ley de Protección de Datos Personales de la República
        de Nicaragua.
      </P>

      <H2>1. Datos que Recopilamos</H2>
      <P>Recopilamos las siguientes categorías de información:</P>
      <Ul>
        <li>
          <strong>Datos de la cuenta:</strong> nombre o razón social, tipo de contribuyente,
          número de cédula, número RUC, dirección, ciudad, departamento, teléfono, correo
          electrónico, sitio web y, para personas jurídicas, los datos del representante
          legal.
        </li>
        <li>
          <strong>Datos de negocio ingresados por el Usuario:</strong> facturas, clientes,
          proveedores, productos e inventario, movimientos de caja y banco, nómina y
          cualquier otra información contable que el Usuario registre voluntariamente en
          Siconic.
        </li>
        <li>
          <strong>Datos técnicos:</strong> dirección IP, tipo de navegador, identificadores
          de sesión y registros de actividad (logs), recopilados automáticamente para
          seguridad y funcionamiento del Servicio.
        </li>
        <li>
          <strong>Credenciales de acceso:</strong> su contraseña se almacena de forma
          cifrada mediante el proveedor de autenticación (Supabase Auth); la Empresa nunca
          tiene acceso a su contraseña en texto plano.
        </li>
      </Ul>

      <H2>2. Finalidad del Tratamiento</H2>
      <P>Usamos sus datos para:</P>
      <Ul>
        <li>Crear y administrar su cuenta y brindarle acceso al Servicio.</li>
        <li>Operar las funciones de facturación, compras, inventario, nómina y reportes.</li>
        <li>Enviar comunicaciones operativas (confirmaciones, alertas de seguridad, cambios en los Términos).</li>
        <li>Prevenir fraude, abuso o accesos no autorizados.</li>
        <li>Cumplir con obligaciones legales aplicables a la Empresa.</li>
        <li>Mejorar el Servicio mediante análisis agregado y anonimizado de uso.</li>
      </Ul>
      <P>
        No usamos sus datos de negocio (facturas, clientes, inventario, nómina) para
        entrenar modelos de terceros ni los vendemos a anunciantes.
      </P>

      <H2>3. Base Legal del Tratamiento</H2>
      <P>
        Tratamos sus datos con base en su consentimiento (otorgado al crear la cuenta y
        aceptar esta Política), la ejecución del contrato de servicio descrito en los
        Términos y Condiciones, y el interés legítimo de la Empresa en mantener la seguridad
        y el correcto funcionamiento de Siconic.
      </P>

      <H2>4. Con Quién Compartimos los Datos</H2>
      <P>
        No vendemos ni alquilamos sus datos personales. Podemos compartir información
        únicamente con:
      </P>
      <Ul>
        <li>
          <strong>Proveedores de infraestructura:</strong> utilizamos Supabase (base de
          datos PostgreSQL, autenticación y almacenamiento) y Vercel (hospedaje de la
          aplicación) como subencargados de tratamiento, bajo sus propios compromisos de
          seguridad y confidencialidad.
        </li>
        <li>
          <strong>Autoridades competentes:</strong> cuando sea requerido por ley, orden
          judicial o para proteger los derechos, la seguridad o la propiedad de la Empresa o
          de terceros.
        </li>
        <li>
          <strong>Sucesores del negocio:</strong> en caso de fusión, adquisición o venta de
          activos, notificando previamente a los Usuarios afectados.
        </li>
      </Ul>

      <H2>5. Transferencia Internacional de Datos</H2>
      <P>
        Sus datos son almacenados y procesados en servidores de nuestros proveedores de
        infraestructura, que pueden estar ubicados fuera de Nicaragua, incluyendo Estados
        Unidos u otros países. Al usar Siconic, usted consiente esta transferencia
        internacional, la cual se realiza bajo los estándares de seguridad contractual de
        dichos proveedores.
      </P>

      <H2>6. Seguridad de la Información</H2>
      <P>
        Aplicamos medidas técnicas razonables para proteger sus datos, incluyendo cifrado en
        tránsito (HTTPS/TLS), autenticación gestionada por Supabase Auth, y Row Level
        Security (RLS) en la base de datos, que garantiza que cada empresa solo puede
        acceder a su propia información. Ningún sistema es 100% seguro; en caso de una
        vulneración de seguridad que afecte sus datos personales, se lo notificaremos según
        lo exija la ley aplicable.
      </P>

      <H2>7. Conservación de Datos</H2>
      <P>
        Conservamos sus datos mientras su cuenta permanezca activa. Si solicita la
        eliminación de su cuenta, eliminaremos o anonimizaremos sus datos personales dentro
        de un plazo razonable, salvo que debamos conservar cierta información por
        obligaciones legales, contables o de seguridad.
      </P>

      <H2>8. Sus Derechos</H2>
      <P>
        Usted puede ejercer en cualquier momento sus derechos de acceso, rectificación,
        cancelación y oposición (derechos ARCO) sobre sus datos personales, así como
        solicitar una copia de su información o la eliminación de su cuenta, escribiendo a{" "}
        <a href="mailto:deybi@marquezprojectsolutions.com" className="text-brand-700 underline">
          deybi@marquezprojectsolutions.com
        </a>
        . Responderemos su solicitud dentro de un plazo razonable, previa verificación de su
        identidad.
      </P>

      <H2>9. Datos de Terceros Ingresados por el Usuario</H2>
      <P>
        Cuando el Usuario registra en Siconic información de sus propios clientes,
        proveedores, empleados o representantes, el Usuario es el responsable de ese
        tratamiento frente a esos terceros y debe garantizar que cuenta con la base legal
        necesaria para ello. La Empresa actúa solo como encargado del tratamiento
        (proveedor tecnológico) respecto de esos datos, conforme a los Términos y
        Condiciones.
      </P>

      <H2>10. Cookies y Tecnologías Similares</H2>
      <P>
        Utilizamos cookies y almacenamiento local estrictamente necesarios para mantener su
        sesión iniciada y garantizar el funcionamiento del Servicio. No utilizamos cookies
        de publicidad de terceros.
      </P>

      <H2>11. Menores de Edad</H2>
      <P>
        Siconic está dirigido a personas mayores de edad que actúan en representación de un
        negocio o actividad económica. No recopilamos intencionalmente datos de menores de
        edad.
      </P>

      <H2>12. Cambios a esta Política</H2>
      <P>
        Podemos actualizar esta Política de tiempo en tiempo. Los cambios materiales se
        notificarán mediante el Servicio o al correo registrado, indicando la nueva fecha de
        vigencia.
      </P>

      <H2>13. Contacto</H2>
      <P>
        Para consultas sobre esta Política o para ejercer sus derechos sobre datos
        personales, escríbanos a{" "}
        <a href="mailto:deybi@marquezprojectsolutions.com" className="text-brand-700 underline">
          deybi@marquezprojectsolutions.com
        </a>
        .
      </P>
    </article>
  );
}
