// El anuncio de una campaña de temporada en el inicio («Burger Show»).
//
// Solo se dibuja mientras la campaña rige y tiene productos: lo decide el
// servidor, así que un anuncio nunca abre una sección vacía ni una que ya
// terminó. Sin campañas, no ocupa ni un píxel.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/contraste.dart';
import 'package:nexum_client/features/businesses/domain/antojos.dart';
import 'package:nexum_client/features/campanas/data/campanas_api.dart';

/// Color del anuncio cuando el admin no eligió uno: el rojo de las
/// hamburguesas, que se lee como «evento» sin confundirse con el verde de la
/// marca (que es el de los botones).
const kColorCampanaPorDefecto = Color(0xFFE53935);

Color colorDeCampana(String? hex) {
  if (hex == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) {
    return kColorCampanaPorDefecto;
  }
  return Color(int.parse('FF${hex.substring(1)}', radix: 16));
}

/// El dibujo del anuncio: el render 3D del antojo, si existe.
String? ilustracionDeCampana(String? icon) =>
    kAntojos.where((a) => a.clave == icon).firstOrNull?.ilustracion;

class BannersCampana extends ConsumerWidget {
  const BannersCampana({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final campanas = ref.watch(campanasVigentesProvider).valueOrNull ?? const [];
    if (campanas.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
      child: Column(
        children: [
          for (final c in campanas)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: BannerCampana(
                campana: c,
                onTap: () => context.push(AppRoutes.campanaPath(c.id), extra: c),
              ),
            ),
        ],
      ),
    );
  }
}

class BannerCampana extends StatelessWidget {
  const BannerCampana({required this.campana, required this.onTap, super.key});

  final Campana campana;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fondo = colorDeCampana(campana.color);
    final letra = colorDeTextoSobre(fondo);
    final dibujo = ilustracionDeCampana(campana.icon);
    final oscuro = Color.lerp(fondo, Colors.black, 0.28)!;
    return Semantics(
      button: true,
      label: '${campana.title}. ${fechasDeCampana(campana)}. Ver productos',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: () {
            HapticFeedback.selectionClick();
            onTap();
          },
          child: Ink(
            decoration: BoxDecoration(
              // Degradado hacia el MISMO tono oscurecido: el contraste de la
              // letra se calculó sobre el color, y un degradado a otro color
              // lo rompería en un extremo.
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [fondo, oscuro],
              ),
              borderRadius: BorderRadius.circular(22),
              boxShadow: [
                BoxShadow(
                  color: fondo.withValues(alpha: 0.35),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 10, 16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: letra.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            fechasDeCampana(campana),
                            style: TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: letra,
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          campana.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 22,
                            height: 1.1,
                            fontWeight: FontWeight.w900,
                            color: letra,
                          ),
                        ),
                        if (campana.subtitle != null &&
                            campana.subtitle!.trim().isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            campana.subtitle!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 13,
                              height: 1.3,
                              color: letra.withValues(alpha: 0.9),
                            ),
                          ),
                        ],
                        const SizedBox(height: 10),
                        Text(
                          campana.productos == 1
                              ? 'Ver el producto  →'
                              : 'Ver los ${campana.productos} productos  →',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: letra,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (dibujo != null)
                    Image.asset(
                      dibujo,
                      width: 92,
                      height: 92,
                      // Un asset que falte no puede tumbar el inicio.
                      errorBuilder: (_, __, ___) =>
                          const SizedBox(width: 92, height: 92),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
