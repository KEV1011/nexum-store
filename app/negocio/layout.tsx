// Portal de negocios — layout independiente sin Navbar, Footer ni CartProvider de la tienda

export const metadata = {
  title: {
    default: 'Portal de Negocios — Nexum',
    template: '%s | Portal Nexum',
  },
  description: 'Portal de seguimiento de pedidos en tiempo real para negocios aliados de Nexum.',
}

export default function NegocioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {children}
    </div>
  )
}
