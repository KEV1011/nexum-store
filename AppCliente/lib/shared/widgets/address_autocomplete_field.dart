import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/services/geo_service.dart';

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

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String value) {
    if (value == _lastSelectedText) return;
    widget.onManualEdit?.call();
    _debounce?.cancel();
    if (value.trim().length < 3) {
      if (_suggestions.isNotEmpty) setState(() => _suggestions = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final results = await ref.read(geoServiceProvider).autocomplete(value);
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

    final text = details?.address ?? suggestion.description;
    _lastSelectedText = text;
    widget.controller.text = text;
    if (details != null) widget.onPlaceSelected?.call(details);
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
                : widget.suffixIcon,
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
