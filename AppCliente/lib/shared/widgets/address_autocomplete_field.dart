import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/shared/widgets/map_location_picker.dart';

/// Campo de dirección con autocompletado de Google Places (vía backend).
///
/// Mientras el usuario escribe muestra sugerencias debajo del campo; al
/// seleccionar una se resuelven las coordenadas y se notifica por
/// [onPlaceSelected]. Si el servicio geo no está disponible, el campo se
/// comporta como un TextFormField normal (texto libre).
class AddressAutocompleteField extends ConsumerStatefulWidget {
  const AddressAutocompleteField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.requiredField,
    this.onPlaceSelected,
    this.onManualEdit,
    this.suffixIcon,
    this.allowMapPicker = true,
    this.sesgo,
    super.key,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final bool requiredField;

  /// Llamado cuando el usuario elige una sugerencia (con lat/lng resueltos).
  final void Function(PlaceDetails place)? onPlaceSelected;

  /// Llamado cuando el usuario edita el texto manualmente (invalida las
  /// coordenadas de una selección anterior).
  final VoidCallback? onManualEdit;

  /// Icono extra a la derecha (p. ej. "mis direcciones").
  final Widget? suffixIcon;

  /// Ofrece elegir el punto en el mapa además de escribirlo. Es la salida
  /// cuando la dirección no existe en Google o la persona no sabe escribirla
  /// ("frente a la cancha"), que en pueblo es la mitad de los casos.
  final bool allowMapPicker;

  /// Punto hacia el que sesgar las sugerencias. Se usa para escribir una
  /// dirección de OTRA ciudad: sin él, Google ordena por cercanía a Pamplona
  /// y una calle de Bucaramanga no aparece.
  final ({double lat, double lng})? sesgo;

  @override
  ConsumerState<AddressAutocompleteField> createState() =>
      _AddressAutocompleteFieldState();
}

class _AddressAutocompleteFieldState
    extends ConsumerState<AddressAutocompleteField> {
  Timer? _debounce;
  List<PlaceSuggestion> _suggestions = const [];
  bool _resolving = false;
  // Evita re-disparar la búsqueda cuando el texto cambia por una selección.
  String _lastSelectedText = '';

  /// De dónde salió el punto que la pantalla tiene ahora, si tiene uno.
  OrigenPunto _origen = OrigenPunto.ninguno;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String value) {
    if (value == _lastSelectedText) return;
    if (puntoSobreviveEdicion(
      origen: _origen,
      elegido: _lastSelectedText,
      escrito: value,
    )) {
      // El punto se queda: la persona está COMPLETANDO la dirección (casa,
      // apto, barrio) o corrigiendo el texto que puso Google. Antes cualquier
      // tecla borraba el punto, así que solo se podía guardar la dirección
      // que «quería la app»: escribir la propia costaba la ubicación.
    } else {
      if (_origen != OrigenPunto.ninguno) setState(() {});
      _origen = OrigenPunto.ninguno;
      widget.onManualEdit?.call();
    }
    _debounce?.cancel();
    if (value.trim().length < 3) {
      if (_suggestions.isNotEmpty) setState(() => _suggestions = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final results = await ref.read(geoServiceProvider).autocomplete(
            value,
            lat: widget.sesgo?.lat,
            lng: widget.sesgo?.lng,
          );
      if (!mounted) return;
      setState(() => _suggestions = results);
    });
  }

  Future<void> _select(PlaceSuggestion suggestion) async {
    setState(() {
      _resolving = true;
      _suggestions = const [];
    });
    final details =
        await ref.read(geoServiceProvider).placeDetails(suggestion.placeId);
    if (!mounted) return;
    setState(() => _resolving = false);

    // El texto que queda es el que la persona TOCÓ en la lista, no el que
    // Google devuelve al resolverlo: ese segundo a veces es otro (la calle
    // más cercana, «Pje. la Curia #6») y la dirección «cambiaba sola».
    final tocado = suggestion.description.trim();
    final text = tocado.isNotEmpty ? tocado : (details?.address ?? '');
    _lastSelectedText = text;
    widget.controller.text = text;
    if (details != null) {
      setState(() => _origen = OrigenPunto.sugerencia);
      widget.onPlaceSelected?.call(
        PlaceDetails(address: text, lat: details.lat, lng: details.lng),
      );
    }
  }

  Future<void> _elegirEnMapa() async {
    final s = widget.sesgo;
    final picked = await MapLocationPicker.show(
      context,
      title: widget.label,
      // Con sesgo, el mapa abre en ESA ciudad. Abrirlo en Pamplona para
      // marcar un punto en Bucaramanga obliga a arrastrar medio país.
      initial: s == null ? null : LatLng(s.lat, s.lng),
    );
    if (picked == null || !mounted) return;
    _lastSelectedText = picked.address;
    widget.controller.text = picked.address;
    widget.onPlaceSelected?.call(
      PlaceDetails(address: picked.address, lat: picked.lat, lng: picked.lng),
    );
    setState(() {
      _suggestions = const [];
      _origen = OrigenPunto.mapa;
    });
  }

  /// Iconos del extremo derecho: el que aporte la pantalla y, siempre, el del
  /// mapa. `Row` con `mainAxisSize.min` para que el campo no se estire.
  Widget? _iconosDerecha() {
    final mapa = widget.allowMapPicker
        ? IconButton(
            tooltip: 'Elegir en el mapa',
            icon: const Icon(Icons.map_outlined),
            onPressed: () => unawaited(_elegirEnMapa()),
          )
        : null;
    if (widget.suffixIcon == null) return mapa;
    if (mapa == null) return widget.suffixIcon;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [widget.suffixIcon!, mapa],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextFormField(
          controller: widget.controller,
          textCapitalization: TextCapitalization.sentences,
          onChanged: _onChanged,
          decoration: InputDecoration(
            labelText: widget.label,
            hintText: widget.hint,
            // Que se vea que el punto sigue marcado aunque se edite el texto:
            // sin esto, quien completa «apto 201» no sabe si perdió el pin.
            helperText: _origen == OrigenPunto.mapa
                ? 'Punto marcado en el mapa. Puedes completar la dirección.'
                : null,
            prefixIcon: const Icon(Icons.location_on_outlined),
            suffixIcon: _resolving
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                // Los dos iconos conviven. Antes el del llamador REEMPLAZABA
                // al del mapa, y por eso en la pantalla de pedir viaje —la
                // más usada— no había forma de marcar el punto en el mapa:
                // el botón de "Mis direcciones" lo tapaba.
                : _iconosDerecha(),
          ),
          validator: widget.requiredField
              ? (v) =>
                  (v == null || v.trim().isEmpty) ? 'Ingresa una dirección' : null
              : null,
        ),
        if (_suggestions.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.outlineColor),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                for (final s in _suggestions.take(4))
                  ListTile(
                    dense: true,
                    leading: Icon(
                      Icons.place_outlined,
                      size: 20,
                      color: context.textSecondaryColor,
                    ),
                    title: Text(
                      s.mainText,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: s.secondaryText.isEmpty
                        ? null
                        : Text(
                            s.secondaryText,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12),
                          ),
                    onTap: () => _select(s),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

/// De dónde salió el punto de una dirección.
enum OrigenPunto { ninguno, mapa, sugerencia }

/// ¿El punto elegido sigue valiendo después de que la persona edite el texto?
///
/// * **Marcado en el MAPA**: sí, mientras el campo no quede vacío. El pin es
///   la verdad y el texto solo lo describe; en Pamplona Google devuelve la
///   calle más cercana («Pje. la Curia #6») y la persona TIENE que poder
///   reemplazarla por su dirección real sin perder dónde marcó.
/// * **Elegido de la LISTA**: el punto salió de un texto, así que vale mientras
///   se esté completando ese texto (empieza igual) y no si se escribió otra
///   dirección encima.
/// * Campo vacío: nunca. Quien borra todo empieza otra dirección.
bool puntoSobreviveEdicion({
  required OrigenPunto origen,
  required String elegido,
  required String escrito,
}) {
  final nuevo = escrito.trim();
  if (nuevo.isEmpty) return false;
  if (origen == OrigenPunto.mapa) return true;
  if (origen != OrigenPunto.sugerencia) return false;
  final base = elegido.trim().toLowerCase();
  final prefijo = base.length < 8 ? base : base.substring(0, 8);
  return prefijo.isNotEmpty && nuevo.toLowerCase().startsWith(prefijo);
}

