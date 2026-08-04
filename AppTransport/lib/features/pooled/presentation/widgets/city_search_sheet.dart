import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';

/// Buscador de municipios.
///
/// Antes era un `DropdownButton`: con siete ciudades bastaba, pero con los
/// municipios en tabla son cuarenta y cinco y una lista desplegable se vuelve
/// inservible. Ahora se abre una hoja con campo de búsqueda que ignora tildes
/// ("cucuta" encuentra "Cúcuta").
Future<PooledCity?> showCitySearchSheet(
  BuildContext context, {
  required String titulo,
  PooledCity? seleccionado,
}) {
  return showModalBottomSheet<PooledCity>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CitySearchSheet(titulo: titulo, seleccionado: seleccionado),
  );
}

String _sinTildes(String t) => t
    .toLowerCase()
    .replaceAll(RegExp('[áàäâ]'), 'a')
    .replaceAll(RegExp('[éèëê]'), 'e')
    .replaceAll(RegExp('[íìïî]'), 'i')
    .replaceAll(RegExp('[óòöô]'), 'o')
    .replaceAll(RegExp('[úùüû]'), 'u')
    .replaceAll('ñ', 'n');

class _CitySearchSheet extends StatefulWidget {
  const _CitySearchSheet({required this.titulo, this.seleccionado});

  final String titulo;
  final PooledCity? seleccionado;

  @override
  State<_CitySearchSheet> createState() => _CitySearchSheetState();
}

class _CitySearchSheetState extends State<_CitySearchSheet> {
  final _ctrl = TextEditingController();
  String _q = '';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  List<PooledCity> get _resultados {
    final todos = PooledCity.values;
    if (_q.trim().isEmpty) return todos;
    final objetivo = _sinTildes(_q.trim());
    return todos
        .where((c) =>
            _sinTildes(c.displayName).contains(objetivo) ||
            c.name.contains(objetivo))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final resultados = _resultados;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        initialChildSize: 0.75,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => Container(
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: context.outlineColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.titulo,
                      style: TextStyle(
                        color: context.textPrimaryColor,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _ctrl,
                      autofocus: true,
                      style: TextStyle(
                          color: context.textPrimaryColor, fontSize: 15),
                      onChanged: (v) => setState(() => _q = v),
                      decoration: InputDecoration(
                        hintText: 'Escribe el municipio…',
                        prefixIcon: const Icon(Icons.search_rounded, size: 20),
                        suffixIcon: _q.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.close_rounded, size: 18),
                                onPressed: () {
                                  _ctrl.clear();
                                  setState(() => _q = '');
                                },
                              ),
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 12),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: resultados.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(28),
                        child: Text(
                          'No encontramos ese municipio. Prueba con otro nombre.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: context.textSecondaryColor, fontSize: 14),
                        ),
                      )
                    : ListView.builder(
                        controller: scrollController,
                        padding: const EdgeInsets.only(bottom: 20),
                        itemCount: resultados.length,
                        itemBuilder: (context, i) {
                          final c = resultados[i];
                          final activo = c == widget.seleccionado;
                          return ListTile(
                            dense: true,
                            leading: Icon(Icons.place_rounded,
                                size: 20,
                                color: activo
                                    ? Theme.of(context).colorScheme.primary
                                    : context.textSecondaryColor),
                            title: Text(
                              c.displayName,
                              style: TextStyle(
                                color: context.textPrimaryColor,
                                fontSize: 15,
                                fontWeight:
                                    activo ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                            trailing: activo
                                ? Icon(Icons.check_rounded,
                                    size: 20,
                                    color: Theme.of(context).colorScheme.primary)
                                : null,
                            onTap: () => Navigator.of(context).pop(c),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
