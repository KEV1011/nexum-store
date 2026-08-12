import DocumentoLegal from '../documento'

export const metadata = {
  title: 'Política de Privacidad · ZIPA',
  description: 'Cómo ZIPA recoge, usa y protege tus datos personales.',
}

export default function Page() {
  return <DocumentoLegal kind="privacy" />
}
