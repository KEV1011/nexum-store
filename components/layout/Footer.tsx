import Link from 'next/link'
import { Instagram, Facebook, Twitter } from 'lucide-react'

const FOOTER_LINKS = {
  'Productos': [
    { label: 'Pet Tracking',  href: '/colecciones/pet-tracking' },
    { label: 'Auto Gear',     href: '/colecciones/auto-gear' },
    { label: 'EDC',           href: '/colecciones/edc' },
    { label: 'Nuevos',        href: '/productos?sort=new' },
    { label: 'Más vendidos',  href: '/productos?sort=bestselling' },
  ],
  'Soporte': [
    { label: 'FAQ',              href: '/faq' },
    { label: 'Envíos',           href: '/envios' },
    { label: 'Devoluciones',     href: '/devoluciones' },
    { label: 'Garantía',         href: '/garantia' },
    { label: 'Contacto',         href: '/contacto' },
  ],
  'Legal': [
    { label: 'Privacidad',       href: '/privacidad' },
    { label: 'Términos',         href: '/terminos' },
    { label: 'Cookies',          href: '/cookies' },
  ],
}

const SOCIAL = [
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Facebook,  href: '#', label: 'Facebook'  },
  { icon: Twitter,   href: '#', label: 'X / Twitter'},
]

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-obsidian-100 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        {/* Top */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pb-12 border-b border-white/5">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[6px] bg-gradient-gold flex items-center justify-center">
                <span className="text-obsidian font-heading font-black text-sm">N</span>
              </div>
              <span className="font-heading font-bold text-xl text-ghost tracking-tight">NEXUM</span>
            </div>
            <p className="text-ghost-subtle text-sm leading-relaxed max-w-[200px]">
              Tecnología de alto estatus para tu vida diaria.
            </p>
            <div className="flex items-center gap-2">
              {SOCIAL.map(({ icon: Icon, href, label }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  className="p-2 rounded-nexum bg-white/5 text-ghost-subtle
                             hover:bg-gold-glow hover:text-gold border border-white/5
                             hover:border-gold/30 transition-all duration-200"
                >
                  <Icon className="w-4 h-4" />
                </Link>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-heading font-semibold text-ghost text-sm mb-4 uppercase tracking-widest">
                {title}
              </h4>
              <ul className="space-y-2.5">
                {links.map(link => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-ghost-subtle hover:text-ghost text-sm transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-ghost-subtle text-sm">
            © {new Date().getFullYear()} Nexum. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-ghost-subtle text-xs">Pagos seguros con</span>
            <span className="badge-ghost text-[10px] font-mono">STRIPE</span>
            <span className="badge-ghost text-[10px] font-mono">SHOPIFY</span>
          </div>
        </div>

      </div>
    </footer>
  )
}
