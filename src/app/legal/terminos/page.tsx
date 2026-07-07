import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones | SARA",
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

export default function TerminosPage() {
  return (
    <article>
      <h1 className="font-display text-2xl font-bold text-slate-900 mb-1">
        Términos y Condiciones de Uso
      </h1>
      <p className="text-xs text-slate-400 mb-6">
        Versión {VERSION} — vigente desde el {VIGENCIA}
      </p>

      <P>
        Estos Términos y Condiciones ("Términos") constituyen un contrato vinculante entre
        usted ("el Usuario") y <strong>Marquez Project Solutions LLC</strong>, empresa
        constituida en el Estado de California, Estados Unidos ("la Empresa", "nosotros"),
        propietaria y operadora del sistema SARA / FacturaNIC ("SARA" o "el Servicio"). Al
        crear una cuenta o usar SARA de cualquier forma, usted declara haber leído, entendido
        y aceptado estos Términos y nuestra{" "}
        <a href="/legal/privacidad" className="text-brand-700 underline">
          Política de Privacidad
        </a>
        . Si no está de acuerdo, no debe registrarse ni usar el Servicio.
      </P>

      <H2>1. Descripción del Servicio</H2>
      <P>
        SARA es una herramienta de software como servicio (SaaS) que ayuda a negocios
        nicaragüenses a organizar su facturación, compras, inventario, nómina y registros
        contables, y a generar reportes de apoyo relacionados con la normativa de la
        Dirección General de Ingresos (DGI) de Nicaragua. SARA es una herramienta de
        productividad de uso interno del Usuario; no presenta declaraciones, no realiza
        trámites ni transmite información en nombre del Usuario ante la DGI, la Alcaldía,
        el INSS ni ninguna otra autoridad. Toda presentación, declaración o trámite ante
        cualquier autoridad es responsabilidad exclusiva del Usuario.
      </P>

      <H2>2. Registro de Cuenta</H2>
      <P>
        Para usar SARA debe crear una cuenta proporcionando información veraz, completa y
        actualizada (incluyendo, según el tipo de contribuyente, nombre o razón social,
        cédula, RUC y datos de contacto). Usted es responsable de mantener la
        confidencialidad de su contraseña y de toda actividad realizada bajo su cuenta.
        Debe notificarnos de inmediato cualquier uso no autorizado de su cuenta. No está
        permitido registrar cuentas con información falsa o suplantando a un tercero.
      </P>

      <H2>3. Uso Permitido y Conductas Prohibidas</H2>
      <P>Usted se compromete a no usar SARA para:</P>
      <Ul>
        <li>Ingresar, almacenar o transmitir información falsa con el fin de evadir o defraudar al fisco o a terceros.</li>
        <li>Intentar vulnerar la seguridad del Servicio, acceder a datos de otros usuarios o realizar ingeniería inversa del software.</li>
        <li>Usar el Servicio para actividades ilícitas, lavado de dinero, financiamiento del terrorismo o cualquier fin contrario a la ley nicaragüense o estadounidense.</li>
        <li>Sobrecargar, interrumpir o interferir con la infraestructura del Servicio (incluyendo ataques de denegación de servicio o scraping automatizado no autorizado).</li>
        <li>Revender, sublicenciar o explotar comercialmente el Servicio sin autorización escrita de la Empresa.</li>
      </Ul>
      <P>
        La Empresa se reserva el derecho de suspender o cancelar, sin previo aviso, cualquier
        cuenta que incumpla esta sección.
      </P>

      <H2>4. Descargo de Responsabilidad Fiscal, Contable y Legal</H2>
      <P>
        SARA calcula valores referenciales de IVA, retenciones, ISC y otros conceptos
        tributarios <strong>con base en parámetros configurados o ingresados por el propio
        Usuario</strong>. SARA no constituye asesoría contable, fiscal, laboral ni legal, y
        no sustituye el criterio de un contador público autorizado (CPA) ni de un abogado.
        La Empresa no garantiza que los cálculos, reportes o formatos generados por SARA
        sean exactos, estén actualizados conforme a reformas normativas recientes, o sean
        suficientes para cumplir con las obligaciones fiscales, laborales o mercantiles del
        Usuario ante la DGI, el INSS, la Alcaldía o cualquier otra entidad. Es
        responsabilidad exclusiva del Usuario:
      </P>
      <Ul>
        <li>Verificar la exactitud de cada factura, retención, planilla y reporte antes de usarlo o presentarlo ante una autoridad o tercero.</li>
        <li>Mantenerse informado sobre cambios en la legislación tributaria y laboral aplicable.</li>
        <li>Contar con asesoría profesional independiente cuando lo considere necesario.</li>
      </Ul>
      <P>
        La Empresa no será responsable por multas, recargos, intereses moratorios,
        sanciones, auditorías, pérdidas económicas ni ningún otro perjuicio derivado de
        errores, omisiones o del uso que el Usuario haga de la información generada por
        SARA.
      </P>

      <H2>5. Datos de Terceros Ingresados por el Usuario</H2>
      <P>
        Si el Usuario ingresa en SARA datos personales de sus propios clientes, proveedores,
        empleados o representantes (por ejemplo, nombre, cédula o RUC), el Usuario actúa
        como responsable de ese tratamiento frente a dichos terceros, y garantiza contar con
        la base legal y, cuando corresponda, el consentimiento necesario para ingresar esa
        información en el Servicio. La Empresa actúa únicamente como proveedor de
        infraestructura tecnológica respecto de esos datos y no asume responsabilidad frente
        a terceros por la forma en que el Usuario recopila o utiliza su información.
      </P>

      <H2>6. Planes, Precios y Disponibilidad</H2>
      <P>
        Actualmente SARA se ofrece de forma gratuita. La Empresa se reserva el derecho de
        introducir en el futuro planes de pago, límites de uso o funciones exclusivas para
        cuentas pagas, notificando a los Usuarios con al menos 15 días de anticipación antes
        de que dichos cambios afecten una cuenta existente. El Servicio se ofrece "tal cual"
        y "según disponibilidad"; la Empresa no garantiza operación ininterrumpida y puede
        realizar mantenimientos, actualizaciones o suspensiones temporales.
      </P>

      <H2>7. Propiedad Intelectual</H2>
      <P>
        El software, diseño, marca "SARA" y demás elementos del Servicio son propiedad de la
        Empresa o de sus licenciantes y están protegidos por leyes de propiedad intelectual.
        El Usuario conserva la titularidad de los datos e información de su negocio que
        ingresa en SARA. El Usuario otorga a la Empresa una licencia limitada para almacenar,
        procesar y mostrar esa información con el único fin de operar y mantener el
        Servicio.
      </P>

      <H2>8. Suspensión y Terminación</H2>
      <P>
        El Usuario puede dejar de usar el Servicio en cualquier momento. La Empresa puede
        suspender o cancelar una cuenta, con o sin previo aviso, en caso de incumplimiento
        de estos Términos, riesgo de seguridad, requerimiento legal, o por descontinuación
        del Servicio. Tras la terminación, la Empresa podrá conservar los datos durante un
        período razonable conforme a la Política de Privacidad antes de eliminarlos.
      </P>

      <H2>9. Exclusión de Garantías</H2>
      <P>
        EN LA MEDIDA MÁXIMA PERMITIDA POR LA LEY APLICABLE, EL SERVICIO SE PROPORCIONA "TAL
        CUAL" Y "SEGÚN DISPONIBILIDAD", SIN GARANTÍAS DE NINGÚN TIPO, YA SEAN EXPRESAS,
        IMPLÍCITAS O LEGALES, INCLUYENDO, SIN LIMITACIÓN, GARANTÍAS IMPLÍCITAS DE
        COMERCIABILIDAD, IDONEIDAD PARA UN FIN PARTICULAR, EXACTITUD DE LOS DATOS O NO
        INFRACCIÓN.
      </P>

      <H2>10. Limitación de Responsabilidad</H2>
      <P>
        EN LA MEDIDA MÁXIMA PERMITIDA POR LA LEY, LA EMPRESA, SUS FUNDADORES, EMPLEADOS Y
        COLABORADORES NO SERÁN RESPONSABLES POR DAÑOS INDIRECTOS, INCIDENTALES, ESPECIALES,
        CONSECUENCIALES, PUNITIVOS O POR LUCRO CESANTE, PÉRDIDA DE DATOS, PÉRDIDA DE
        INGRESOS O SANCIONES FISCALES, DERIVADOS DEL USO O LA IMPOSIBILIDAD DE USAR EL
        SERVICIO, AUN CUANDO SE HAYA ADVERTIDO DE LA POSIBILIDAD DE TALES DAÑOS. LA
        RESPONSABILIDAD TOTAL Y ACUMULADA DE LA EMPRESA FRENTE AL USUARIO POR CUALQUIER
        RECLAMO RELACIONADO CON EL SERVICIO NO EXCEDERÁ EL MONTO PAGADO POR EL USUARIO A LA
        EMPRESA POR EL SERVICIO EN LOS DOCE (12) MESES ANTERIORES AL RECLAMO, O CIEN DÓLARES
        (US$100), LO QUE SEA MENOR. DADO QUE EL SERVICIO ES ACTUALMENTE GRATUITO, EL USUARIO
        RECONOCE QUE DICHO MONTO PUEDE SER CERO.
      </P>

      <H2>11. Indemnización</H2>
      <P>
        El Usuario se compromete a indemnizar y mantener indemne a la Empresa, sus
        fundadores y colaboradores frente a cualquier reclamo, demanda, pérdida o gasto
        (incluyendo honorarios legales razonables) que surja de: (a) el uso que el Usuario
        haga del Servicio; (b) la exactitud de la información fiscal, contable o laboral
        ingresada o presentada por el Usuario ante terceros o autoridades; (c) el
        incumplimiento de estos Términos; o (d) la vulneración de derechos de terceros
        (incluyendo sus propios clientes, proveedores o empleados) por parte del Usuario.
      </P>

      <H2>12. Modificaciones a estos Términos</H2>
      <P>
        La Empresa puede actualizar estos Términos en cualquier momento. Los cambios
        materiales se notificarán mediante el Servicio o al correo registrado, con
        indicación de la nueva fecha de vigencia. El uso continuado del Servicio después de
        la notificación constituye aceptación de los Términos actualizados.
      </P>

      <H2>13. Ley Aplicable y Resolución de Disputas</H2>
      <P>
        Estos Términos se rigen por las leyes del Estado de California, Estados Unidos, sin
        perjuicio de sus normas de conflicto de leyes. Cualquier disputa que no pueda
        resolverse de manera amistosa dentro de los 30 días siguientes a su notificación
        escrita se someterá a la jurisdicción exclusiva de los tribunales estatales o
        federales competentes ubicados en California, Estados Unidos, y ambas partes
        renuncian a cualquier reclamo colectivo o de clase en la medida permitida por la
        ley.
      </P>

      <H2>14. Divisibilidad y Acuerdo Íntegro</H2>
      <P>
        Si alguna disposición de estos Términos fuera declarada inválida o inaplicable, el
        resto permanecerá en pleno vigor. Estos Términos, junto con la Política de
        Privacidad, constituyen el acuerdo íntegro entre el Usuario y la Empresa respecto
        del Servicio.
      </P>

      <H2>15. Contacto</H2>
      <P>
        Para consultas sobre estos Términos, escríbanos a{" "}
        <a href="mailto:deybi@marquezprojectsolutions.com" className="text-brand-700 underline">
          deybi@marquezprojectsolutions.com
        </a>
        .
      </P>
    </article>
  );
}
