import Link from 'next/link'

/**
 * Play exige una URL pública que explique cómo eliminar la cuenta y qué pasa
 * con los datos, alcanzable SIN instalar la app. El borrado en sí ya existe
 * dentro de las dos apps (Ajustes → Eliminar mi cuenta), pero un usuario que ya
 * la desinstaló no tiene forma de llegar ahí, y el revisor pide el enlace antes
 * de aprobar.
 *
 * Lo que se cuenta aquí tiene que coincidir con lo que hace
 * `account-deletion.service`: la cuenta se ANONIMIZA, no se borra en cascada,
 * porque los viajes liquidados sostienen la liquidación de las empresas, las
 * cuentas de cobro y los remitos firmados — no son solo datos del usuario.
 * Prometer un borrado total sería mentir en el sitio donde más caro cuesta.
 */

export const metadata = {
  title: 'Eliminar tu cuenta · ZIPA',
  description:
    'Cómo eliminar tu cuenta de ZIPA y qué ocurre con tus datos después.',
}

/**
 * Correo de soporte. NO tiene valor por defecto a propósito: un correo
 * inventado en la página que lee el revisor de Play rebota, y un canal de
 * contacto que no contesta es peor que no ofrecerlo. Si no está configurado, la
 * página solo ofrece el camino que sí funciona seguro (el soporte dentro de la
 * app). Defínelo en Vercel/Render como NEXT_PUBLIC_SUPPORT_EMAIL.
 */
const SOPORTE = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null

export default function Page() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="max-w-3xl mx-auto px-5 py-10 sm:py-14">
        <Link href="/" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
          ← ZIPA
        </Link>

        <h1 className="mt-6 text-2xl sm:text-3xl font-bold tracking-tight">
          Eliminar tu cuenta
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          Puedes eliminar tu cuenta de ZIPA cuando quieras, desde la propia app y
          sin pedírselo a nadie.
        </p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Desde la app</h2>
          <ol className="mt-3 space-y-2 text-[15px] leading-relaxed text-slate-700 list-decimal pl-5">
            <li>
              <strong>App del pasajero:</strong> Cuenta → <em>Eliminar mi cuenta</em>.
            </li>
            <li>
              <strong>App del conductor:</strong> Ajustes → <em>Eliminar mi cuenta</em>.
            </li>
            <li>Confirma. La eliminación es inmediata y no se puede deshacer.</li>
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Si ya desinstalaste la app</h2>
          {SOPORTE ? (
            <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
              Escríbenos a{' '}
              <a href={`mailto:${SOPORTE}`} className="text-emerald-700 font-semibold">
                {SOPORTE}
              </a>{' '}
              indicando el número de celular con el que te registraste. Verificamos que
              la cuenta es tuya y la eliminamos dentro de los 30 días siguientes.
            </p>
          ) : (
            <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
              Vuelve a instalar la app, entra con tu número y elimina la cuenta desde
              Ajustes. También puedes escribirnos por el correo de contacto que aparece
              en nuestra ficha de Google Play, indicando el número con el que te
              registraste.
            </p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Qué se elimina y qué se conserva</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
            Se elimina tu <strong>información personal</strong>: nombre, teléfono,
            correo, foto de perfil, direcciones guardadas, documentos subidos y el
            historial de conversaciones. Tu cuenta deja de existir y no puedes volver a
            entrar con ella.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
            Se conservan, ya <strong>sin tu identidad asociada</strong>, los registros
            de los servicios completados y sus importes. No es una excepción cómoda:
            esos registros sostienen la liquidación de las empresas de transporte con
            las que viajaste, sus cuentas de cobro y los remitos firmados, y la ley
            colombiana exige guardar los soportes contables. Son datos que dejaron de
            ser solo tuyos en el momento en que hubo un cobro de por medio.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
            Si tienes un servicio en curso o un pago pendiente, la app te lo dirá y
            tendrás que cerrarlo antes de poder eliminar la cuenta.
          </p>
        </section>

        <hr className="my-10 border-slate-200" />
        <p className="text-xs text-slate-400">
          <Link href="/legal/privacidad" className="text-emerald-700 font-semibold">
            Política de Privacidad
          </Link>{' '}
          ·{' '}
          <Link href="/legal/terminos" className="text-emerald-700 font-semibold">
            Términos y Condiciones
          </Link>
        </p>
      </div>
    </main>
  )
}
