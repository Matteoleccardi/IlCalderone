<?php
// Create an account from the command line:  php public/api/bin/create-user.php USERNAME [--admin] [--display "Nome"]
// The password is asked interactively (or read from the CALDERONE_PASSWORD environment variable).
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { exit; }
require __DIR__ . '/../bootstrap.php';

$args = array_slice($argv, 1);
$username = $args[0] ?? null;
if (!$username || str_starts_with($username, '-')) {
    fwrite(STDERR, "usage: php create-user.php USERNAME [--admin] [--display NAME]\n");
    exit(2);
}
$admin = in_array('--admin', $args, true);
$di = array_search('--display', $args, true);
$display = $di !== false ? (string) ($args[$di + 1] ?? '') : '';
$password = getenv('CALDERONE_PASSWORD') ?: '';
if ($password === '') {
    fwrite(STDOUT, 'Password: ');
    if (DIRECTORY_SEPARATOR === '/') { shell_exec('stty -echo'); }
    $password = trim((string) fgets(STDIN));
    if (DIRECTORY_SEPARATOR === '/') { shell_exec('stty echo'); }
    fwrite(STDOUT, "\n");
}
try {
    $app = calderone_app();
    $u = $app->auth->createUser($username, $password, $display, $admin || $app->auth->needsSetup());
    echo "created {$u['username']} ({$u['id']})" . ($u['admin'] ? ' [admin]' : '') . "\n";
} catch (HttpError $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
