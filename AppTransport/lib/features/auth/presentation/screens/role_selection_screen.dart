import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key, required this.identifier});

  final String identifier;

  static const _roles = [
    _RoleMeta(
      role: UserRole.driverCar,
      title: 'Conductor de carro',
      subtitle: 'Viajes urbanos e intermunicipales en automóvil o taxi.',
      gradient: [Color(0xFF1565C0), Color(0xFF0D47A1)],
      glowColor: Color(0xFF1565C0),
    ),
    _RoleMeta(
      role: UserRole.driverMoto,
      title: 'Conductor de moto',
      subtitle: 'Domicilios, mensajería y viajes exprés en motocicleta.',
      gradient: [Color(0xFFE64A19), Color(0xFFBF360C)],
      glowColor: Color(0xFFE64A19),
    ),
    _RoleMeta(
      role: UserRole.business,
      title: 'Empresa',
      subtitle: 'Flota corporativa, logística y servicios empresariales.',
      gradient: [Color(0xFF2E7D32), Color(0xFF1B5E20)],
      glowColor: Color(0xFF2E7D32),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1117),
      body: Stack(
        children: [
          Positioned.fill(child: CustomPaint(painter: _BgPainter())),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 16, 0),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_rounded,
                            color: Colors.white70),
                        onPressed: () => context.pop(),
                      ),
                      const Spacer(),
                    ],
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 8),
                        _buildHeader(),
                        const SizedBox(height: 32),
                        ..._roles.map((meta) => Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: _RoleCard(
                                meta: meta,
                                onTap: () => _selectRole(context, meta.role),
                              ),
                            )),
                        const SizedBox(height: 8),
                        _buildFooter(context),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF00C853), Color(0xFF1565C0)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(Icons.account_circle_rounded,
              color: Colors.white, size: 30),
        ),
        const SizedBox(height: 20),
        const Text(
          'Elige tu rol',
          style: TextStyle(
            color: Colors.white,
            fontSize: 28,
            fontWeight: FontWeight.w800,
            height: 1.1,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Selecciona cómo participarás en la plataforma Nexum.',
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.55),
            fontSize: 14,
            height: 1.4,
          ),
        ),
      ],
    );
  }

  Widget _buildFooter(BuildContext context) {
    return Column(
      children: [
        const Divider(color: Color(0xFF2E3347)),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '¿Ya tienes cuenta? ',
              style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.45), fontSize: 13),
            ),
            GestureDetector(
              onTap: () => context.go('/login'),
              child: const Text(
                'Ingresar',
                style: TextStyle(
                  color: AppColors.primary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _selectRole(BuildContext context, UserRole role) {
    context.push(
      '/register-role?id=${Uri.encodeComponent(identifier)}&role=${role.apiValue}',
    );
  }
}

// ── Role card ─────────────────────────────────────────────────────────────────

class _RoleMeta {
  const _RoleMeta({
    required this.role,
    required this.title,
    required this.subtitle,
    required this.gradient,
    required this.glowColor,
  });

  final UserRole role;
  final String title;
  final String subtitle;
  final List<Color> gradient;
  final Color glowColor;
}

class _RoleCard extends StatefulWidget {
  const _RoleCard({required this.meta, required this.onTap});

  final _RoleMeta meta;
  final VoidCallback onTap;

  @override
  State<_RoleCard> createState() => _RoleCardState();
}

class _RoleCardState extends State<_RoleCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
      lowerBound: 0,
      upperBound: 0.04,
    );
    _scale = Tween<double>(begin: 1, end: 0.96).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _ctrl.forward(),
      onTapUp: (_) {
        _ctrl.reverse();
        widget.onTap();
      },
      onTapCancel: () => _ctrl.reverse(),
      child: ScaleTransition(
        scale: _scale,
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1D27),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF2E3347), width: 1.2),
            boxShadow: [
              BoxShadow(
                color: widget.meta.glowColor.withValues(alpha: 0.15),
                blurRadius: 20,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: widget.meta.gradient,
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(widget.meta.role.icon,
                    color: Colors.white, size: 26),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.meta.title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      widget.meta.subtitle,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.50),
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right_rounded,
                  color: Color(0xFF475569), size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Background ────────────────────────────────────────────────────────────────

class _BgPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;
    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height),
      paint..color = const Color(0xFF0F1117),
    );
    paint.shader = RadialGradient(
      colors: [
        const Color(0xFF1565C0).withValues(alpha: 0.12),
        Colors.transparent,
      ],
    ).createShader(Rect.fromCircle(
      center: Offset(size.width * 0.9, size.height * 0.1),
      radius: size.width * 0.65,
    ));
    canvas.drawCircle(
        Offset(size.width * 0.9, size.height * 0.1), size.width * 0.65, paint);

    paint.shader = RadialGradient(
      colors: [
        const Color(0xFF00C853).withValues(alpha: 0.08),
        Colors.transparent,
      ],
    ).createShader(Rect.fromCircle(
      center: Offset(size.width * 0.1, size.height * 0.85),
      radius: size.width * 0.55,
    ));
    canvas.drawCircle(
        Offset(size.width * 0.1, size.height * 0.85), size.width * 0.55, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
