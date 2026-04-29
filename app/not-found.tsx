import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-20 h-20 mx-auto rounded-nexum-xl bg-gold-glow border border-gold/20 flex items-center justify-center">
          <Zap className="w-9 h-9 text-gold" />
        </div>
        <div>
          <h1 className="font-heading font-black text-6xl text-gold">404</h1>
          <p className="font-heading font-bold text-ghost text-xl mt-2">Página no encontrada</p>
          <p className="text-ghost-muted text-sm mt-2">
            La página que buscas no existe o fue movida.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/" className="btn-primary px-6 py-3">
            <ArrowLeft className="w-4 h-4" />
            Ir al inicio
          </Link>
          <Link href="/productos" className="btn-ghost px-6 py-3">
            Ver productos
          </Link>
        </div>
      </div>
    </div>
  )
}
