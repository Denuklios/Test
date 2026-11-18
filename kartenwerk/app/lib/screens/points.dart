import 'package:material_ui/material_ui.dart';

import '../models.dart';
import '../store.dart';
import '../ui.dart';
import 'home.dart';

/// Übersicht über alle Punkte, Meilen und Guthaben
class PointsTab extends StatelessWidget {
  const PointsTab({super.key});

  String _ago(WalletCard c) {
    if (!c.hasPoints) {
      final d = c.daysLeft;
      return d == null ? 'Guthaben' : 'Guthaben · ${daysText(d)}';
    }
    if (c.history.isEmpty) return 'noch nie aktualisiert';
    final d = DateTime.now().difference(c.history.last.at).inDays;
    if (d == 0) return 'heute aktualisiert';
    if (d == 1) return 'gestern aktualisiert';
    return 'vor $d Tagen aktualisiert';
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final list = store.pointCards;
        final totals = store.totalWorth();
        final pointSum = <String, double>{};
        for (final c in list) {
          if (c.points != null) pointSum[c.pointsUnit] = (pointSum[c.pointsUnit] ?? 0) + c.points!;
        }
        final stale = list.where((c) => c.hasPoints && (c.history.isEmpty || DateTime.now().difference(c.history.last.at).inDays > 30)).toList();
        return CustomScrollView(slivers: [
          SliverToBoxAdapter(
            child: Stack(children: [
              AspectRatio(aspectRatio: 1.55, child: Image.asset('assets/points.jpg', fit: BoxFit.cover, alignment: Alignment.centerLeft)),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.transparent, K.navy.withValues(alpha: .2), K.navy]),
                  ),
                ),
              ),
              Positioned(
                left: 20,
                right: 20,
                bottom: 14,
                child: SafeArea(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    const Text('GESAMTWERT', style: TextStyle(color: K.muted, letterSpacing: 1.6, fontSize: 12, fontWeight: FontWeight.w800)),
                    if (totals.isEmpty)
                      const Text('–', style: TextStyle(fontSize: 38, fontWeight: FontWeight.w900, color: K.gold))
                    else
                      for (final e in totals.entries)
                        Text(fmtMoney(e.value, e.key), style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: K.gold, height: 1.1)),
                    const SizedBox(height: 4),
                    Text(
                      pointSum.isEmpty ? 'Noch keine Punkte erfasst' : pointSum.entries.map((e) => '${fmtNum(e.value)} ${e.key}').join(' · '),
                      textAlign: TextAlign.right,
                      style: const TextStyle(color: K.text, fontWeight: FontWeight.w600),
                    ),
                  ]),
                ),
              ),
            ]),
          ),
          if (stale.isNotEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: K.teal.withValues(alpha: .12), borderRadius: BorderRadius.circular(14)),
                  child: Row(children: [
                    const Icon(Icons.tips_and_updates_rounded, color: K.teal),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text('${stale.length} ${stale.length == 1 ? 'Karte wurde' : 'Karten wurden'} über 30 Tage nicht aktualisiert. Screenshot aus der Anbieter-App genügt.',
                          style: const TextStyle(color: K.teal)),
                    ),
                  ]),
                ),
              ),
            ),
          if (list.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Center(
                  child: Text(
                    'Hier erscheinen alle Karten mit Punkten, Meilen oder Guthaben.\n\nLege eine Bonuskarte an (z. B. aus Vorlage) oder schalte bei einer Karte „Punkte“ ein.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: K.muted, height: 1.4),
                  ),
                ),
              ),
            )
          else ...[
            const SliverToBoxAdapter(child: SectionTitle('Deine Programme')),
            SliverList.builder(
              itemCount: list.length,
              itemBuilder: (context, i) {
                final c = list[i];
                final goal = c.pointsGoal;
                return Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: Card(
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => openCard(context, c),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(children: [
                          SizedBox(width: 74, child: CardFace(c, compact: true)),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                              const SizedBox(height: 2),
                              Text(_ago(c), style: const TextStyle(color: K.muted, fontSize: 12)),
                              if (goal != null && goal > 0 && c.points != null) ...[
                                const SizedBox(height: 6),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(6),
                                  child: LinearProgressIndicator(value: (c.points! / goal).clamp(0, 1), minHeight: 6, color: K.gold, backgroundColor: K.navy3),
                                ),
                              ],
                            ]),
                          ),
                          const SizedBox(width: 10),
                          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                            if (c.points != null)
                              Text(fmtNum(c.points), style: const TextStyle(color: K.gold, fontWeight: FontWeight.w900, fontSize: 20)),
                            if (c.points != null) Text(c.pointsUnit, style: const TextStyle(color: K.muted, fontSize: 11)),
                            if (c.totalWorth > 0)
                              Text('≈ ${fmtMoney(c.totalWorth, c.currency)}', style: const TextStyle(color: K.teal, fontSize: 12, fontWeight: FontWeight.w600)),
                          ]),
                        ]),
                      ),
                    ),
                  ),
                );
              },
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 120)),
          ],
        ]);
      },
    );
  }
}
