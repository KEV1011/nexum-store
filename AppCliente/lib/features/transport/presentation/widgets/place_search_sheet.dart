import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/location/maps_service.dart';

/// Hoja modal de búsqueda de direcciones con autocompletado (Google Places).
/// Devuelve un [PlaceDetail] al seleccionar, o `null` si se cierra.
Future<PlaceDetail?> showPlaceSearch(
  BuildContext context, {
  required String title,
  LatLng? bias,
}) {
  return showModalBottomSheet<PlaceDetail>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _PlaceSearchSheet(title: title, bias: bias),
  );
}

class _PlaceSearchSheet extends ConsumerStatefulWidget {
  const _PlaceSearchSheet({required this.title, this.bias});

  final String title;
  final LatLng? bias;

  @override
  ConsumerState<_PlaceSearchSheet> createState() => _PlaceSearchSheetState();
}

class _PlaceSearchSheetState extends ConsumerState<_PlaceSearchSheet> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  List<PlacePrediction> _predictions = [];
  bool _loading = false;
  bool _resolving = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    if (value.trim().length < 3) {
      setState(() {
        _predictions = [];
        _loading = false;
      });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final results = await ref
          .read(mapsServiceProvider)
          .autocomplete(value, bias: widget.bias);
      if (!mounted) return;
      setState(() {
        _predictions = results;
        _loading = false;
      });
    });
  }

  Future<void> _select(PlacePrediction p) async {
    setState(() => _resolving = true);
    final detail = await ref.read(mapsServiceProvider).placeDetails(p.placeId);
    if (!mounted) return;
    setState(() => _resolving = false);
    if (detail == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo obtener la ubicación.')),
      );
      return;
    }
    Navigator.of(context).pop(detail);
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.85,
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.outlineLight,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: Row(
                children: [
                  Text(
                    widget.title,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _ctrl,
                autofocus: true,
                textInputAction: TextInputAction.search,
                onChanged: _onChanged,
                decoration: InputDecoration(
                  hintText: 'Escribe una dirección o lugar',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _ctrl.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear_rounded),
                          onPressed: () {
                            _ctrl.clear();
                            _onChanged('');
                          },
                        )
                      : null,
                  filled: true,
                  fillColor: AppColors.backgroundLight,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: _resolving
                  ? const Center(child: CircularProgressIndicator())
                  : _buildResults(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults() {
    if (_ctrl.text.trim().length < 3) {
      return const _Hint(
        icon: Icons.travel_explore_rounded,
        text: 'Empieza a escribir para buscar una dirección.',
      );
    }
    if (!_loading && _predictions.isEmpty) {
      return const _Hint(
        icon: Icons.search_off_rounded,
        text: 'Sin resultados. Prueba con otra dirección.',
      );
    }
    return ListView.separated(
      itemCount: _predictions.length,
      separatorBuilder: (_, __) =>
          const Divider(height: 1, indent: 56, endIndent: 16),
      itemBuilder: (_, i) {
        final p = _predictions[i];
        return ListTile(
          leading: const Icon(
            Icons.location_on_outlined,
            color: AppColors.primary,
          ),
          title: Text(
            p.mainText,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          subtitle: p.secondaryText.isEmpty
              ? null
              : Text(
                  p.secondaryText,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
          onTap: () => _select(p),
        );
      },
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: AppColors.textTertiary),
            const SizedBox(height: 12),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
