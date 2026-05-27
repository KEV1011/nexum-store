/// Constantes geográficas para la ciudad piloto: Pamplona, Norte de Santander.
/// Coordenadas centrales: 7.3754° N, -72.6486° W
/// Altitud: ~2.300 msnm | Población: ~75.000 habitantes
abstract final class MapConstants {
  // Centro de la ciudad: Parque Águeda Gallardo (Parque Principal)
  static const double pamplonaCenterLat = 7.3754;
  static const double pamplonaCenterLng = -72.6486;

  // Zoom inicial apropiado para ciudad compacta (~75k hab)
  static const double initialZoom = 15.0;
  static const double tripZoom = 14.0;
  static const double streetZoom = 17.0;

  // Límites aproximados del perímetro urbano de Pamplona
  static const double northBound = 7.4000;
  static const double southBound = 7.3500;
  static const double eastBound = -72.6200;
  static const double westBound = -72.6700;

  // Puntos de interés clave (coordenadas aproximadas reales)

  // Parque principal / Centro histórico
  static const double parquePrincipalLat = 7.3754;
  static const double parquePrincipalLng = -72.6486;

  // Universidad de Pamplona (campus principal)
  static const double universidadLat = 7.3700;
  static const double universidadLng = -72.6530;

  // Terminal de Transportes
  static const double terminalLat = 7.3820;
  static const double terminalLng = -72.6440;

  // Hospital San Juan de Dios
  static const double hospitalLat = 7.3690;
  static const double hospitalLng = -72.6500;

  // Cristo Rey (mirador)
  static const double cristoReyLat = 7.3900;
  static const double cristoReyLng = -72.6600;

  // Catedral Santa Clara
  static const double catedralLat = 7.3760;
  static const double catedralLng = -72.6490;

  // Barrio El Buque
  static const double elBuqueLat = 7.3850;
  static const double elBuqueLng = -72.6420;

  // Barrio Cariongo
  static const double cariongoLat = 7.3650;
  static const double cariongoLng = -72.6550;

  // Barrio Chapinero
  static const double chapineroLat = 7.3700;
  static const double chapineroLng = -72.6600;

  // Barrio San Francisco
  static const double sanFranciscoLat = 7.3780;
  static const double sanFranciscoLng = -72.6450;

  // Centro Comercial Pamplona
  static const double centroComericalLat = 7.3740;
  static const double centroComericalLng = -72.6470;

  // Barrio Ciudad Jardín
  static const double ciudadJardinLat = 7.3820;
  static const double ciudadJardinLng = -72.6560;
}
