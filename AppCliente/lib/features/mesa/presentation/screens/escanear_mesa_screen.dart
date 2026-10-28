/// «Escanear QR de la mesa» desde dentro de la app.
///
/// Lee el QR con `mobile_scanner` (licencia BSD-3-Clause) y SOLO abre la
/// carta si el QR es de una mesa de ZIPA (`leerEnlaceMesa`): un QR pegado
/// encima del de la mesa podría llevar a una página que se haga pasar por la
/// carta. La cámara se pide al abrir esta pantalla, no antes.
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/mesa/domain/enlace_mesa.dart';

class EscanearMesaScreen extends StatefulWidget {
  const EscanearMesaScreen({super.key});

  @override
  State<EscanearMesaScreen> createState() => _EscanearMesaScreenState();
}

class _EscanearMesaScreenState extends State<EscanearMesaScreen> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _abierto = false;
  String? _ultimoAjeno;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _detectado(BarcodeCapture captura) {
    if (_abierto) return;
    for (final b in captura.barcodes) {
      final texto = b.rawValue;
      if (texto == null) continue;
      final enlace = leerEnlaceMesa(texto);
      if (enlace != null) {
        _abierto = true;
        context.pushReplacement(enlace.ruta);
        return;
      }
      if (texto != _ultimoAjeno) {
        _ultimoAjeno = texto;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Este código no es el QR de una mesa de ZIPA. Busca el que está en tu mesa.',
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Volver',
          onPressed: () => safeBack(context),
        ),
        title: const Text('Escanea el QR de tu mesa'),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _controller, onDetect: _detectado),
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, estado, _) {
              final error = estado.error;
              if (error == null) return const _Marco();
              final sinPermiso =
                  error.errorCode == MobileScannerErrorCode.permissionDenied;
              return ColoredBox(
                color: Colors.black,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(AppConstants.spacingL),
                    child: Text(
                      sinPermiso
                          ? 'Para leer el QR necesitamos la cámara. Actívala para ZIPA '
                              'en los ajustes del teléfono, o abre el QR con la cámara '
                              'del celular.'
                          : 'No pudimos abrir la cámara. Prueba con la cámara del '
                              'celular: el QR abre la carta igual.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 16),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Marco extends StatelessWidget {
  const _Marco();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Column(
        children: [
          const Spacer(),
          Container(
            width: 240,
            height: 240,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.white, width: 3),
              borderRadius: BorderRadius.circular(24),
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppConstants.spacingL),
            child: Text(
              'Apunta al código que está en tu mesa',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ),
          const Spacer(),
        ],
      ),
    );
  }
}
