import DocumentoLegal from '../documento'

export const metadata = {
  title: 'Términos y Condiciones · ZIPA',
  description: 'Condiciones de uso de la plataforma ZIPA.',
}

export default function Page() {
  return <DocumentoLegal kind="terms" />
}
