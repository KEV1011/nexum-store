import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/addresses/domain/entities/address_entity.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';

/// Pantalla de gestión de direcciones de entrega guardadas.
class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final addresses = ref.watch(addressesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Mis direcciones')),
      body: addresses.isEmpty
          ? const _EmptyAddresses()
          : ListView.separated(
              padding: const EdgeInsets.all(AppConstants.spacingM),
              itemCount: addresses.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(height: AppConstants.spacingS),
              itemBuilder: (context, i) =>
                  _AddressTile(address: addresses[i]),
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          builder: (_) => const _AddAddressSheet(),
        ),
        icon: const Icon(Icons.add_location_alt_rounded),
        label: const Text('Nueva dirección'),
      ),
    );
  }
}

class _AddressTile extends ConsumerWidget {
  const _AddressTile({required this.address});

  final AddressEntity address;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final notifier = ref.read(addressesProvider.notifier);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : AppColors.cardLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: address.isDefault
              ? AppColors.primary
              : (isDark ? AppColors.outlineDark : AppColors.outlineLight),
          width: address.isDefault ? 1.5 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Row(
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: address.isDefault
                    ? AppColors.primaryContainer
                    : (isDark
                        ? AppColors.surfaceVariantDark
                        : AppColors.surfaceVariantLight),
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusMedium),
              ),
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Padding(
                  padding: EdgeInsets.all(8),
                  child: Icon(Icons.location_on_rounded, size: 22),
                ),
              ),
            ),
            const SizedBox(width: AppConstants.spacingM),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        address.alias,
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (address.isDefault) ...[
                        const SizedBox(width: AppConstants.spacingS),
                        DecoratedBox(
                          decoration: BoxDecoration(
                            color: AppColors.primaryContainer,
                            borderRadius: BorderRadius.circular(
                              AppConstants.radiusCircular,
                            ),
                          ),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            child: Text(
                              'Predeterminada',
                              style: TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppColors.primaryDim,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    address.fullAddress,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!address.isDefault)
                  IconButton(
                    icon: const Icon(Icons.star_border_rounded),
                    tooltip: 'Predeterminar',
                    onPressed: () => notifier.setDefault(address.id),
                    color: AppColors.textTertiary,
                    iconSize: 22,
                  ),
                IconButton(
                  icon: const Icon(Icons.delete_outline_rounded),
                  tooltip: 'Eliminar',
                  onPressed: () => notifier.remove(address.id),
                  color: AppColors.error,
                  iconSize: 22,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AddAddressSheet extends ConsumerStatefulWidget {
  const _AddAddressSheet();

  @override
  ConsumerState<_AddAddressSheet> createState() => _AddAddressSheetState();
}

class _AddAddressSheetState extends ConsumerState<_AddAddressSheet> {
  final _aliasCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();

  @override
  void dispose() {
    _aliasCtrl.dispose();
    _addressCtrl.dispose();
    super.dispose();
  }

  void _save() {
    final alias = _aliasCtrl.text.trim();
    final address = _addressCtrl.text.trim();
    if (alias.isEmpty || address.isEmpty) return;
    ref.read(addressesProvider.notifier).add(
          alias: alias,
          fullAddress: address,
        );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppConstants.spacingM,
        right: AppConstants.spacingM,
        top: AppConstants.spacingM,
        bottom:
            MediaQuery.viewInsetsOf(context).bottom + AppConstants.spacingL,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Nueva dirección',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          TextField(
            controller: _aliasCtrl,
            decoration: const InputDecoration(
              labelText: 'Nombre',
              hintText: 'Ej: Casa, Oficina, Gym',
            ),
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: AppConstants.spacingS),
          TextField(
            controller: _addressCtrl,
            decoration: const InputDecoration(
              labelText: 'Dirección',
              hintText: 'Calle, número, barrio',
            ),
            textCapitalization: TextCapitalization.sentences,
          ),
          const SizedBox(height: AppConstants.spacingM),
          ElevatedButton(
            onPressed: _save,
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }
}

class _EmptyAddresses extends StatelessWidget {
  const _EmptyAddresses();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.location_off_rounded,
            size: 64,
            color: AppColors.textTertiary,
          ),
          SizedBox(height: AppConstants.spacingM),
          Text(
            'Sin direcciones guardadas',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: AppConstants.spacingXS),
          Text(
            'Agrega tu primera dirección de entrega',
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
