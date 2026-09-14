import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';

// ── Los estados que no son «todo salió bien» ─────────────────────────────────
//
// Cargando, vacío, sin cobertura y sin conexión son CUATRO cosas distintas, y
// la app las trataba casi igual: un spinner centrado o una lista en blanco.
// Una lista vacía por un fallo de red le dice al usuario que no hay comercios
// en su barrio, que es mentira y además la peor mentira posible — se va.
//
// El quinto estado, «comercio cerrado», no vive aquí: vive en `FilaComercio`,
// porque no es una pantalla sino una fila que se atenúa y cambia de insignia
// SIN desaparecer de la lista.

/// Esqueleto con la forma del contenido que viene.
///
/// Un spinner centrado no dice nada: ni cuánto falta, ni qué va a aparecer, y
/// al llegar los datos la pantalla da un salto. Un esqueleto con la silueta de
/// las filas reserva el sitio, así que el contenido «se rellena» en vez de
/// empujar, y de paso comunica qué se está cargando.
class EsqueletoFilas extends StatefulWidget {
  const EsqueletoFilas({this.cuantas = 5, super.key});

  final int cuantas;

  @override
  State<EsqueletoFilas> createState() => _EsqueletoFilasState();
}

class _EsqueletoFilasState extends State<EsqueletoFilas>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        // Latido suave entre la superficie hundida y el borde. Sin brillo que
        // recorra la pantalla: a pantalla completa marea y compite con el
        // contenido que está a punto de aparecer.
        final color = Color.lerp(context.zHundida, context.zBorde, _c.value)!;
        return Column(
          children: [
            for (var i = 0; i < widget.cuantas; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _FilaFantasma(color: color),
              ),
          ],
        );
      },
    );
  }
}

class _FilaFantasma extends StatelessWidget {
  const _FilaFantasma({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    Widget barra(double ancho, double alto) => Container(
          width: ancho,
          height: alto,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(6),
          ),
        );

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: context.zSuperficie,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.zBorde),
      ),
      child: Row(
        children: [
          // Exactamente la miniatura de `FilaComercio`: 76 × 64.
          Container(
            width: 76,
            height: 64,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(10),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                barra(140, 14),
                const SizedBox(height: 8),
                barra(200, 11),
                const SizedBox(height: 9),
                barra(64, 16),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// El armazón común de los estados con mensaje: icono, título, explicación y
/// una acción. La acción no es opcional por descuido — un estado vacío sin
/// salida deja al usuario mirando una pantalla muerta.
///
/// Es público para que cada pantalla ponga SU texto. Los presets de abajo
/// cubren los casos del encargo; para el resto, reusar el armazón con la copia
/// correcta es mejor que forzar un preset que dice otra cosa (pasó: la lista
/// de favoritos vacía decía «todavía no hay comercios por aquí», que es falso
/// y además confunde dos problemas distintos).
class EstadoZipa extends StatelessWidget {
  const EstadoZipa({
    required this.icono,
    required this.titulo,
    required this.mensaje,
    required this.accion,
    required this.onAccion,
    this.accionSecundaria,
    this.onAccionSecundaria,
    super.key,
  });

  final ZipaIconName icono;
  final String titulo;
  final String mensaje;
  final String accion;
  final VoidCallback onAccion;
  final String? accionSecundaria;
  final VoidCallback? onAccionSecundaria;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: context.zHundida,
              borderRadius: BorderRadius.circular(18),
            ),
            alignment: Alignment.center,
            child: ZipaIcon(icono, color: context.zTexto3),
          ),
          const SizedBox(height: 18),
          Text(
            titulo,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: context.zTexto,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            mensaje,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, height: 1.45, color: context.zTexto2),
          ),
          const SizedBox(height: 22),
          FilledButton(onPressed: onAccion, child: Text(accion)),
          if (accionSecundaria != null && onAccionSecundaria != null) ...[
            const SizedBox(height: 4),
            TextButton(
              onPressed: onAccionSecundaria,
              child: Text(accionSecundaria!),
            ),
          ],
        ],
      ),
    );
  }
}

/// No hay comercios cerca de la dirección elegida.
///
/// Con salida: casi siempre el problema es la dirección, no el barrio. Sin
/// esta pantalla, el usuario concluye que ZIPA no sirve donde vive.
class SinComerciosCerca extends StatelessWidget {
  const SinComerciosCerca({
    required this.onCambiarDireccion,
    this.onAmpliarRadio,
    super.key,
  });

  final VoidCallback onCambiarDireccion;
  final VoidCallback? onAmpliarRadio;

  @override
  Widget build(BuildContext context) {
    return EstadoZipa(
      icono: ZipaIconName.sinResultados,
      titulo: 'Todavía no hay comercios por aquí',
      mensaje: 'Estamos abriendo zona a zona. Prueba con otra dirección o '
          'busca un poco más lejos.',
      accion: 'Cambiar dirección',
      onAccion: onCambiarDireccion,
      accionSecundaria: onAmpliarRadio == null ? null : 'Buscar más lejos',
      onAccionSecundaria: onAmpliarRadio,
    );
  }
}

/// La dirección elegida queda fuera de la zona donde ZIPA opera.
///
/// **Se enseña al ELEGIR LA DIRECCIÓN y bloquea ahí.** Si se dejara pasar y se
/// avisara al pagar, alguien habría armado el carrito entero, elegido el medio
/// de pago y puesto la propina para que le dijéramos al final que no podemos
/// llevárselo. Enterarse tarde de algo que sabíamos desde el principio es lo
/// que hace que una app se desinstale.
class FueraDeCobertura extends StatelessWidget {
  const FueraDeCobertura({
    required this.onElegirOtra,
    this.municipio,
    super.key,
  });

  final VoidCallback onElegirOtra;

  /// Dónde SÍ hay servicio, si se sabe. Sin el dato no se inventa una lista de
  /// ciudades: decir «pronto en tu ciudad» sin saberlo es una promesa.
  final String? municipio;

  @override
  Widget build(BuildContext context) {
    return EstadoZipa(
      icono: ZipaIconName.fueraDeCobertura,
      titulo: 'Todavía no llegamos a esta dirección',
      mensaje: municipio == null
          ? 'Esa dirección está fuera de la zona donde tenemos servicio. '
              'Elige otra para continuar.'
          : 'Esa dirección está fuera de nuestra zona. Por ahora operamos en '
              '$municipio.',
      accion: 'Elegir otra dirección',
      onAccion: onElegirOtra,
    );
  }
}

/// Se perdió el contacto con el servidor.
///
/// Banner persistente, NO un diálogo. Un modal tapa la pantalla y hay que
/// cerrarlo para volver a lo que estabas viendo —que en esta app puede ser el
/// mapa de tu viaje en curso—, y encima vuelve a aparecer al siguiente
/// reintento fallido. El banner se queda arriba, molesta lo justo y deja
/// trabajar con lo que ya está cargado.
///
/// No se usa un detector de conectividad del sistema a propósito: saber que
/// hay wifi no es saber que el servidor contesta. Esto se enciende cuando una
/// petición REAL falla, que es la única señal que le importa al usuario.
class BannerSinConexion extends StatelessWidget {
  const BannerSinConexion({required this.onReintentar, this.reintentando = false, super.key});

  final VoidCallback onReintentar;
  final bool reintentando;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.zHundida,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        child: Row(
          children: [
            ZipaIcon(ZipaIconName.sinConexion, color: context.zTexto2),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Sin conexión con ZIPA. Lo que ves puede estar desactualizado.',
                style: TextStyle(fontSize: 12.5, color: context.zTexto),
              ),
            ),
            if (reintentando)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12),
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              )
            else
              TextButton(
                onPressed: onReintentar,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  minimumSize: const Size(0, 36),
                ),
                child: const Text('Reintentar'),
              ),
          ],
        ),
      ),
    );
  }
}
