import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Servicio centralizado de almacenamiento local.
///
/// - [FlutterSecureStorage]: para datos sensibles (JWT tokens).
/// - [SharedPreferences]: para configuración de la app (preferencias).
///
/// El servicio es un singleton inicializado una sola vez mediante [init].
/// Llama a [init] en el bootstrap de la app (antes de [runApp]) para
/// garantizar que [_prefs] esté listo antes de cualquier lectura.
class StorageService {
  StorageService._();
  static final StorageService _instance = StorageService._();

  /// Returns the singleton instance.
  factory StorageService() => _instance;

  // ── Secure storage ───────────────────────────────────────────────────────

  static const _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  // ── Shared preferences ───────────────────────────────────────────────────

  late SharedPreferences _prefs;
  bool _initialized = false;

  /// Must be awaited once during app startup before any [readBool],
  /// [readString], or [readInt] calls.
  Future<void> init() async {
    if (_initialized) return;
    _prefs = await SharedPreferences.getInstance();
    _initialized = true;
  }

  /// Throws a [StateError] if [init] has not been called yet.
  void _assertInitialized() {
    if (!_initialized) {
      throw StateError(
        'StorageService.init() must be awaited before accessing SharedPreferences.',
      );
    }
  }

  // ── SECURE STORAGE (tokens / sensitive data) ─────────────────────────────

  /// Persists [value] under [key] in encrypted storage.
  Future<void> saveSecure(String key, String value) async {
    await _secureStorage.write(key: key, value: value);
  }

  /// Reads the value stored under [key], or `null` if absent.
  Future<String?> readSecure(String key) async {
    return _secureStorage.read(key: key);
  }

  /// Deletes the entry for [key] from encrypted storage.
  Future<void> deleteSecure(String key) async {
    await _secureStorage.delete(key: key);
  }

  /// Wipes every entry from encrypted storage.
  Future<void> clearAllSecure() async {
    await _secureStorage.deleteAll();
  }

  // ── SHARED PREFERENCES (app configuration / non-sensitive) ───────────────

  /// Persists a boolean [value] under [key].
  Future<void> saveBool(String key, bool value) async {
    _assertInitialized();
    await _prefs.setBool(key, value);
  }

  /// Reads the boolean stored under [key], or `null` if absent.
  bool? readBool(String key) {
    _assertInitialized();
    return _prefs.getBool(key);
  }

  /// Persists a string [value] under [key].
  Future<void> saveString(String key, String value) async {
    _assertInitialized();
    await _prefs.setString(key, value);
  }

  /// Reads the string stored under [key], or `null` if absent.
  String? readString(String key) {
    _assertInitialized();
    return _prefs.getString(key);
  }

  /// Persists an integer [value] under [key].
  Future<void> saveInt(String key, int value) async {
    _assertInitialized();
    await _prefs.setInt(key, value);
  }

  /// Reads the integer stored under [key], or `null` if absent.
  int? readInt(String key) {
    _assertInitialized();
    return _prefs.getInt(key);
  }

  /// Removes the entry for [key] from SharedPreferences.
  Future<void> remove(String key) async {
    _assertInitialized();
    await _prefs.remove(key);
  }

  /// Clears all SharedPreferences entries.
  ///
  /// Does NOT touch secure storage — call [clearAllSecure] separately
  /// if you need a full logout wipe.
  Future<void> clearPrefs() async {
    _assertInitialized();
    await _prefs.clear();
  }
}
