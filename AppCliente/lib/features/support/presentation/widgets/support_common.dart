import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';

/// Etiqueta + color por estado de ticket de soporte.
({String label, Color color}) supportStatusMeta(String status) {
  switch (status) {
    case 'OPEN':
      return (label: 'Abierto', color: AppColors.warning);
    case 'IN_PROGRESS':
      return (label: 'En proceso', color: AppColors.primary);
    case 'RESOLVED':
      return (label: 'Resuelto', color: AppColors.success);
    case 'CLOSED':
      return (label: 'Cerrado', color: Colors.grey);
    default:
      return (label: status, color: Colors.grey);
  }
}

class SupportStatusChip extends StatelessWidget {
  const SupportStatusChip({required this.status, super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final m = supportStatusMeta(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: m.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        m.label,
        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: m.color),
      ),
    );
  }
}
