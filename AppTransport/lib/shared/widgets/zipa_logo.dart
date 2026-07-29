import 'package:flutter/material.dart';

/// Marca ZIPA dibujada a mano: la corona muisca sobre una Z de tres trazos
/// (personas · encargos · carga).
///
/// Se dibuja con [CustomPainter] en vez de cargar un PNG para que sea nítida a
/// cualquier tamaño y para poder animar cada trazo por separado en el arranque.
class ZipaLogo extends StatelessWidget {
  const ZipaLogo({
    this.size = 96,
    this.progress = 1,
    super.key,
  });

  final double size;

  /// 0 → nada dibujado · 1 → marca completa. Valores intermedios revelan la
  /// marca por partes, que es lo que anima [ZipaLogoIntro].
  final double progress;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _ZipaPainter(progress)),
    );
  }
}

class _ZipaPainter extends CustomPainter {
  _ZipaPainter(this.progress);

  final double progress;

  // Paleta de la marca.
  static const _blanco = Color(0xFFFFFFFF);
  static const _blancoTenue = Color(0xFFEAF7F1);
  static const _blancoSuave = Color(0xFFD6EFE4);
  static const _oro = Color(0xFFF2C75C);
  static const _oroClaro = Color(0xFFFFF6DC);

  /// Reparte [progress] en tramos: cada elemento tiene su ventana de entrada.
  double _tramo(double desde, double hasta) =>
      ((progress - desde) / (hasta - desde)).clamp(0.0, 1.0);

  @override
  void paint(Canvas canvas, Size size) {
    // El diseño está trazado sobre un lienzo de 64×64: se escala al tamaño real.
    final k = size.width / 64;
    Offset p(double x, double y) => Offset(x * k, y * k);

    final trazo = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 9 * k
      ..strokeCap = StrokeCap.round;

    // ── Los tres trazos de la Z, escalonados ──────────────────────────────
    final t1 = _tramo(0.00, 0.30);
    if (t1 > 0) {
      canvas.drawLine(
        p(17, 20),
        Offset.lerp(p(17, 20), p(47, 20), t1)!,
        trazo..color = _blanco,
      );
    }
    final t2 = _tramo(0.22, 0.55);
    if (t2 > 0) {
      canvas.drawLine(
        p(45, 22),
        Offset.lerp(p(45, 22), p(19, 42), t2)!,
        trazo..color = _blancoTenue,
      );
    }
    final t3 = _tramo(0.45, 0.75);
    if (t3 > 0) {
      canvas.drawLine(
        p(17, 44),
        Offset.lerp(p(17, 44), p(47, 44), t3)!,
        trazo..color = _blancoSuave,
      );
    }

    // ── La corona se asienta al final, con un leve rebote ──────────────────
    final tc = _tramo(0.70, 1.0);
    if (tc > 0) {
      final curva = Curves.easeOutBack.transform(tc);
      canvas.save();
      // Escala desde la base de la corona para que "aterrice" sobre la Z.
      canvas.translate(32 * k, 14.5 * k);
      canvas.scale(curva.clamp(0.0, 1.2));
      canvas.translate(-32 * k, -14.5 * k);

      final corona = Path()
        ..moveTo(21 * k, 14.5 * k)
        ..lineTo(26 * k, 7 * k)
        ..lineTo(32 * k, 12.5 * k)
        ..lineTo(38 * k, 7 * k)
        ..lineTo(43 * k, 14.5 * k)
        ..close();
      canvas.drawPath(
        corona,
        Paint()..color = _oro.withValues(alpha: tc.clamp(0.0, 1.0)),
      );
      canvas.drawCircle(
        p(32, 10),
        1.6 * k,
        Paint()..color = _oroClaro.withValues(alpha: tc.clamp(0.0, 1.0)),
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ZipaPainter old) => old.progress != progress;
}

/// La marca dibujándose: los tres trazos entran escalonados y la corona se
/// asienta encima. Es la entrada de la app — dura poco a propósito.
class ZipaLogoIntro extends StatefulWidget {
  const ZipaLogoIntro({
    this.size = 120,
    this.onDone,
    super.key,
  });

  final double size;
  final VoidCallback? onDone;

  @override
  State<ZipaLogoIntro> createState() => _ZipaLogoIntroState();
}

class _ZipaLogoIntroState extends State<ZipaLogoIntro>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _c.addStatusListener((s) {
      if (s == AnimationStatus.completed) widget.onDone?.call();
    });
    // Con accesibilidad de movimiento reducido, la marca aparece ya formada.
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _c.value = 1;
      widget.onDone?.call();
    } else {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => ZipaLogo(size: widget.size, progress: _c.value),
    );
  }
}
