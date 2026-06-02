import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Wraps any widget in a subtle press-to-scale microinteraction with optional
/// haptic feedback. Coordinates correctly with nested InkWell / GestureDetector
/// children by only handling [onTapDown] / [onTapCancel] for the scale state,
/// while [onTap] propagates through the child tree as normal.
///
/// Typical usage:
/// ```dart
/// PressScale(
///   onTap: () => doSomething(),
///   child: MyCard(...),
/// )
/// ```
class PressScale extends StatefulWidget {
  const PressScale({
    required this.child,
    this.onTap,
    this.scale = 0.96,
    this.haptic = true,
    super.key,
  });

  final Widget child;
  final VoidCallback? onTap;
  /// Target scale while pressed (default 0.96 is a subtle 4 % shrink).
  final double scale;
  /// Whether to emit a [HapticFeedback.selectionClick] on press down.
  final bool haptic;

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  bool _pressed = false;

  void _down(TapDownDetails _) {
    if (_pressed) return;
    setState(() => _pressed = true);
    if (widget.haptic) HapticFeedback.selectionClick();
  }

  void _up(TapUpDetails _) {
    if (!mounted) return;
    setState(() => _pressed = false);
    widget.onTap?.call();
  }

  void _cancel() {
    if (!mounted) return;
    setState(() => _pressed = false);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: _down,
      onTapUp: _up,
      onTapCancel: _cancel,
      child: AnimatedScale(
        scale: _pressed ? widget.scale : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
