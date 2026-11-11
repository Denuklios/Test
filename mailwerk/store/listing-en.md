# Google Play listing (English, default language) – copy & paste

**App name (max. 30 chars):**
Mailwerk – Private Email

**Short description (max. 80 chars):**
All your inboxes in one app: smart inbox, push, rules & spam blocking – private.

**Full description:**
Mailwerk brings all your email accounts together in one fast, clean app – no ad networks, no tracking, no cloud.

★ ALL ACCOUNTS, ONE INBOX
Gmail, Outlook, iCloud, Yahoo, GMX, Fastmail, IONOS, one.com, Posteo, mailbox.org and any custom domain with IMAP.
Server settings are detected automatically.

★ SMART INBOX
Mail is sorted automatically into Important, Newsletters and Notifications – so you see messages from real people first.

★ INSTANT NOTIFICATIONS
Real push via IMAP IDLE: new mail within seconds – optionally only for important messages.

★ GET THINGS DONE
Snooze, send later, undo send, follow-up reminders when nobody replies, pins, swipe gestures,
quick-reply templates, conversation view and full-text search.

★ RULES & SPAM PROTECTION
Desktop-style rules: move, flag, forward, categorize. Block senders or entire domains –
their mail never reaches your inbox again.

★ OUT-OF-OFFICE & SIGNATURES
Automatic replies with a date range. Signatures with formatting and your logo, plus a separate signature for replies.

★ PRIVACY FIRST
Tracking pixels are blocked, remote images only load when you allow it, passwords are encrypted in the Android Keystore,
one-tap unsubscribe from newsletters. Your data stays on your device and with your email provider.

**Category:** Communication
**Contains ads:** Yes – a small “Powered by” sponsor note on the start screen (no ad networks, no tracking, no data collected)  ·  **In-app purchases:** No

## Data safety form (Play Console)
- Does the app collect user data? → **No** (all data stays on the device or goes only to the email provider chosen by the user;
  the developer receives nothing).
- Does the app share data with third parties? → **No**.
- Is data encrypted in transit? → **Yes**.
- Can users request deletion? → Remove the account in the app / uninstall the app.

## Foreground service declaration (Play Console → App content → Foreground services)
Type “remoteMessaging”: the app keeps an IMAP IDLE connection to the user's own email server open so new emails are
reported immediately (push). Users can turn this off in Settings → “Instant notifications”; the app then checks every 15 minutes.
Video: open Settings, toggle push on/off, send an email to the account, the notification appears immediately.

## Screenshots
`screenshots/en/` – inbox, newsletters, conversation, settings, setup, rules, out-of-office.
