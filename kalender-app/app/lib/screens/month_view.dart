import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../holidays.dart';
import '../main.dart';
import '../models.dart';
import '../widgets/common.dart';

/// Ein Eintrag, der in der Wochenzeile als Balken gezeichnet wird
class _Bar {
  final int startCol, endCol; // 0..6
  final String text;
  final List<Color> colors;
  final double opacity;
  final Color? textColor;
  final Occurrence? occ;
  final bool italic;
  int lane = 0;
  _Bar(this.startCol, this.endCol, this.text, this.colors, {this.opacity = 1, this.textColor, this.occ, this.italic = false});
}

class MonthView extends StatefulWidget {
  final void Function(DateTime day) onDayTap;
  final void Function(DateTime day) onDayLongPress;
  final void Function(Occurrence o) onEventTap;
  final void Function(DateTime month)? onMonthChanged;
  const MonthView({super.key, required this.onDayTap, required this.onDayLongPress, required this.onEventTap, this.onMonthChanged});

  @override
  State<MonthView> createState() => MonthViewState();
}

class MonthViewState extends State<MonthView> {
  static const _center = 1200;
  late final PageController _pc;
  late final DateTime _base;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _base = DateTime(now.year, now.month);
    _pc = PageController(initialPage: _center);
  }

  DateTime monthFor(int page) => DateTime(_base.year, _base.month + page - _center);

  void goToday() => _pc.animateToPage(_center, duration: const Duration(milliseconds: 350), curve: Curves.easeOut);

  void goTo(DateTime d) {
    final p = _center + (d.year - _base.year) * 12 + d.month - _base.month;
    _pc.jumpToPage(p);
  }

  @override
  Widget build(BuildContext context) {
    return PageView.builder(
      controller: _pc,
      onPageChanged: (p) => widget.onMonthChanged?.call(monthFor(p)),
      itemBuilder: (context, page) => ListenableBuilder(
        listenable: store,
        builder: (context, _) => _MonthPage(
          month: monthFor(page),
          onDayTap: widget.onDayTap,
          onDayLongPress: widget.onDayLongPress,
          onEventTap: widget.onEventTap,
        ),
      ),
    );
  }
}

class _MonthPage extends StatelessWidget {
  final DateTime month;
  final void Function(DateTime) onDayTap;
  final void Function(DateTime) onDayLongPress;
  final void Function(Occurrence) onEventTap;
  const _MonthPage({required this.month, required this.onDayTap, required this.onDayLongPress, required this.onEventTap});

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final gridStart = DateTime(first.year, first.month, 1 - (first.weekday - 1));
    final last = DateTime(month.year, month.month + 1, 0);
    final weeks = ((last.difference(gridStart).inHours / 24).round() ~/ 7) + 1;
    final gridEnd = DateTime(gridStart.year, gridStart.month, gridStart.day + weeks * 7 - 1);
    final occ = store.occurrences(gridStart, gridEnd);
    final kw = store.showWeekNumbers ? 26.0 : 0.0;
    const days = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.'];

    return Column(children: [
      Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 4),
        child: Text(DateFormat('MMMM yyyy', 'de_DE').format(month), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
      ),
      Row(children: [
        SizedBox(width: kw),
        ...days.map((d) => Expanded(
              child: Center(child: Text(d, style: TextStyle(color: Colors.grey.shade600, fontSize: 13))),
            )),
      ]),
      const SizedBox(height: 4),
      Container(height: 3, color: Colors.grey.shade500),
      Expanded(
        child: Column(
          children: List.generate(weeks, (w) {
            final ws = DateTime(gridStart.year, gridStart.month, gridStart.day + 7 * w);
            return Expanded(child: _WeekRow(weekStart: ws, month: month, occ: occ, kwWidth: kw, onDayTap: onDayTap, onDayLongPress: onDayLongPress, onEventTap: onEventTap));
          }),
        ),
      ),
    ]);
  }
}

class _WeekRow extends StatelessWidget {
  final DateTime weekStart;
  final DateTime month;
  final List<Occurrence> occ;
  final double kwWidth;
  final void Function(DateTime) onDayTap;
  final void Function(DateTime) onDayLongPress;
  final void Function(Occurrence) onEventTap;
  const _WeekRow({
    required this.weekStart,
    required this.month,
    required this.occ,
    required this.kwWidth,
    required this.onDayTap,
    required this.onDayLongPress,
    required this.onEventTap,
  });

  @override
  Widget build(BuildContext context) {
    final weekEnd = DateTime(weekStart.year, weekStart.month, weekStart.day + 6);
    final today = dateOnly(DateTime.now());
    final dayList = List.generate(7, (i) => DateTime(weekStart.year, weekStart.month, weekStart.day + i));
    int col(DateTime d) => (dateOnly(d).difference(weekStart).inHours / 24).round().clamp(0, 6);

    // Balken sammeln: Feiertage zuerst, dann Termine
    final bars = <_Bar>[];
    for (final d in dayList) {
      for (final h in store.holidays.forDay(d)) {
        bars.add(_Bar(col(d), col(d), h.label, [h.free ? const Color(0xFF64B5F6) : const Color(0xFFBBDEFB)],
            textColor: h.free ? Colors.white : const Color(0xFF1565C0)));
      }
    }
    for (final o in occ) {
      if (o.lastDay.isBefore(weekStart) || o.firstDay.isAfter(weekEnd)) continue;
      final s = o.firstDay.isBefore(weekStart) ? 0 : col(o.firstDay);
      final e = o.lastDay.isAfter(weekEnd) ? 6 : col(o.lastDay);
      final colors = store.colorsFor(o.ev);
      final vac = o.ev.isVacation;
      bars.add(_Bar(s, e, store.displayTitle(o), colors, opacity: vac ? 0.35 : 1, occ: o, italic: vac));
    }
    // Spuren vergeben
    final lanes = <List<bool>>[];
    for (final b in bars) {
      var l = 0;
      while (true) {
        if (l >= lanes.length) lanes.add(List.filled(7, false));
        var free = true;
        for (var c = b.startCol; c <= b.endCol; c++) {
          if (lanes[l][c]) {
            free = false;
            break;
          }
        }
        if (free) break;
        l++;
      }
      for (var c = b.startCol; c <= b.endCol; c++) {
        lanes[l][c] = true;
      }
      b.lane = l;
    }

    return LayoutBuilder(builder: (context, cons) {
      final w = cons.maxWidth - kwWidth;
      final dw = w / 7;
      const top = 22.0, gap = 2.0;
      final avail = cons.maxHeight - top - 2;
      // Wenig los in der Woche? Dann höhere Balken mit zwei Zeilen
      final laneH = lanes.isEmpty ? 19.0 : (avail / lanes.length - gap).clamp(19.0, 34.0);
      final twoLines = laneH >= 30;
      final maxLanes = (avail / (laneH + gap)).floor().clamp(1, 20);
      final hiddenPerDay = List.filled(7, 0);
      for (final b in bars) {
        if (b.lane >= maxLanes - (lanes.length > maxLanes ? 1 : 0)) {
          for (var c = b.startCol; c <= b.endCol; c++) {
            hiddenPerDay[c]++;
          }
        }
      }
      final visibleLanes = lanes.length > maxLanes ? maxLanes - 1 : maxLanes;

      return Stack(children: [
        // Tageszellen
        Row(children: [
          if (kwWidth > 0)
            Container(
              width: kwWidth,
              color: Colors.grey.shade200,
              alignment: Alignment.center,
              child: Text('${isoWeekNumber(weekStart)}', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ),
          ...dayList.map((d) {
            final inMonth = d.month == month.month;
            final school = store.school.forDay(d);
            final isToday = d == today;
            final free = store.holidays.isFreeDay(d) || d.weekday == 7;
            Color bg = inMonth ? Colors.white : Colors.grey.shade100;
            if (school.isNotEmpty && inMonth) {
              bg = school.any((s) => s.country == 'DE') ? const Color(0xFFFFF8E1) : const Color(0xFFE8F5E9);
            }
            if (isToday) bg = const Color(0xFFBBDEFB);
            final hidden = hiddenPerDay[col(d)];
            return Expanded(
              child: InkWell(
                onTap: () => onDayTap(d),
                onLongPress: () => onDayLongPress(d),
                child: Container(
                  decoration: BoxDecoration(
                    color: bg,
                    border: Border(right: BorderSide(color: Colors.grey.shade300, width: 0.5), bottom: BorderSide(color: Colors.grey.shade300, width: 0.5)),
                  ),
                  padding: const EdgeInsets.only(right: 4, top: 2, left: 3),
                  alignment: Alignment.topRight,
                  child: Row(children: [
                    if (school.isNotEmpty && inMonth)
                      Icon(Icons.backpack_outlined, size: 11, color: Colors.brown.shade300),
                    if (hidden > 0) Text('+$hidden', style: const TextStyle(color: Colors.blue, fontSize: 12, fontWeight: FontWeight.bold)),
                    const Spacer(),
                    Text(
                      '${d.day}',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: isToday ? FontWeight.w900 : FontWeight.w500,
                        color: !inMonth ? Colors.grey.shade400 : (free ? Colors.red.shade700 : Colors.grey.shade800),
                      ),
                    ),
                  ]),
                ),
              ),
            );
          }),
        ]),
        // Balken
        ...bars.where((b) => b.lane < visibleLanes).map((b) {
          final left = kwWidth + b.startCol * dw + 2;
          final width = (b.endCol - b.startCol + 1) * dw - 4;
          final tc = b.textColor ?? readableOn(b.colors, opacity: b.opacity);
          return Positioned(
            left: left,
            width: width,
            top: top + b.lane * (laneH + gap),
            height: laneH,
            child: GestureDetector(
              onTap: b.occ != null ? () => onEventTap(b.occ!) : () => onDayTap(dayList[b.startCol]),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                alignment: Alignment.centerLeft,
                decoration: b.occ?.ev.isVacation == true
                    ? vacationDecoration(b.colors)
                    : multiColorDecoration(b.colors, opacity: b.opacity),
                child: Text(
                  b.text,
                  maxLines: twoLines ? 2 : 1,
                  overflow: TextOverflow.clip,
                  softWrap: twoLines,
                  style: TextStyle(color: tc, fontSize: 12, fontWeight: FontWeight.w600, fontStyle: b.italic ? FontStyle.italic : null, height: 1.1),
                ),
              ),
            ),
          );
        }),
      ]);
    });
  }
}
