import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_model.dart';
import '../core/api.dart';
import 'theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _server;
  late final TextEditingController _user;
  final _pw = TextEditingController();
  bool _busy = false;
  bool _showServer = false;
  bool _hidePw = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    final m = context.read<AppModel>();
    _server = TextEditingController(text: m.server);
    _user = TextEditingController(text: m.lastUser);
    // Beim allerersten Start die Server-Adresse gleich zeigen
    _showServer = m.store.server == null;
    _error = m.loginMessage;
  }

  @override
  void dispose() {
    _server.dispose();
    _user.dispose();
    _pw.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_user.text.trim().isEmpty || _pw.text.isEmpty) {
      setState(() => _error = 'Bitte Vorname und Passwort eingeben.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AppModel>().login(_server.text, _user.text, _pw.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'Anmeldung fehlgeschlagen.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Center(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(color: brandOrange, borderRadius: BorderRadius.circular(22)),
                      child: const Icon(Icons.calendar_month, size: 40, color: Colors.white),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Dienstplan', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
                  Text('Sonderpreis Baumarkt', textAlign: TextAlign.center, style: TextStyle(color: cs.outline)),
                  const SizedBox(height: 28),
                  if (_showServer) ...[
                    TextField(
                      controller: _server,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Server-Adresse',
                        helperText: 'Adresse des Dienstplans, nur https://',
                        prefixIcon: Icon(Icons.dns_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                    controller: _user,
                    autofillHints: const [AutofillHints.username],
                    autocorrect: false,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Vorname', prefixIcon: Icon(Icons.person_outline)),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _pw,
                    obscureText: _hidePw,
                    autofillHints: const [AutofillHints.password],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      labelText: 'Passwort',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        tooltip: _hidePw ? 'Passwort zeigen' : 'Passwort verbergen',
                        icon: Icon(_hidePw ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                        onPressed: () => setState(() => _hidePw = !_hidePw),
                      ),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: cs.error, fontWeight: FontWeight.w600)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                        : const Text('Anmelden'),
                  ),
                  if (!_showServer)
                    TextButton.icon(
                      onPressed: () => setState(() => _showServer = true),
                      icon: const Icon(Icons.dns_outlined, size: 18),
                      label: const Text('Server-Adresse ändern'),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    'Admin meldet sich mit „admin“ an. Beim ersten Login vergibst du ein eigenes Passwort.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.outline),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Neues Passwort erzwingen (mustChange) oder freiwillig ändern.
class PasswordForm extends StatefulWidget {
  final bool forced;
  final VoidCallback? onDone;
  const PasswordForm({super.key, this.forced = false, this.onDone});

  @override
  State<PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends State<PasswordForm> {
  final _old = TextEditingController();
  final _a = TextEditingController();
  final _b = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _old.dispose();
    _a.dispose();
    _b.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final m = context.read<AppModel>();
    final needOld = !(widget.forced && m.hasLoginPassword);
    if (needOld && _old.text.isEmpty) return setState(() => _error = 'Bitte das aktuelle Passwort eingeben.');
    if (_a.text.length < 6) return setState(() => _error = 'Das neue Passwort braucht mindestens 6 Zeichen.');
    if (_a.text != _b.text) return setState(() => _error = 'Die beiden Passwörter sind nicht gleich.');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await m.changePassword(needOld ? _old.text : null, _a.text);
      _old.clear();
      _a.clear();
      _b.clear();
      widget.onDone?.call();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final needOld = !(widget.forced && m.hasLoginPassword);
    return AutofillGroup(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (needOld) ...[
          TextField(
            controller: _old,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(labelText: widget.forced ? 'Start-Passwort' : 'Aktuelles Passwort'),
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          controller: _a,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          decoration: const InputDecoration(labelText: 'Neues Passwort (mind. 6 Zeichen)'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _b,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          onSubmitted: (_) => _save(),
          decoration: const InputDecoration(labelText: 'Wiederholen'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.w600)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
              : const Text('Passwort speichern'),
        ),
      ]),
    );
  }
}

class ForcePasswordScreen extends StatelessWidget {
  const ForcePasswordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Icon(Icons.key, size: 48, color: brandOrange),
                const SizedBox(height: 12),
                Text('Neues Passwort', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text('Hallo ${m.state?.me.name ?? ''}! Bitte wähle jetzt dein eigenes Passwort.', textAlign: TextAlign.center),
                const SizedBox(height: 24),
                const PasswordForm(forced: true),
                TextButton(onPressed: () => m.logout(), child: const Text('Abmelden')),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
