import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

/// Muestra una imagen elegida con `image_picker` de forma multiplataforma.
///
/// En Flutter web `Image.file` no está soportado (lanza un assertion) y la ruta
/// que devuelve `image_picker` es una URL `blob:`; en móvil es una ruta del
/// sistema de archivos. Úsalo en lugar de `Image.file(File(path))` para que la
/// vista previa del comprobante/foto funcione tanto en web como en el celular.
class PickedImage extends StatelessWidget {
  const PickedImage(
    this.path, {
    super.key,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.errorBuilder,
  });

  final String path;
  final double? width;
  final double? height;
  final BoxFit fit;
  final ImageErrorWidgetBuilder? errorBuilder;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      return Image.network(
        path,
        width: width,
        height: height,
        fit: fit,
        errorBuilder: errorBuilder,
      );
    }
    return Image.file(
      File(path),
      width: width,
      height: height,
      fit: fit,
      errorBuilder: errorBuilder,
    );
  }
}
