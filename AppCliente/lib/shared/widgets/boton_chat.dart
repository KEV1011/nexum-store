import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/contraste.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/transport/presentation/screens/trip_chat_screen.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';

/// Botón del chat del servicio con el contador de mensajes sin leer.
///
/// Lo usan el viaje, el envío y el mandado: los tres hablan por el mismo canal
/// (`TransportWsService`) y por el mismo hilo del servidor. Antes vivía dentro
/// del seguimiento del viaje y el mandado tenía un botón suelto sin contador.
///
/// El contador sube con los mensajes que el servidor le entrega a quien NO
/// tiene el chat abierto. Hasta que el servidor empezó a hacerlo, el mensaje
/// solo le llegaba a quien estaba dentro del chat, así que este contador nunca
/// se encendía: el mandadero escribía desde la tienda y nadie se enteraba.
class BotonChat extends StatefulWidget {
  const BotonChat({
    required this.chatId,
    required this.peerName,
    required this.tooltip,
    super.key,
  });

  /// El id del servicio: viaje, envío o mandado. Es el que resuelve el
  /// servidor.
  final String chatId;
  final String peerName;
  final String tooltip;

  @override
  State<BotonChat> createState() => _BotonChatState();
}

class _BotonChatState extends State<BotonChat> {
  StreamSubscription<TripChatEvent>? _sub;
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _sub = TransportWsService().tripChatEvents.listen((event) {
      if (!mounted) return;
      final msg = event.message;
      if (msg == null) return;
      if (event.tripId != null && event.tripId != widget.chatId) return;
      // Solo los mensajes del otro lado (no los propios). El servidor marca
      // los del pasajero con senderRole 'client'.
      if ((msg['senderRole'] as String?) == 'client') return;
      setState(() => _unread++);
      AppSnackbar.showInfo(context, 'Nuevo mensaje de ${widget.peerName}');
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Badge(
      isLabelVisible: _unread > 0,
      label: Text('$_unread'),
      child: IconButton(
        style: IconButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: textoSobreMarca,
        ),
        tooltip: widget.tooltip,
        icon: const Icon(Icons.chat_bubble_rounded),
        onPressed: () {
          setState(() => _unread = 0);
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => TripChatScreen(
                tripId: widget.chatId,
                peerName: widget.peerName,
              ),
            ),
          );
        },
      ),
    );
  }
}
