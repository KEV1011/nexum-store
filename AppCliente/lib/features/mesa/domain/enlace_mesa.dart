/// El QR de la mesa, leído: de qué local es, qué mesa y si es para llevar.
///
/// Lo usan las dos entradas a la mesa desde la app —el enlace que abre la app
/// al escanear con la cámara del teléfono, y el escáner de dentro de la app—,
/// así que las dos leen el QR igual.
///
/// SOLO SE ACEPTA NUESTRO DOMINIO. El escáner de la app lee cualquier QR que
/// le pongan delante, y un QR pegado encima del de la mesa podría llevar a una
/// página que se haga pasar por la carta. Un QR de otro dominio no se abre
/// como carta: se le dice al usuario que no es de ZIPA.
library;

class EnlaceMesa {
  const EnlaceMesa({required this.codigo, this.mesa, this.paraLlevar = false});

  /// El código PÚBLICO de la carta (nunca el enlace del dueño).
  final String codigo;

  /// La mesa, o null si no la trae (el comensal la elige).
  final String? mesa;

  /// El QR del mostrador: se pide para llevar.
  final bool paraLlevar;

  /// La ruta de la app para este enlace.
  String get ruta {
    final q = <String, String>{
      if (mesa != null) 'mesa': mesa!,
      if (paraLlevar) 'llevar': '1',
    };
    return Uri(path: '/carta/$codigo', queryParameters: q.isEmpty ? null : q)
        .toString();
  }
}

/// Los dominios del portal que imprimen los QR de las mesas.
///
/// El portal arma el QR con el dominio desde el que lo abre el dueño
/// (`window.location.origin`), y hoy se sirve en los dos: los QR ya pegados
/// en las mesas pueden llevar cualquiera. Tienen que coincidir con los hosts
/// del intent-filter del AndroidManifest (lo comprueba una prueba).
const kDominiosCarta = <String>{
  'nexum-store.vercel.app',
  'nexum-store.onrender.com',
};

final _codigo = RegExp(r'^[A-Za-z0-9]{4,32}$');

/// Lo que se puede leer de [texto] (lo que trae el QR o el enlace), o null si
/// no es el QR de una mesa de ZIPA.
///
/// Acepta la URL completa (`https://<portal>/carta/ABC?mesa=4`) y la ruta sola
/// (`/carta/ABC?mesa=4`), que es como llega a la app cuando la abre el enlace.
EnlaceMesa? leerEnlaceMesa(String texto, {Set<String> dominios = kDominiosCarta}) {
  final limpio = texto.trim();
  if (limpio.isEmpty || limpio.length > 300) return null;
  final uri = Uri.tryParse(limpio);
  if (uri == null) return null;

  if (uri.hasScheme) {
    if (uri.scheme != 'https') return null;
    if (!dominios.contains(uri.host.toLowerCase())) return null;
  } else if (!limpio.startsWith('/')) {
    return null;
  }

  final partes = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (partes.length != 2 || partes[0] != 'carta') return null;
  final codigo = partes[1];
  if (!_codigo.hasMatch(codigo)) return null;

  final mesa = uri.queryParameters['mesa']?.trim();
  return EnlaceMesa(
    codigo: codigo,
    mesa: mesa == null || mesa.isEmpty || mesa.length > 40 ? null : mesa,
    paraLlevar: uri.queryParameters['llevar'] == '1',
  );
}
