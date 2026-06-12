import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

/// Tolerancia para los golden tests (fracción de píxeles distintos).
///
/// El rasterizado de fuentes varía ligeramente entre máquinas (local vs
/// runner de CI), produciendo diffs del orden de 0.1–0.5% sin que exista
/// una regresión visual real. 1% absorbe ese ruido y sigue detectando
/// cualquier rotura de layout genuina.
const double _kGoldenDiffTolerance = 0.01;

class _TolerantGoldenComparator extends LocalFileComparator {
  _TolerantGoldenComparator(super.testFile);

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    final result = await GoldenFileComparator.compareLists(
      imageBytes,
      await getGoldenBytes(golden),
    );
    if (result.passed) return true;
    if (result.diffPercent <= _kGoldenDiffTolerance) {
      debugPrint(
        'Golden "$golden": diff ${(result.diffPercent * 100).toStringAsFixed(2)}% '
        '≤ tolerancia ${( _kGoldenDiffTolerance * 100).toStringAsFixed(0)}% — aceptado.',
      );
      return true;
    }
    final error = await generateFailureOutput(result, golden, basedir);
    throw FlutterError(error);
  }
}

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  final base = goldenFileComparator;
  if (base is LocalFileComparator) {
    goldenFileComparator =
        _TolerantGoldenComparator(Uri.parse('${base.basedir}test.dart'));
  }
  await testMain();
}
