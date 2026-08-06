import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';

/// Eliminar la cuenta desde la app.
///
/// App Store y Play lo exigen: quien crea una cuenta desde la app tiene que
/// poder borrarla desde la app, sin escribir a soporte ni entrar a una web.
///
/// La pantalla dice la verdad completa antes de que el usuario decida, porque
/// esto no se deshace: qué desaparece, qué se conserva y por qué. Lo que se
/// conserva son los viajes ya liquidados — llevan la comisión de la plataforma
/// y lo que cobró el conductor, que es su contabilidad y la de su empresa, no
/// solo un dato del pasajero.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  bool _cargando = true;
  bool _borrando = false;
  bool _puedeEliminar = false;
  String? _motivoBloqueo;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Se pregunta ANTES de pintar el botón: descubrir que no se puede después
    // de teclear la confirmación es la peor forma de enterarse.
    Future.microtask(_comprobar);
  }

  Future<void> _comprobar() async {
    try {
      final res = await DioClient()
          .dio
          .get<Map<String, dynamic>>('/driver/account/deletion');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (!mounted) return;
      setState(() {
        _puedeEliminar = data?['puedeEliminar'] as bool? ?? false;
        _motivoBloqueo = data?['motivo'] as String?;
        _cargando = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.response?.data is Map
            ? (e.response!.data as Map)['error']?.toString() ??
                'No pudimos comprobar tu cuenta.'
            : 'No pudimos comprobar tu cuenta. Revisa tu conexión.';
        _cargando = false;
      });
    }
  }

  Future<void> _eliminar() async {
    setState(() => _borrando = true);
    try {
      await DioClient().dio.delete<Map<String, dynamic>>('/driver/account');
      if (!mounted) return;
      // Cerrar sesión echa al usuario al login: la cuenta ya no existe y
      // cualquier pantalla que siga abierta pediría datos que ya no están.
      await ref.read(authProvider.notifier).logout();
      if (!mounted) return;
      AppSnackbar.showInfo(context, 'Tu cuenta fue eliminada.');
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _borrando = false);
      final msg = e.response?.data is Map
          ? (e.response!.data as Map)['error']?.toString()
          : null;
      AppSnackbar.showError(context, msg ?? 'No se pudo eliminar la cuenta.');
    }
  }

  Future<void> _confirmar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(
          '¿Eliminar tu cuenta?',
          style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w700),
        ),
        content: const Text(
          'Esto no se puede deshacer. Perderás tu historial, tus documentos '
          'y tu vínculo con la empresa. Tendrías que registrarte y verificarte '
          'de nuevo desde cero.',
          style: TextStyle(fontFamily: 'Inter'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'Sí, eliminar',
              style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
    if (ok ?? false) await _eliminar();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: const Text('Eliminar mi cuenta'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context),
        ),
      ),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(AppConstants.spacingL),
              children: [
                if (_error != null) ...[
                  _Aviso(
                    color: AppColors.error,
                    icono: Icons.wifi_off_rounded,
                    texto: _error!,
                  ),
                  const SizedBox(height: AppConstants.spacingL),
                  OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _cargando = true;
                        _error = null;
                      });
                      _comprobar();
                    },
                    child: const Text('Reintentar'),
                  ),
                ] else ...[
                  Text(
                    'Qué pasa si eliminas tu cuenta',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: context.textPrimaryColor,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  const _Punto(
                    icono: Icons.person_off_outlined,
                    titulo: 'No podrás volver a entrar',
                    detalle:
                        'Tu número queda libre: si algún día quieres volver, '
                        'te registras y te verificas de nuevo desde cero.',
                  ),
                  const _Punto(
                    icono: Icons.delete_outline_rounded,
                    titulo: 'Borramos tus datos personales',
                    detalle:
                        'Nombre, correo, foto, cédula, licencia y tu cuenta '
                        'bancaria. Y quedas desafiliado de tu empresa.',
                  ),
                  const _Punto(
                    icono: Icons.receipt_long_outlined,
                    titulo: 'Los viajes ya liquidados se conservan',
                    detalle:
                        'Sin tu nombre ni tu teléfono. Sostienen la liquidación '
                        'de tu empresa, sus cuentas de cobro y los remitos '
                        'firmados: por ley hay que guardarlos.',
                  ),
                  const _Punto(
                    icono: Icons.account_balance_wallet_outlined,
                    titulo: 'Cobra antes lo que te deben',
                    detalle:
                        'Si tienes un retiro pendiente, no podrás eliminar la '
                        'cuenta hasta que te lo paguen.',
                  ),
                  const SizedBox(height: AppConstants.spacingL),
                  if (!_puedeEliminar && _motivoBloqueo != null)
                    _Aviso(
                      color: AppColors.warning,
                      icono: Icons.hourglass_bottom_rounded,
                      texto: _motivoBloqueo!,
                    )
                  else
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _borrando ? null : _confirmar,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.error,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: _borrando
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Eliminar mi cuenta'),
                      ),
                    ),
                ],
              ],
            ),
    );
  }
}

class _Punto extends StatelessWidget {
  const _Punto({required this.icono, required this.titulo, required this.detalle});

  final IconData icono;
  final String titulo;
  final String detalle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingM),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, size: 20, color: context.textTertiaryColor),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: context.textPrimaryColor,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  detalle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.textTertiaryColor,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.color, required this.icono, required this.texto});

  final Color color;
  final IconData icono;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, size: 20, color: color),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Text(
              texto,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.textPrimaryColor,
                    height: 1.4,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
