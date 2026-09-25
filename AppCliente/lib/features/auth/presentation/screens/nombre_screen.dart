import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/core/widgets/loading_overlay.dart';
import 'package:nexum_client/features/account/presentation/providers/'
    'client_profile_provider.dart';
import 'package:nexum_client/features/auth/presentation/providers/auth_provider.dart';
import 'package:nexum_client/features/transport/domain/entities/'
    'transport_request_entity.dart';

/// Último paso del registro del pasajero: cómo se llama.
///
/// POR QUÉ EXISTE. La app cliente no tenía registro —teléfono, código y
/// dentro—, así que la cuenta se creaba con un literal escrito por nosotros.
/// Ese nombre no se queda en la pantalla de Cuenta: es el que el conductor lee
/// en la oferta y en «a quién recojo», el del manifiesto de un intermunicipal
/// y el que ve el negocio en su pedido. Sin preguntarlo, todos los pasajeros
/// de la plataforma se llamaban igual y el taxista que llega no puede llamar a
/// nadie.
///
/// SE PUEDE APLAZAR, y es deliberado: quedarse sin poder entrar por un fallo
/// de red en la pantalla que sigue al código sería peor que un viaje con el
/// nombre en genérico. Quien lo aplaza encuentra el aviso en Cuenta.
class NombreScreen extends ConsumerStatefulWidget {
  const NombreScreen({this.seguirAPedirViaje = false, super.key});

  /// Quien llega desde el enlace de WhatsApp con su ubicación ya mandada
  /// quiere un carro AHORA. Se le pregunta el nombre igual —es su primera vez
  /// y nadie más se lo va a preguntar—, pero al terminar sigue a la pantalla
  /// de pedir en vez de dejarlo en el inicio, que es deshacer lo que el botón
  /// de ubicación vino a ahorrar.
  final bool seguirAPedirViaje;

  @override
  ConsumerState<NombreScreen> createState() => _NombreScreenState();
}

class _NombreScreenState extends ConsumerState<NombreScreen> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_repintar);
    _focus.addListener(_repintar);
  }

  void _repintar() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  bool get _valido => _controller.text.trim().length >= 2;

  Future<void> _guardar() async {
    if (!_valido || _guardando) return;
    _focus.unfocus();
    final nombre = _controller.text.trim();
    setState(() => _guardando = true);
    final error =
        await ref.read(clientProfileProvider.notifier).updateName(nombre);
    if (!mounted) return;
    if (error != null) {
      setState(() => _guardando = false);
      AppSnackbar.showError(context, error);
      return;
    }
    await ref.read(authProvider.notifier).nombrePuesto(nombre);
    if (!mounted) return;
    _salir();
  }

  void _ahoraNo() {
    _focus.unfocus();
    _salir();
  }

  /// `go` al inicio y luego `push`, para que el atrás vuelva al inicio en vez
  /// de cerrar la app (mismo patrón que la entrada por WhatsApp).
  void _salir() {
    context.go(AppRoutes.home);
    if (widget.seguirAPedirViaje) {
      context.push(
        AppRoutes.transportBooking,
        extra: TransportServiceType.transporte,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final surface = isDark ? AppColors.cardDark : context.surfaceColor;
    final outline = isDark ? AppColors.outlineDark : context.outlineColor;

    return PopScope(
      // El atrás volvería al código, que ya se usó: la sesión existe desde que
      // se validó. La salida de esta pantalla es «Ahora no».
      canPop: false,
      child: LoadingOverlay(
        isLoading: _guardando,
        child: Scaffold(
          backgroundColor:
              isDark ? AppColors.backgroundDark : context.backgroundColor,
          body: SafeArea(
            child: GestureDetector(
              onTap: () => FocusScope.of(context).unfocus(),
              behavior: HitTestBehavior.opaque,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingL,
                  AppConstants.spacingXL,
                  AppConstants.spacingL,
                  AppConstants.spacingL,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: AppColors.primaryContainer,
                        borderRadius:
                            BorderRadius.circular(AppConstants.radiusLarge),
                      ),
                      child: const Icon(
                        Icons.person_rounded,
                        color: AppColors.primaryDim,
                        size: 28,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingL),
                    Text(
                      '¿Cómo te llamas?',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingXS),
                    Text(
                      'Tu conductor lo verá para saber a quién recoge, y los '
                      'negocios para entregarte el pedido.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: context.textSecondaryColor,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingXL),
                    Text(
                      'NOMBRE Y APELLIDO',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.textTertiaryColor,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingS),
                    Container(
                      decoration: BoxDecoration(
                        color: surface,
                        borderRadius:
                            BorderRadius.circular(AppConstants.radiusLarge),
                        border: Border.all(
                          color: _focus.hasFocus ? AppColors.primary : outline,
                          width: _focus.hasFocus ? 1.6 : 1,
                        ),
                      ),
                      child: TextField(
                        controller: _controller,
                        focusNode: _focus,
                        autofocus: true,
                        textCapitalization: TextCapitalization.words,
                        textInputAction: TextInputAction.done,
                        inputFormatters: [
                          LengthLimitingTextInputFormatter(60),
                        ],
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                        decoration: const InputDecoration(
                          hintText: 'Ana Gómez',
                          border: InputBorder.none,
                          filled: false,
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: AppConstants.spacingM,
                            vertical: AppConstants.spacingM + 2,
                          ),
                        ),
                        onSubmitted: (_) => _guardar(),
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingXL),
                    SizedBox(
                      height: AppConstants.minTouchTarget + 10,
                      child: ElevatedButton(
                        onPressed: _valido && !_guardando ? _guardar : null,
                        style: ElevatedButton.styleFrom(
                          elevation: _valido ? 2 : 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(
                              AppConstants.radiusLarge,
                            ),
                          ),
                        ),
                        child: const Text(
                          'Continuar',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingS),
                    TextButton(
                      onPressed: _guardando ? null : _ahoraNo,
                      child: Text(
                        'Ahora no',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: context.textTertiaryColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
