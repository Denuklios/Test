import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_model.dart';
import 'account_screen.dart';
import 'admin/plan_screen.dart';
import 'admin/team_admin_screen.dart';
import 'admin/templates_screen.dart';
import 'emp/calendar_screen.dart';
import 'emp/hours_screen.dart';
import 'emp/team_screen.dart';
import 'emp/today_screen.dart';

class _Tab {
  final String label;
  final IconData icon;
  final IconData active;
  final Widget page;
  const _Tab(this.label, this.icon, this.active, this.page);
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final admin = context.select<AppModel, bool>((m) => m.state?.me.isAdmin ?? false);
    final tabs = admin
        ? const [
            _Tab('Planen', Icons.edit_calendar_outlined, Icons.edit_calendar, AdminPlanScreen()),
            _Tab('Übersicht', Icons.groups_outlined, Icons.groups, TeamScreen()),
            _Tab('Team', Icons.badge_outlined, Icons.badge, TeamAdminScreen()),
            _Tab('Dienste', Icons.palette_outlined, Icons.palette, TemplatesScreen()),
            _Tab('Konto', Icons.person_outline, Icons.person, AccountScreen()),
          ]
        : const [
            _Tab('Heute', Icons.today_outlined, Icons.today, TodayScreen()),
            _Tab('Kalender', Icons.calendar_month_outlined, Icons.calendar_month, CalendarScreen()),
            _Tab('Team', Icons.groups_outlined, Icons.groups, TeamScreen()),
            _Tab('Stunden', Icons.schedule_outlined, Icons.schedule, HoursScreen()),
            _Tab('Konto', Icons.person_outline, Icons.person, AccountScreen()),
          ];
    if (_index >= tabs.length) _index = 0;
    return Scaffold(
      body: IndexedStack(index: _index, children: [for (final t in tabs) t.page]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final t in tabs) NavigationDestination(icon: Icon(t.icon), selectedIcon: Icon(t.active), label: t.label),
        ],
      ),
    );
  }
}
