import { appleAppSiteAssociation } from '../../enlaces-app'

/** iPhone lo pide sin extensión y lo quiere como JSON. */
export function GET() {
  return Response.json(appleAppSiteAssociation(process.env['APPLE_TEAM_ID']), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
