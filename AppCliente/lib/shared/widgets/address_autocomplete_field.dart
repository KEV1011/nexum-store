import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/services/geo_service.dart';

/// Debouncing address search field backed by the backend /geo/autocomplete proxy.
///
/// When the user selects a suggestion, [onPlaceSelected] is called with full
/// [PlaceDetails] including coordinates.  If the user edits the text manually
/// after a selection, [onManualEdit] fires to signal that coordinates should
/// be invalidated.
class AddressAutocompleteField extends ConsumerStatefulWidget {
  const AddressAutocompleteField({
    required this.label,
    required this.hint,
    this.initialValue,
    this.lat,
    this.lng,
    this.onPlaceSelected,
    this.onManualEdit,
    this.required = false,
    super.key,
  });

  final String label;
  final String hint;
  final String? initialValue;
  final double? lat;
  final double? lng;
  final void Function(PlaceDetails)? onPlaceSelected;
  final VoidCallback? onManualEdit;
  final bool required;

  @override
  ConsumerState<AddressAutocompleteField> createState() =>
      _AddressAutocompleteFieldState();
}

class _AddressAutocompleteFieldState
    extends ConsumerState<AddressAutocompleteField> {
  final _ctrl = TextEditingController();
  final _focusNode = FocusNode();
  Timer? _debounce;
  List<PlaceSuggestion> _suggestions = [];
  bool _loading = false;
  bool _hasPicked = false;

  @override
  void initState() {
    super.initState();
    if (widget.initialValue != null) {
      _ctrl.text = widget.initialValue!;
      _hasPicked = true;
    }
    _ctrl.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.removeListener(_onTextChanged);
    _ctrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    if (_hasPicked) {
      _hasPicked = false;
      widget.onManualEdit?.call();
    }
    _debounce?.cancel();
    final q = _ctrl.text.trim();
    if (q.length < 3) {
      setState(() => _suggestions = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _fetch(q));
  }

  Future<void> _fetch(String q) async {
    if (!mounted) return;
    setState(() => _loading = true);
    final geo = ref.read(geoServiceProvider);
    final results = await geo.autocomplete(
      q,
      lat: widget.lat,
      lng: widget.lng,
    );
    if (!mounted) return;
    setState(() {
      _suggestions = results.take(4).toList();
      _loading = false;
    });
  }

  Future<void> _pick(PlaceSuggestion s) async {
    final geo = ref.read(geoServiceProvider);
    final details = await geo.placeDetails(s.placeId);
    if (!mounted) return;
    _ctrl.text = s.description;
    _hasPicked = true;
    setState(() => _suggestions = []);
    if (details != null) widget.onPlaceSelected?.call(details);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextFormField(
          controller: _ctrl,
          focusNode: _focusNode,
          decoration: InputDecoration(
            labelText: widget.label,
            hintText: widget.hint,
            suffixIcon: _loading
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : null,
          ),
          validator: widget.required
              ? (v) => (v == null || v.trim().isEmpty)
                  ? '${widget.label} es requerido'
                  : null
              : null,
        ),
        if (_suggestions.isNotEmpty)
          Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(8),
            child: ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _suggestions.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final s = _suggestions[i];
                return ListTile(
                  dense: true,
                  leading: const Icon(Icons.location_on_outlined, size: 18),
                  title: Text(
                    s.mainText,
                    style: const TextStyle(fontSize: 13),
                  ),
                  subtitle: s.secondaryText.isNotEmpty
                      ? Text(
                          s.secondaryText,
                          style: const TextStyle(fontSize: 11),
                        )
                      : null,
                  onTap: () => _pick(s),
                );
              },
            ),
          ),
      ],
    );
  }
}
