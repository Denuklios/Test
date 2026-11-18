import 'package:material_ui/material_ui.dart';

import '../models.dart';
import '../store.dart';
import '../ui.dart';
import 'add.dart';
import 'card_view.dart';
import 'points.dart';
import 'settings.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int tab = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: tab, children: const [WalletTab(), PointsTab(), SettingsTab()]),
      floatingActionButton: tab == 2
          ? null
          : FloatingActionButton.extended(
              backgroundColor: K.gold,
              foregroundColor: K.navy,
              onPressed: () => showAddSheet(context),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Karte', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() => tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.wallet_outlined), selectedIcon: Icon(Icons.wallet_rounded, color: K.gold), label: 'Wallet'),
          NavigationDestination(icon: Icon(Icons.stars_outlined), selectedIcon: Icon(Icons.stars_rounded, color: K.gold), label: 'Punkte'),
          NavigationDestination(icon: Icon(Icons.tune_outlined), selectedIcon: Icon(Icons.tune_rounded, color: K.gold), label: 'Mehr'),
        ],
      ),
    );
  }
}

void openCard(BuildContext context, WalletCard c) =>
    Navigator.push(context, PageRouteBuilder(
      transitionDuration: const Duration(milliseconds: 380),
      pageBuilder: (_, a, _) => FadeTransition(opacity: a, child: CardViewScreen(cardId: c.id)),
    ));

class WalletTab extends StatefulWidget {
  const WalletTab({super.key});
  @override
  State<WalletTab> createState() => _WalletTabState();
}

class _WalletTabState extends State<WalletTab> {
  String q = '';
  CardKind? filter;
  bool stack = true;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        if (store.cards.isEmpty) return const _Empty();
        var list = store.sorted(q);
        if (filter != null) list = list.where((c) => c.kind == filter).toList();
        final kinds = {for (final c in store.cards) c.kind}.toList()..sort((a, b) => a.index.compareTo(b.index));
        final soon = store.expiringSoon(days: 14);
        return CustomScrollView(slivers: [
          SliverAppBar(
            floating: true,
            snap: true,
            titleSpacing: 20,
            title: Row(children: [
              ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.asset('assets/icon.png', width: 30, height: 30)),
              const SizedBox(width: 10),
              const Text('Kartenwerk', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: .3)),
            ]),
            actions: [
              IconButton(
                tooltip: stack ? 'Raster' : 'Stapel',
                onPressed: () => setState(() => stack = !stack),
                icon: Icon(stack ? Icons.grid_view_rounded : Icons.view_day_rounded),
              ),
            ],
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: TextField(
                onChanged: (v) => setState(() => q = v),
                decoration: InputDecoration(
                  hintText: '${store.cards.length} Karten durchsuchen …',
                  prefixIcon: const Icon(Icons.search_rounded),
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ),
          if (kinds.length > 1)
            SliverToBoxAdapter(
              child: SizedBox(
                height: 44,
                child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(label: const Text('Alle'), selected: filter == null, onSelected: (_) => setState(() => filter = null)),
                  ),
                  for (final k in kinds)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: ChoiceChip(
                        avatar: Icon(k.icon, size: 16),
                        label: Text(k.label.split(' ').first),
                        selected: filter == k,
                        onSelected: (s) => setState(() => filter = s ? k : null),
                      ),
                    ),
                ]),
              ),
            ),
          if (soon.isNotEmpty && q.isEmpty && filter == null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: Material(
                  color: K.coral.withValues(alpha: .14),
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => openCard(context, soon.first),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(children: [
                        const Icon(Icons.timer_rounded, color: K.coral),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            soon.length == 1
                                ? '${soon.first.name}: ${daysText(soon.first.daysLeft!)}'
                                : '${soon.length} Karten laufen bald ab – zuerst ${soon.first.name} (${daysText(soon.first.daysLeft!)})',
                            style: const TextStyle(color: K.coral, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
          if (list.isEmpty)
            const SliverFillRemaining(hasScrollBody: false, child: Center(child: Text('Nichts gefunden', style: TextStyle(color: K.muted))))
          else if (stack)
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
              sliver: SliverToBoxAdapter(child: _CardStack(list)),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(14, 16, 14, 120),
              sliver: SliverGrid.count(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.586,
                children: [for (final c in list) GestureDetector(onTap: () => openCard(context, c), child: CardFace(c, compact: true))],
              ),
            ),
        ]);
      },
    );
  }
}

/// Karten überlappend wie in einer echten Geldbörse
class _CardStack extends StatelessWidget {
  final List<WalletCard> cards;
  const _CardStack(this.cards);

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final h = box.maxWidth / 1.586;
      const peek = 74.0;
      final total = h + peek * (cards.length - 1);
      return SizedBox(
        height: total,
        child: Stack(children: [
          for (var i = 0; i < cards.length; i++)
            Positioned(
              top: i * peek,
              left: 0,
              right: 0,
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 30, end: 0),
                duration: Duration(milliseconds: 350 + i * 50),
                curve: Curves.easeOutCubic,
                builder: (_, dy, child) => Transform.translate(offset: Offset(0, dy), child: child),
                child: GestureDetector(
                  onTap: () => openCard(context, cards[i]),
                  child: Hero(tag: 'card-${cards[i].id}', child: CardFace(cards[i])),
                ),
              ),
            ),
        ]),
      );
    });
  }
}

class _Empty extends StatelessWidget {
  const _Empty();
  @override
  Widget build(BuildContext context) => SafeArea(
        child: ListView(padding: const EdgeInsets.all(28), children: [
          const SizedBox(height: 20),
          ClipRRect(borderRadius: BorderRadius.circular(28), child: Image.asset('assets/empty.jpg')),
          const SizedBox(height: 26),
          const Text('Alle Karten an einem Ort', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          const Text(
            'Kundenkarten, Bonuspunkte, Gutscheine, Tickets, Boardingpässe, Mitgliedsausweise – scannen, fotografieren oder als Wallet-Pass importieren.',
            textAlign: TextAlign.center,
            style: TextStyle(color: K.muted, fontSize: 15, height: 1.4),
          ),
          const SizedBox(height: 26),
          FilledButton.icon(onPressed: () => showAddSheet(context), icon: const Icon(Icons.add_rounded), label: const Text('Erste Karte hinzufügen')),
        ]),
      );
}
