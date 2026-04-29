'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ShoppingCart, Menu, X, Search } from 'lucide-react'
import { useCart } from '@/context/CartContext'

const NAV_LINKS = [
  { label: 'Pet Tracking',  href: '/colecciones/pet-tracking' },
  { label: 'Auto Gear',     href: '/colecciones/auto-gear' },
  { label: 'EDC',           href: '/colecciones/edc' },
  { label: 'Nuevos',        href: '/productos?sort=new' },
]

export function Navbar() {
  const [scrolled,   setScrolled]   = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { itemCount, openCart }     = useCart()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <>
      <header
        className={`
          fixed top-0 inset-x-0 z-50 transition-all duration-300
          ${scrolled
            ? 'bg-obsidian/95 backdrop-blur-xl border-b border-white/5 shadow-nexum'
            : 'bg-transparent'}
        `}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-[6px] bg-gradient-gold flex items-center justify-center
                             shadow-nexum-gold group-hover:shadow-nexum transition-shadow duration-300">
                <span className="text-obsidian font-heading font-black text-sm">N</span>
              </div>
              <span className="font-heading font-bold text-xl text-ghost tracking-tight">NEXUM</span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-ghost-muted hover:text-ghost text-sm font-medium
                             transition-colors duration-200 relative group"
                >
                  {link.label}
                  <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-gold
                                   transition-all duration-300 group-hover:w-full" />
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                className="p-2 rounded-nexum text-ghost-muted hover:text-ghost hover:bg-white/5 transition-all"
                aria-label="Buscar"
              >
                <Search className="w-[18px] h-[18px]" />
              </button>

              {/* Cart — abre el drawer */}
              <button
                onClick={openCart}
                className="relative p-2 rounded-nexum text-ghost-muted hover:text-ghost hover:bg-white/5 transition-all"
                aria-label={`Carrito (${itemCount} items)`}
              >
                <ShoppingCart className="w-[18px] h-[18px]" />
                {itemCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold
                                   text-obsidian text-[9px] font-bold flex items-center justify-center">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
              </button>

              <button
                className="md:hidden p-2 rounded-nexum text-ghost-muted hover:text-ghost hover:bg-white/5 transition-all"
                onClick={() => setMobileOpen(v => !v)}
                aria-label="Menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-obsidian/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute top-16 inset-x-0 bg-obsidian-50 border-b border-white/5 animate-slide-up">
            <nav className="px-4 py-6 flex flex-col gap-1">
              {NAV_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-nexum
                             text-ghost-muted hover:text-ghost hover:bg-white/5
                             transition-all duration-200 text-base font-medium"
                >
                  <span className="w-1 h-1 rounded-full bg-gold" />
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
