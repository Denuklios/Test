import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_model.dart';
import '../core/dates.dart';
import '../core/models.dart';
import 'theme.dart';

void showMessage(BuildContext context, String text, {bool error = false, SnackBarAction? action}) {
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(text),
    backgroundColor: error ? Theme.of(context).colorScheme.error : null,
    duration: Duration(seconds: error ? 6 : 2),
    action: action,
  ));
}

Future<bool> confirm(BuildContext context, String title, String text, {String ok = 'Ja', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: Text(text),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Abbrechen')),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error) : null,
          onPressed: () => Navigator.pop(c, true),
          child: Text(ok),
        ),
      ],
    ),
  );
  return r ?? false;
}

/// Farbiger Dienst-Baustein, wie die „Pills“ der Weboberfläche.
class ShiftPill extends StatelessWidget {
  final Shift? shift;
  final bool dense;
  final String emptyText;

  const ShiftPill({super.key, required this.shift, this.dense = false, this.emptyText = 'Nichts eingetragen'});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final sh = shift;
    if (sh == null) {
      return Padding(
        padding: EdgeInsets.symmetric(vertical: dense ? 6 : 10),
        child: Text(emptyText, style: t.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.outline)),
      );
    }
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: dense ? 6 : 10),
      decoration: BoxDecoration(
        color: tint(context, sh.colorValue),
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: sh.colorValue, width: 5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(children: [
            Flexible(child: Text(sh.name, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
            if (sh.hasTimes) ...[
              const SizedBox(width: 8),
              Text('${sh.start}–${sh.end}', style: t.bodyMedium),
            ],
            if (sh.custom && sh.hasTimes)
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Tooltip(message: 'abweichende Zeit', child: Text('*', style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w800))),
              ),
          ]),
          if (sh.note != null) ...[
            const SizedBox(height: 2),
            Row(children: [
              const Icon(Icons.sticky_note_2_outlined, size: 14),
              const SizedBox(width: 4),
              Flexible(child: Text(sh.note!, style: t.bodySmall)),
            ]),
          ],
        ],
      ),
    );
  }
}

/// Hinweis „Offline – Stand von …“ bzw. nicht gesendete Admin-Änderungen.
class SyncBanner extends StatelessWidget {
  const SyncBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final cs = Theme.of(context).colorScheme;
    final items = <Widget>[];
    if (m.hasPending) {
      items.add(_bar(
        context,
        cs.errorContainer,
        cs.onErrorContainer,
        Icons.cloud_upload_outlined,
        '${m.pendingCount} Änderung${m.pendingCount == 1 ? '' : 'en'} noch nicht gesendet',
        TextButton(
          onPressed: () async {
            final err = await m.retryPending();
            if (context.mounted) showMessage(context, err ?? 'Gespeichert ✓', error: err != null);
          },
          child: const Text('Senden'),
        ),
      ));
    }
    if (m.offline || m.syncError != null) {
      final when = m.lastSync != null ? 'Stand: ${dateTimeStamp(m.lastSync!)}' : 'Noch kein Stand gespeichert';
      items.add(_bar(context, cs.secondaryContainer, cs.onSecondaryContainer, m.offline ? Icons.cloud_off : Icons.error_outline,
          m.offline ? 'Offline · $when' : '${m.syncError} · $when', null));
    }
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(children: items);
  }

  Widget _bar(BuildContext context, Color bg, Color fg, IconData icon, String text, Widget? action) => Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(icon, size: 18, color: fg),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: fg, fontSize: 13))),
          ?action,
        ]),
      );
}

class SectionTitle extends StatelessWidget {
  final String text;
  const SectionTitle(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
        child: Text(text.toUpperCase(),
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.outline,
                )),
      );
}

class EmptyHint extends StatelessWidget {
  final String text;
  final IconData icon;
  const EmptyHint(this.text, {super.key, this.icon = Icons.info_outline});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          Icon(icon, size: 40, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 8),
          Text(text, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
        ]),
      );
}

/// Kompakte Zelle für Wochenmatrizen: Ganztägiges als Kürzel, sonst Beginn/Ende.
class MatrixCell extends StatelessWidget {
  final Shift? shift;
  final bool selected;
  final bool highlight;
  final String emptyMark;

  const MatrixCell({super.key, this.shift, this.selected = false, this.highlight = false, this.emptyMark = '·'});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final sh = shift;
    Widget child;
    BoxDecoration deco;
    if (sh == null) {
      child = Text(emptyMark, style: TextStyle(color: cs.outline, fontSize: 14));
      deco = BoxDecoration(borderRadius: BorderRadius.circular(8));
    } else {
      final style = TextStyle(fontSize: 10.5, height: 1.15, fontWeight: FontWeight.w600, color: cs.onSurface);
      child = sh.hasTimes
          ? Column(mainAxisSize: MainAxisSize.min, children: [
              Text(_short(sh.start), style: style),
              Text(_short(sh.end), style: style),
            ])
          : Text(sh.name.length > 5 ? sh.name.substring(0, 4) : sh.name,
              style: style.copyWith(fontSize: 10, fontWeight: FontWeight.w700), overflow: TextOverflow.clip, maxLines: 1);
      deco = BoxDecoration(
        color: tint(context, sh.colorValue, 0.28, 0.40),
        borderRadius: BorderRadius.circular(8),
        border: Border(left: BorderSide(color: sh.colorValue, width: 3)),
      );
    }
    return Container(
      height: 40,
      margin: const EdgeInsets.all(1.5),
      decoration: deco.copyWith(
        border: selected ? Border.all(color: cs.primary, width: 2.5) : deco.border,
        boxShadow: highlight ? [BoxShadow(color: cs.primary.withValues(alpha: 0.35), blurRadius: 0, spreadRadius: 1.5)] : null,
      ),
      alignment: Alignment.center,
      child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
        child,
        if (sh?.note != null) Positioned(right: -2, top: -4, child: Icon(Icons.circle, size: 6, color: cs.primary)),
      ]),
    );
  }

  static String _short(String hm) => hm.startsWith('0') ? hm.substring(1) : hm;
}
