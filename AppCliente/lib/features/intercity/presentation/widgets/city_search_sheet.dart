import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';

/// Buscador de municipios.
///
/// Antes esto era un `DropdownButtonFormField`: con siete ciudades bastaba,
/// pero con los municipios en tabla son cuarenta y cinco y una lista
/// desplegable se vuelve inservible — hay que recorrerla a dedo y no se puede
/// escribir. Ahora se abre una hoja con campo de búsqueda que ignora tildes
/// ("cucuta" encuentra "Cúcuta") y agrupa por departamento.
Future<IntercityCity?> showCitySearchSheet(
  BuildContext context, {
  required String titulo,
  IntercityCity? seleccionado,
}) {
  return showModalBottomSheet<IntercityCity>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CitySearchSheet(titulo: titulo, seleccionado: seleccionado),
  );
}

/// Quita tildes y pasa a minúsculas: la mitad de las búsquedas reales se
/// escriben sin tilde.
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
  final IntercityCity? seleccionado;

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

  List<IntercityCity> get _resultados {
    final todos = IntercityCity.values;
    if (_q.trim().isEmpty) return todos;
    final objetivo = _sinTildes(_q.trim());
    return todos
        .where((c) =>
            _sinTildes(c.displayName).contains(objetivo) ||
            c.name.contains(objetivo) ||
            _sinTildes(c.department).contains(objetivo))
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
          decoration: const BoxDecoration(
            color: AppColors.intercitySurface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.intercityOutline,
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
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _ctrl,
                      autofocus: true,
                      style: const TextStyle(color: Colors.white, fontSize: 15),
                      onChanged: (v) => setState(() => _q = v),
                      decoration: InputDecoration(
                        hintText: 'Escribe el municipio…',
                        hintStyle:
                            const TextStyle(color: AppColors.intercityTextMuted),
                        prefixIcon: const Icon(Icons.search_rounded,
                            color: AppColors.intercityTextMuted, size: 20),
                        suffixIcon: _q.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.close_rounded,
                                    color: AppColors.intercityTextMuted,
                                    size: 18),
                                onPressed: () {
                                  _ctrl.clear();
                                  setState(() => _q = '');
                                },
                              ),
                        filled: true,
                        fillColor: AppColors.intercityBg,
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 12),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                              color: AppColors.intercityOutline),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                              color: AppColors.intercityOutline),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: resultados.isEmpty
                    ? const _SinResultados()
                    : ListView.builder(
                        controller: scrollController,
                        padding: const EdgeInsets.only(bottom: 20),
                        itemCount: resultados.length,
                        itemBuilder: (context, i) {
                          final c = resultados[i];
                          final activo = c == widget.seleccionado;
                          // Encabezado de departamento cuando cambia (solo con
                          // la lista completa: filtrando estorba).
                          final mostrarDepto = _q.trim().isEmpty &&
                              c.department.isNotEmpty &&
                              (i == 0 ||
                                  resultados[i - 1].department != c.department);
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (mostrarDepto)
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                      16, 12, 16, 4),
                                  child: Text(
                                    c.department.toUpperCase(),
                                    style: const TextStyle(
                                      color: AppColors.intercityTextDim,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.6,
                                    ),
                                  ),
                                ),
                              ListTile(
                                dense: true,
                                leading: Icon(
                                  c.icon,
                                  size: 20,
                                  color: activo
                                      ? AppColors.intercityAccent
                                      : AppColors.intercityTextMuted,
                                ),
                                title: Text(
                                  c.displayName,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: activo
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                  ),
                                ),
                                subtitle: c.department.isEmpty
                                    ? null
                                    : Text(
                                        c.department,
                                        style: const TextStyle(
                                          color: AppColors.intercityTextMuted,
                                          fontSize: 11,
                                        ),
                                      ),
                                trailing: activo
                                    ? const Icon(Icons.check_rounded,
                                        color: AppColors.intercityAccent,
                                        size: 20)
                                    : null,
                                onTap: () => Navigator.of(context).pop(c),
                              ),
                            ],
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

class _SinResultados extends StatelessWidget {
  const _SinResultados();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(28),
      child: Column(
        children: [
          Icon(Icons.travel_explore_rounded,
              size: 40, color: AppColors.intercityTextDim),
          SizedBox(height: 10),
          Text(
            'No encontramos ese municipio.',
            style: TextStyle(color: AppColors.intercityTextMuted, fontSize: 14),
            textAlign: TextAlign.center,
          ),
          SizedBox(height: 4),
          Text(
            'Prueba con otro nombre. Si tu pueblo no aparece, escríbenos: '
            'lo agregamos.',
            style: TextStyle(color: AppColors.intercityTextDim, fontSize: 12),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
