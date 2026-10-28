/// La carta del local, pedida desde la mesa con la app.
///
/// Es la MISMA carta y el MISMO pedido que la web del QR (`/carta/:código`):
/// el pedido entra a la cuenta de la mesa y a la cocina igual, y sale en
/// Mesas del portal igual. Nunca se despacha a un repartidor: lo decide el
/// servidor por el modo del pedido, no esta pantalla.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/businesses/domain/entities/business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/product_options_sheet.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/product_tile.dart';
import 'package:nexum_client/features/mesa/data/mesa_api.dart';
import 'package:nexum_client/features/mesa/domain/carrito_mesa.dart';
import 'package:nexum_client/features/mesa/presentation/mesa_providers.dart';
import 'package:nexum_client/shared/widgets/estados_zipa.dart';
import 'package:nexum_client/shared/widgets/hoja_deslizable.dart';

class MesaCartaScreen extends ConsumerStatefulWidget {
  const MesaCartaScreen({
    required this.codigo,
    this.mesa,
    this.paraLlevar = false,
    super.key,
  });

  final String codigo;
  final String? mesa;
  final bool paraLlevar;

  @override
  ConsumerState<MesaCartaScreen> createState() => _MesaCartaScreenState();
}

class _MesaCartaScreenState extends ConsumerState<MesaCartaScreen> {
  CartaDeMesa? _carta;
  String? _error;
  List<LineaMesa> _lineas = const [];
  String? _mesa;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    _mesa = widget.mesa;
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final carta = await ref.read(mesaApiProvider).carta(widget.codigo);
      if (!mounted) return;
      setState(() {
        _carta = carta;
        // Una mesa que el local no declaró no puede pedir: se le pide elegir
        // en vez de dejar que el servidor rechace el pedido ya armado.
        if (_mesa != null && !carta.mesas.contains(_mesa)) _mesa = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = mensajeDe(e, 'No pudimos abrir la carta.'));
    }
  }

  Future<void> _agregar(ProductEntity p) async {
    final elegido = await showProductOptionsSheet(context, p);
    if (elegido == null || !mounted) return;
    final precio = p.price + elegido.options.fold<double>(0, (s, o) => s + o.priceDelta);
    setState(() {
      _lineas = agregarLinea(
        _lineas,
        LineaMesa(
          productId: p.id,
          nombre: p.name,
          precioUnitario: precio,
          cantidad: elegido.quantity,
          opcionIds: [for (final o in elegido.options) o.id],
          resumen: elegido.options.map((o) => o.name).join(', '),
          nota: elegido.notes,
        ),
      );
    });
  }

  Future<void> _elegirMesa() async {
    final mesas = _carta?.mesas ?? const <String>[];
    final elegida = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _HojaMesas(mesas: mesas, actual: _mesa),
    );
    if (elegida != null && mounted) setState(() => _mesa = elegida);
  }

  Future<void> _revisar() async {
    final enviar = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _HojaPedido(
        lineas: _lineas,
        destino: widget.paraLlevar ? 'Para llevar' : 'Mesa ${_mesa ?? '—'}',
      ),
    );
    if (enviar == true) await _enviar();
  }

  Future<void> _enviar() async {
    if (!widget.paraLlevar && _mesa == null) {
      await _elegirMesa();
      if (_mesa == null) return;
    }
    setState(() => _enviando = true);
    try {
      final pedido = await ref.read(mesaApiProvider).pedir(
            widget.codigo,
            mesa: _mesa,
            paraLlevar: widget.paraLlevar,
            lineas: _lineas,
          );
      if (!mounted) return;
      setState(() => _lineas = const []);
      await context.push(
        AppRoutes.mesaPedidoPath(widget.codigo, pedido.id),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(mensajeDe(e, 'No se pudo enviar tu pedido.'))),
      );
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final carta = _carta;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Volver',
          onPressed: () => safeBack(context, fallback: AppRoutes.splash),
        ),
        title: Text(carta?.negocio.name ?? 'Carta del local'),
      ),
      body: _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(AppConstants.spacingL),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: AppConstants.spacingM),
                    OutlinedButton(onPressed: _cargar, child: const Text('Reintentar')),
                  ],
                ),
              ),
            )
          : carta == null
              ? const SingleChildScrollView(child: EsqueletoCarta())
              : _cuerpo(carta),
      bottomNavigationBar: carta == null || _lineas.isEmpty
          ? null
          : SafeArea(
              minimum: const EdgeInsets.all(AppConstants.spacingM),
              child: FilledButton(
                onPressed: _enviando ? null : _revisar,
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                child: _enviando
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4),
                      )
                    : Text(
                        'Ver pedido · ${_lineas.fold<int>(0, (s, l) => s + l.cantidad)} · '
                        '${CurrencyFormatter.format(totalEstimado(_lineas))}',
                      ),
              ),
            ),
    );
  }

  Widget _cuerpo(CartaDeMesa carta) {
    final negocio = carta.negocio;
    final porSeccion = <String, List<ProductEntity>>{};
    for (final p in negocio.products) {
      if (p.suggestAsAddon) continue;
      porSeccion.putIfAbsent(p.category, () => []).add(p);
    }
    final sinMesas = carta.mesas.isEmpty && !widget.paraLlevar;
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppConstants.spacingM,
        AppConstants.spacingS,
        AppConstants.spacingM,
        AppConstants.spacingXL,
      ),
      children: [
        _Destino(
          paraLlevar: widget.paraLlevar,
          mesa: _mesa,
          onCambiar: carta.mesas.isEmpty || widget.paraLlevar ? null : _elegirMesa,
        ),
        if (!negocio.isOpen)
          const _Aviso('El local no está recibiendo pedidos ahora. Pídele al mesero.'),
        if (sinMesas)
          const _Aviso('Este local aún no tiene activados los pedidos desde la mesa.'),
        for (final entrada in porSeccion.entries) ...[
          Padding(
            padding: const EdgeInsets.only(
              top: AppConstants.spacingL,
              bottom: AppConstants.spacingS,
            ),
            child: Text(
              entrada.key,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              ),
            ),
          ),
          for (final p in entrada.value)
            Padding(
              padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
              child: ProductTile(
                product: p,
                // Con opciones cada variante es su propia línea: el contador
                // del tile sumaría platos distintos.
                quantity: p.hasOptions ? 0 : cantidadDe(_lineas, p.id),
                onAdd: () {
                  if (!negocio.isOpen || sinMesas) return;
                  _agregar(p);
                },
                onRemove: () => setState(() => _lineas = quitarUno(_lineas, p.id)),
              ),
            ),
        ],
      ],
    );
  }
}

class _Destino extends StatelessWidget {
  const _Destino({required this.paraLlevar, required this.mesa, this.onCambiar});

  final bool paraLlevar;
  final String? mesa;
  final VoidCallback? onCambiar;

  @override
  Widget build(BuildContext context) {
    final texto = paraLlevar
        ? 'Para llevar · recoges en el mostrador'
        : mesa == null
            ? 'Elige tu mesa'
            : 'Estás en la mesa $mesa';
    return Material(
      color: context.surfaceVariantColor,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: ListTile(
        leading: Icon(
          paraLlevar ? Icons.shopping_bag_outlined : Icons.table_restaurant_outlined,
          color: context.textPrimaryColor,
        ),
        title: Text(texto, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: const Text('Tu pedido va directo a la cocina del local.'),
        trailing: onCambiar == null
            ? null
            : TextButton(onPressed: onCambiar, child: Text(mesa == null ? 'Elegir' : 'Cambiar')),
        onTap: onCambiar,
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso(this.texto);
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppConstants.spacingS),
      child: Container(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF4D6),
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        ),
        child: Text(
          texto,
          style: const TextStyle(color: Color(0xFF5C4300), fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _HojaMesas extends StatelessWidget {
  const _HojaMesas({required this.mesas, this.actual});
  final List<String> mesas;
  final String? actual;

  @override
  Widget build(BuildContext context) {
    return HojaDeslizable(
      children: [
        Text(
          '¿En qué mesa estás?',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: context.textPrimaryColor,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Mira el número en el letrero de tu mesa.',
          style: TextStyle(color: context.textSecondaryColor),
        ),
        const SizedBox(height: AppConstants.spacingM),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final m in mesas)
              ChoiceChip(
                label: Text(m),
                selected: m == actual,
                onSelected: (_) => Navigator.of(context).pop(m),
              ),
          ],
        ),
      ],
    );
  }
}

class _HojaPedido extends StatelessWidget {
  const _HojaPedido({required this.lineas, required this.destino});
  final List<LineaMesa> lineas;
  final String destino;

  @override
  Widget build(BuildContext context) {
    return HojaDeslizable(
      children: [
        Text(
          'Tu pedido · $destino',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: context.textPrimaryColor,
          ),
        ),
        const SizedBox(height: AppConstants.spacingM),
        for (final l in lineas)
          Padding(
            padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${l.cantidad} ×  ', style: const TextStyle(fontWeight: FontWeight.w700)),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.nombre, style: const TextStyle(fontWeight: FontWeight.w600)),
                      if (l.resumen.isNotEmpty)
                        Text(l.resumen, style: TextStyle(color: context.textSecondaryColor)),
                      if (l.nota != null && l.nota!.trim().isNotEmpty)
                        Text('«${l.nota!.trim()}»',
                            style: TextStyle(color: context.textSecondaryColor)),
                    ],
                  ),
                ),
                Text(CurrencyFormatter.format(l.subtotal)),
              ],
            ),
          ),
        const Divider(),
        Row(
          children: [
            const Expanded(
              child: Text('Total aproximado', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
            Text(
              CurrencyFormatter.format(totalEstimado(lineas)),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Lo pagas en el local. El total final es el de la cuenta de tu mesa.',
          style: TextStyle(color: context.textSecondaryColor, fontSize: 12.5),
        ),
        const SizedBox(height: AppConstants.spacingM),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          child: const Text('Enviar a la cocina'),
        ),
      ],
    );
  }
}
