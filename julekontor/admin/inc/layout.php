<?php
/* Gemeinsames Aussehen aller Admin-Seiten. */
declare(strict_types=1);

function page_head(string $title): void { ?>
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= h($title) ?> · Julekontor Admin</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎅</text></svg>">
<link rel="stylesheet" href="admin.css?v=2">
<script src="assets/scanner.js?v=2" defer></script>
</head>
<?php }

function flash_box(): void {
    if ($f = flash()) echo '<div class="flash ' . h($f['type']) . '" role="status">' . h($f['msg']) . '</div>';
}

function page_auth(string $title, string $sub, string $error, bool $setup): void {
    page_head($title); ?>
<body class="auth">
<main class="auth-card">
  <div class="brand">Julekontor</div>
  <h1><?= h($title) ?></h1>
  <p class="muted"><?= h($sub) ?></p>
  <?php flash_box(); ?>
  <?php if ($error): ?><div class="flash err" role="alert"><?= h($error) ?></div><?php endif; ?>
  <form method="post" action="./?p=<?= h($setup ? 'setup' : ($_GET['p'] ?? 'login')) ?>">
    <?= csrf_field() ?>
    <label>E-Mail<input type="email" name="email" autocomplete="username" required autofocus value="<?= h($_POST['email'] ?? '') ?>"></label>
    <label>Passwort<input type="password" name="password" autocomplete="<?= $setup ? 'new-password' : 'current-password' ?>" required <?= $setup ? 'minlength="10"' : '' ?>></label>
    <?php if ($setup): ?>
    <label>Passwort wiederholen<input type="password" name="password2" autocomplete="new-password" required minlength="10"></label>
    <?php endif; ?>
    <button class="btn" type="submit"><?= $setup ? 'Konto anlegen' : 'Anmelden' ?></button>
  </form>
</main>
</body>
</html>
<?php }

function page_start(string $active, string $title): void {
    page_head($title);
    $u = current_user(); ?>
<body>
<header class="top">
  <button class="menu-btn" type="button" aria-label="Menü" aria-expanded="false" onclick="var o=document.body.classList.toggle('nav-open');this.setAttribute('aria-expanded',o)">☰</button>
  <a class="brand" href="./">Julekontor <span>Admin</span></a>
  <a class="view-site" href="../" target="_blank" rel="noopener">Website ansehen ↗</a>
</header>
<div class="shell">
  <nav class="side" aria-label="Bereiche">
    <?php $g = null; foreach (JK_MODULES as $id => $m): if (!can($id)) continue; ?>
      <?php if ($m['group'] !== $g): $g = $m['group']; if ($g !== ''): ?><div class="nav-group"><?= h($g) ?></div><?php endif; endif; ?>
      <a href="<?= h($m['href'] ?? './?p=' . $id) ?>" class="<?= $id === $active ? 'active' : '' ?> <?= $m['ready'] ? '' : 'soon' ?> <?= $id === 'kasse' ? 'nav-kasse' : '' ?>"<?= $id === $active ? ' aria-current="page"' : '' ?>>
        <span class="ic" aria-hidden="true"><?= $m['icon'] ?></span><?= h($m['title']) ?>
        <?php if (!$m['ready']): ?><small>bald</small><?php endif; ?>
      </a>
    <?php endforeach; ?>
    <form method="post" action="./?p=logout" class="logout">
      <?= csrf_field() ?>
      <span class="muted small"><?= h(user_name($u)) ?><?= role() === 'kasse' ? ' · Kasse' : '' ?></span>
      <button type="submit" class="btn ghost small">Abmelden</button>
    </form>
  </nav>
  <main class="content<?= !empty($GLOBALS['wide']) ? ' wide' : '' ?>">
    <h1><?= h($title) ?></h1>
    <?php flash_box();
}

function page_end(): void { ?>
  </main>
</div>
</body>
</html>
<?php }
