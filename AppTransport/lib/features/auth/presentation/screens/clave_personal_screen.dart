import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/contraste.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';

/// Lo que se le dice a quien escribe una clave que no sirve. Espejo de
/// `motivoClaveInvalida` del backend, para avisar ANTES de mandarla; el
/// servidor vuelve a comprobarlo y su respuesta es la que manda.
String? motivoClaveLocal(String clave) {
  final c = clave.trim();
  if (!RegExp(r'^\d+$').hasMatch(c)) return 'La clave son solo números.';
  if (c.length < 4 || c.length > 6) return 'La clave tiene de 4 a 6 números.';
  if (RegExp(r'^(\d)\1+$').hasMatch(c)) {
    return 'No uses el mismo número repetido: es lo primero que se prueba.';
  }
  final d = c.split('').map(int.parse).toList();
  var sube = true;
  var baja = true;
  for (var i = 1; i < d.length; i++) {
    if (d[i] != (d[i - 1] + 1) % 10) sube = false;
    if (d[i] != (d[i - 1] + 9) % 10) baja = false;
  }
  if (sube || baja) {
    return 'No uses números seguidos (1234, 4321): es lo primero que se prueba.';
  }
  return null;
}

/// Crear o cambiar la clave personal.
///
/// [primera] = se llega justo después de entrar, porque la cuenta todavía no
/// tiene clave. Ahí no hay «atrás»: mientras el código del SMS sea el mismo
/// para todos, una cuenta sin clave es una cuenta a la que entra quien sepa
/// el número.
class ClavePersonalScreen extends ConsumerStatefulWidget {
  const ClavePersonalScreen({this.primera = false, super.key});

  final bool primera;

  @override
  ConsumerState<ClavePersonalScreen> createState() => _ClavePersonalScreenState();
}

class _ClavePersonalScreenState extends ConsumerState<ClavePersonalScreen> {
  final _actual = TextEditingController();
  final _nueva = TextEditingController();
  final _repite = TextEditingController();
  bool _cargando = true;
  bool _tiene = false;
  bool _guardando = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final res = await DioClient().dio.get<Map<String, dynamic>>('/driver/clave');
      final d = res.data?['data'];
      if (!mounted) return;
      setState(() {
        _tiene = d is Map && d['tiene'] == true;
        _cargando = false;
      });
    } catch (_) {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  void dispose() {
    _actual.dispose();
    _nueva.dispose();
    _repite.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final nueva = _nueva.text.trim();
    final local = motivoClaveLocal(nueva);
    if (local != null) {
      setState(() => _error = local);
      return;
    }
    if (nueva != _repite.text.trim()) {
      setState(() => _error = 'Las dos claves no coinciden.');
      return;
    }
    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      await DioClient().dio.put<Map<String, dynamic>>(
        '/driver/clave',
        data: {
          'nueva': nueva,
          if (_tiene) 'actual': _actual.text.trim(),
        },
      );
      await ref.read(authRepositoryProvider).claveCreada();
      if (!mounted) return;
      AppSnackbar.showSuccess(context, 'Clave guardada. Te la pediremos al entrar.');
      if (widget.primera) {
        context.go('/home');
      } else {
        safeBack(context, fallback: '/home');
      }
    } on DioException catch (e) {
      final cuerpo = e.response?.data;
      setState(() => _error = cuerpo is Map && cuerpo['error'] is String
          ? cuerpo['error'] as String
          : 'No se pudo guardar la clave. Revisa tu conexión.');
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Widget _campo(TextEditingController c, String etiqueta) => TextField(
        controller: c,
        obscureText: true,
        keyboardType: TextInputType.number,
        maxLength: 6,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        onChanged: (_) {
          if (_error != null) setState(() => _error = null);
        },
        decoration: InputDecoration(
          labelText: etiqueta,
          counterText: '',
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !widget.primera,
      child: Scaffold(
        appBar: AppBar(
          title: Text(_tiene ? 'Cambiar clave personal' : 'Crea tu clave personal'),
          automaticallyImplyLeading: !widget.primera,
        ),
        body: _cargando
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Icon(Icons.lock_person_rounded, size: 48, color: context.textPrimaryColor),
                  const SizedBox(height: 12),
                  Text(
                    'Mientras el código que llega por mensaje sea el mismo para '
                    'todos los que prueban la app, tu clave es lo que impide que '
                    'alguien que sepa tu número entre a tu cuenta y a tu billetera.',
                    style: TextStyle(fontSize: 14, height: 1.4, color: context.textSecondaryColor),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'De 4 a 6 números. No uses 1234 ni el mismo número repetido.',
                    style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
                  ),
                  const SizedBox(height: 20),
                  if (_tiene) ...[
                    _campo(_actual, 'Clave actual'),
                    const SizedBox(height: 12),
                  ],
                  _campo(_nueva, 'Clave nueva'),
                  const SizedBox(height: 12),
                  _campo(_repite, 'Repite la clave nueva'),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 13)),
                  ],
                  const SizedBox(height: 20),
                  SizedBox(
                    height: 52,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: colorDeTextoSobre(AppColors.primary),
                      ),
                      onPressed: _guardando ? null : _guardar,
                      child: _guardando
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.4),
                            )
                          : const Text('Guardar clave'),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
