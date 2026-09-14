import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

/// Un comercio, en una fila.
///
/// Sustituye a la tarjeta de portada grande. El motivo no es estético: con
/// tarjetas de 108 px de foto caben dos comercios en pantalla, así que
/// comparar —que es lo que hace quien tiene hambre— exigía desplazarse arriba
/// y abajo. En fila caben seis, y los tres datos con los que se decide
/// («categoría · tiempo · envío») quedan uno debajo de otro, alineados.
///
/// CERRADO NO DESAPARECE. Un comercio que no está recibiendo pedidos se
/// atenúa y cambia su insignia, pero sigue en la lista: esconderlo hace que
/// alguien piense que cerró para siempre, o que la app está rota porque «ayer
/// estaba y hoy no». Y saber que existe y abre mañana es información útil.
class FilaComercio extends StatelessWidget {
  const FilaComercio({
    required this.comercio,
    required this.onTap,
    super.key,
  });

  final BusinessEntity comercio;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final abierto = comercio.isOpen;

    return Material(
      color: context.zSuperficie,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.zBorde),
          ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // La foto SÍ se atenúa; el texto no tanto, porque un nombre
                // ilegible no ayuda a nadie a reconocer el sitio.
                Opacity(
                  opacity: abierto ? 1 : 0.45,
                  child: _Miniatura(url: comercio.imageUrl),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        comercio.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: context.zTexto,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _meta(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: context.zTexto3),
                      ),
                      const SizedBox(height: 6),
                      _Insignia(abierto: abierto, motivo: comercio.cerradoMotivo),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                const ZipaIcon(ZipaIconName.chevron, size: ZipaIconSize.inline),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// «Restaurante · 25 min · Envío $3.000», con el domicilio gratis dicho con
  /// esa palabra: un «$0» se lee como que falta el dato.
  String _meta() {
    final envio = comercio.deliveryFee <= 0
        ? 'Envío gratis'
        : 'Envío ${CurrencyFormatter.format(comercio.deliveryFee)}';
    return '${comercio.category.label} · ${comercio.etaMinutes} min · $envio';
  }
}

class _Miniatura extends StatelessWidget {
  const _Miniatura({required this.url});

  final String? url;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: 76,
        height: 64,
        child: url == null || url!.isEmpty
            ? const _SinFoto()
            : Image.network(
                ApiConfig.resolveUrl(url!),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const _SinFoto(),
                loadingBuilder: (context, hijo, progreso) =>
                    progreso == null ? hijo : const _SinFoto(),
              ),
      ),
    );
  }
}

/// El hueco de una foto que no hay.
///
/// Gris neutro con el icono de imagen, NO un degradado de colores con unos
/// cubiertos: eso se lee como si fuera la foto del local, y hace que un sitio
/// sin foto parezca uno que eligió esa. El hueco tiene que verse como un
/// hueco.
class _SinFoto extends StatelessWidget {
  const _SinFoto();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.zHundida,
      child: Center(
        child: ZipaIcon(ZipaIconName.sinFoto, color: context.zTexto3),
      ),
    );
  }
}

class _Insignia extends StatelessWidget {
  const _Insignia({required this.abierto, this.motivo});

  final bool abierto;
  final String? motivo;

  @override
  Widget build(BuildContext context) {
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    final tinte = abierto ? ZipaTokens.abierto : ZipaTokens.cerrado;
    final fondo = oscuro ? tinte.fondo.oscuro : tinte.fondo.claro;
    final texto = oscuro ? tinte.glifo.oscuro : tinte.glifo.claro;

    // Con motivo se dice el motivo: «Cerrado» a secas deja al cliente sin
    // saber si vuelve en veinte minutos o el lunes.
    final etiqueta = abierto ? 'Abierto' : (motivo ?? 'Cerrado');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: fondo,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        etiqueta,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          color: texto,
        ),
      ),
    );
  }
}
