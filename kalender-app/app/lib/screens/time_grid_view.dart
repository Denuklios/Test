import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../holidays.dart';
import '../main.dart';
import '../models.dart';
import '../widgets/common.dart';

/// Tages- (days = 1) oder Wochenansicht (days = 7) mit Zeitraster
class TimeGridView extends StatefulWidget {
  final int days;
  final void Function(DateTime day) onDayTap;
  final void Function(DateTime at) onNewAt;
  final void Function(Occurrence o) onEventTap;
  const TimeGridView({super.key, required this.days, required this.onDayTap, required this.onNewAt, required this.onEventTap});
  @override
  State<TimeGridView> createState() => TimeGridViewState();
}

class TimeGridViewState extends State<TimeGridView> {
  static const _center = 5000;
  late final PageController _pc = PageController(initialPage: _center);
  late final DateTime _base;

  @override
  void initState() {
    super.initState();
    final t = dateOnly(DateTime.now());
    _base = widget.days == 7 ? DateTime(t.year, t.month, t.day - (t.weekday - 1)) : t;
  }

  DateTime startFor(int page) => DateTime(_base.year, _base.month, _base.day + (page - _center) * widget.days);
  void goToday() => _pc.animateToPage(_center, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);

  @override
  Widget build(BuildContext context) {
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.2,
      child: PageView.builder(
        controller: _pc,
        itemBuilder: (context, page) => ListenableBuilder(
          listenable: store,
          builder: (context, _) => _GridPage(start: startFor(page), days: widget.days, parent: widget),
        ),
      ),
    );
  }
}

class _GridPage extends StatefulWidget {
  final DateTime start;
  final int days;
  final TimeGridView parent;
  const _GridPage({required this.start, required this.days, required this.parent});
  @override
  State<_GridPage> createState() => _GridPageState();
}

class _GridPageState extends State<_GridPage> {
  static const hourH = 52.0;
  late final ScrollController _sc = ScrollController(initialScrollOffset: hourH * _firstHour());

  /// früheste Startzeit dieser Tage (höchstens 7 Uhr), damit Titel sichtbar sind
  double _firstHour() {
    final last = DateTime(widget.start.year, widget.start.month, widget.start.day + widget.days - 1);
    var h = 7.0;
    for (final o in store.occurrences(widget.start, last)) {
      if (o.ev.allDay || o.ev.isBirthday || o.firstDay != o.lastDay) continue;
      final x = o.start.hour + o.start.minute / 60 - 0.3;
      if (x < h) h = x;
    }
    return h.clamp(0.0, 7.0);
  }

  @override
  Widget build(BuildContext context) {
    final days = List.generate(widget.days, (i) => DateTime(widget.start.year, widget.start.month, widget.start.day + i));
    final end = days.last;
    final occ = store.occurrences(days.first, end);
    final allDay = occ.where((o) => o.ev.allDay || o.ev.isBirthday || o.firstDay != o.lastDay).toList();
    final timed = occ.where((o) => !allDay.contains(o)).toList();
    final today = dateOnly(DateTime.now());
    const timeW = 44.0;
    final single = widget.days == 1;
    final title = single
        ? DateFormat('EEEE, d. MMMM yyyy', 'de_DE').format(days.first)
        : 'KW ${isoWeekNumber(days.first)} · ${DateFormat('d. MMM', 'de_DE').format(days.first)} – ${DateFormat('d. MMM yyyy', 'de_DE').format(end)}';

    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(8, 10, 8, 6),
        child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800), textAlign: TextAlign.center),
      ),
      // Kopf: Wochentage
      if (!single)
        Row(children: [
          const SizedBox(width: timeW),
          ...days.map((d) {
            final isToday = d == today;
            final free = store.holidays.isFreeDay(d) || d.weekday == 7;
            return Expanded(
              child: InkWell(
                onTap: () => widget.parent.onDayTap(d),
                child: Column(children: [
                  Text(DateFormat('E', 'de_DE').format(d), style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  Container(
                    width: 30,
                    height: 30,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: isToday ? const Color(0xFF1976D2) : null, shape: BoxShape.circle),
                    child: Text('${d.day}',
                        style: TextStyle(fontWeight: FontWeight.bold, color: isToday ? Colors.white : (free ? Colors.red.shade700 : Colors.black87))),
                  ),
                ]),
              ),
            );
          }),
        ]),
      // Ganztägiges, Feiertage
      _AllDayBox(days: days, items: allDay, timeW: timeW, onTap: widget.parent.onEventTap),
      const Divider(height: 1),
      Expanded(
        child: SingleChildScrollView(
          controller: _sc,
          child: SizedBox(
            height: hourH * 24,
            child: LayoutBuilder(builder: (context, cons) {
              final colW = (cons.maxWidth - timeW) / widget.days;
              final children = <Widget>[];
              // Stundenlinien
              for (var h = 0; h < 24; h++) {
                children.add(Positioned(
                  top: h * hourH,
                  left: 0,
                  right: 0,
                  child: Row(children: [
                    SizedBox(
                      width: timeW,
                      child: Text(h == 0 ? '' : '${two(h)}:00', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                    ),
                    Expanded(child: Container(height: 1, color: Colors.grey.shade200)),
                  ]),
                ));
              }
              // Antippen: neuer Termin zu dieser Uhrzeit
              for (var i = 0; i < days.length; i++) {
                children.add(Positioned(
                  left: timeW + i * colW,
                  width: colW,
                  top: 0,
                  bottom: 0,
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onTapUp: (d) {
                      final h = (d.localPosition.dy / hourH).floor().clamp(0, 23);
                      widget.parent.onNewAt(DateTime(days[i].year, days[i].month, days[i].day, h));
                    },
                    child: Container(
                      decoration: BoxDecoration(
                        color: days[i] == today ? const Color(0x0D1976D2) : null,
                        border: Border(left: BorderSide(color: Colors.grey.shade200)),
                      ),
                    ),
                  ),
                ));
              }
              // Termine
              for (var i = 0; i < days.length; i++) {
                final d = days[i];
                final list = timed.where((o) => o.coversDay(d)).toList()..sort((a, b) => a.start.compareTo(b.start));
                // Überschneidungen nebeneinander
                final cols = <List<Occurrence>>[];
                final colOf = <Occurrence, int>{};
                for (final o in list) {
                  var c = 0;
                  while (c < cols.length && cols[c].any((x) => x.end.isAfter(o.start) && o.end.isAfter(x.start))) {
                    c++;
                  }
                  if (c == cols.length) cols.add([]);
                  cols[c].add(o);
                  colOf[o] = c;
                }
                for (final o in list) {
                  final s = o.start.isBefore(d) ? d : o.start;
                  final dayEnd = d.add(const Duration(days: 1));
                  final e = o.end.isAfter(dayEnd) ? dayEnd : o.end;
                  final top = (s.hour + s.minute / 60) * hourH;
                  final h = ((e.difference(s).inMinutes / 60) * hourH).clamp(22.0, hourH * 24);
                  final n = cols.length, c = colOf[o]!;
                  final colors = store.colorsFor(o.ev);
                  final w = colW / n;
                  children.add(Positioned(
                    left: timeW + i * colW + c * w + 1,
                    width: w - 2,
                    top: top + 1,
                    height: h - 2,
                    child: GestureDetector(
                      onTap: () => widget.parent.onEventTap(o),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        decoration: multiColorDecoration(colors),
                        child: Text(
                          single ? '${hhmm(o.start)} ${store.displayTitle(o)}${o.ev.location.isNotEmpty ? '\n📍 ${o.ev.location}' : ''}' : store.displayTitle(o),
                          overflow: TextOverflow.clip,
                          style: TextStyle(color: readableOn(colors), fontSize: 12, fontWeight: FontWeight.w600, height: 1.15),
                        ),
                      ),
                    ),
                  ));
                }
              }
              // Jetzt-Linie
              final now = DateTime.now();
              final ni = days.indexOf(dateOnly(now));
              if (ni >= 0) {
                children.add(Positioned(
                  left: timeW + ni * colW,
                  width: colW,
                  top: (now.hour + now.minute / 60) * hourH,
                  child: Container(height: 2, color: Colors.red),
                ));
              }
              return Stack(children: children);
            }),
          ),
        ),
      ),
    ]);
  }
}

class _AllDayBox extends StatelessWidget {
  final List<DateTime> days;
  final List<Occurrence> items;
  final double timeW;
  final void Function(Occurrence) onTap;
  const _AllDayBox({required this.days, required this.items, required this.timeW, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final hol = <(int, Holiday)>[];
    for (var i = 0; i < days.length; i++) {
      for (final h in store.holidays.forDay(days[i])) {
        hol.add((i, h));
      }
    }
    if (items.isEmpty && hol.isEmpty) return const SizedBox(height: 4);
    // Einträge sammeln: (Startspalte, Endspalte, Text, Farben, Antippen, Textfarbe)
    final items0 = <(int, int, String, List<Color>, VoidCallback?, Color?)>[];
    for (final (i, h) in hol) {
      items0.add((i, i, h.label, [h.free ? const Color(0xFF64B5F6) : const Color(0xFFBBDEFB)], null, h.free ? Colors.white : const Color(0xFF1565C0)));
    }
    for (final o in items) {
      final s = days.indexWhere((d) => o.coversDay(d));
      final e = days.lastIndexWhere((d) => o.coversDay(d));
      if (s < 0) continue;
      final colors = store.colorsFor(o.ev);
      items0.add((s, e, store.displayTitle(o), o.ev.isVacation ? colors.map((c) => c.withValues(alpha: 0.4)).toList() : colors, () => onTap(o),
          o.ev.isVacation ? Colors.black87 : null));
    }
    // platzsparend in Spuren verteilen
    final lanes = <List<bool>>[];
    final laneOf = <int>[];
    for (final it in items0) {
      var l = 0;
      while (true) {
        if (l >= lanes.length) lanes.add(List.filled(days.length, false));
        if (!List.generate(it.$2 - it.$1 + 1, (k) => lanes[l][it.$1 + k]).any((x) => x)) break;
        l++;
      }
      for (var k = it.$1; k <= it.$2; k++) {
        lanes[l][k] = true;
      }
      laneOf.add(l);
    }
    const laneH = 22.0;
    return LayoutBuilder(builder: (context, cons) {
      final colW = (cons.maxWidth - timeW) / days.length;
      final h = lanes.length * laneH + 4;
      return ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: laneH * 4 + 4),
        child: SingleChildScrollView(
          child: SizedBox(
            height: h,
            child: Stack(children: [
              for (var k = 0; k < items0.length; k++)
                Positioned(
                  left: timeW + items0[k].$1 * colW + 1,
                  width: (items0[k].$2 - items0[k].$1 + 1) * colW - 2,
                  top: 2 + laneOf[k] * laneH,
                  height: laneH - 2,
                  child: GestureDetector(
                    onTap: items0[k].$5,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      alignment: Alignment.centerLeft,
                      decoration: multiColorDecoration(items0[k].$4),
                      child: Text(items0[k].$3,
                          maxLines: 1,
                          overflow: TextOverflow.clip,
                          softWrap: false,
                          style: TextStyle(color: items0[k].$6 ?? readableOn(items0[k].$4), fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ),
            ]),
          ),
        ),
      );
    });
  }
}

/// Jahresübersicht: 12 kleine Monate, Tage mit Terminen markiert
class YearView extends StatelessWidget {
  final void Function(DateTime month) onMonthTap;
  const YearView({super.key, required this.onMonthTap});

  @override
  Widget build(BuildContext context) {
    final pc = PageController(initialPage: 100);
    final y0 = DateTime.now().year;
    return PageView.builder(
      controller: pc,
      itemBuilder: (context, page) {
        final y = y0 + page - 100;
        final occ = store.occurrences(DateTime(y, 1, 1), DateTime(y, 12, 31));
        final busy = <DateTime, Color>{};
        for (final o in occ) {
          for (var d = o.firstDay; !d.isAfter(o.lastDay); d = DateTime(d.year, d.month, d.day + 1)) {
            busy.putIfAbsent(d, () => store.colorsFor(o.ev).first);
          }
        }
        return ListView(padding: const EdgeInsets.all(8), children: [
          Center(child: Text('$y', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800))),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 0.85,
            children: List.generate(12, (m) => _MiniMonth(month: DateTime(y, m + 1), busy: busy, onTap: onMonthTap)),
          ),
        ]);
      },
    );
  }
}

class _MiniMonth extends StatelessWidget {
  final DateTime month;
  final Map<DateTime, Color> busy;
  final void Function(DateTime) onTap;
  const _MiniMonth({required this.month, required this.busy, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final lead = first.weekday - 1;
    final len = DateTime(month.year, month.month + 1, 0).day;
    final today = dateOnly(DateTime.now());
    return InkWell(
      onTap: () => onTap(month),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Column(children: [
          Text(DateFormat('MMMM', 'de_DE').format(month), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
          const SizedBox(height: 2),
          Expanded(
            child: GridView.count(
              crossAxisCount: 7,
              physics: const NeverScrollableScrollPhysics(),
              children: List.generate(lead + len, (i) {
                if (i < lead) return const SizedBox();
                final d = DateTime(month.year, month.month, i - lead + 1);
                final c = busy[d];
                final hol = store.holidays.isFreeDay(d) || d.weekday == 7;
                return Container(
                  margin: const EdgeInsets.all(0.5),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: d == today ? const Color(0xFF1976D2) : c?.withValues(alpha: 0.35),
                    shape: BoxShape.circle,
                  ),
                  child: Text('${d.day}',
                      style: TextStyle(fontSize: 9, color: d == today ? Colors.white : (hol ? Colors.red.shade700 : Colors.black87))),
                );
              }),
            ),
          ),
        ]),
      ),
    );
  }
}
