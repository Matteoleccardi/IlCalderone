<?php
declare(strict_types=1);

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('Il Calderone needs PHP 8.1 or newer (this server has ' . PHP_VERSION . ')');
}

require __DIR__ . '/lib/Util.php';
require __DIR__ . '/lib/Messages.php';
require __DIR__ . '/lib/Http.php';
require __DIR__ . '/lib/Store.php';
require __DIR__ . '/lib/FileSessions.php';
require __DIR__ . '/lib/Auth.php';
require __DIR__ . '/lib/App.php';

/** Build the application (used by index.php and the bin/ CLI scripts). */
function calderone_app(): App
{
    $config = require __DIR__ . '/config.php';
    date_default_timezone_set($config['timezone'] ?? 'UTC');
    $store = new Store(rtrim($config['data_dir'], '/'));
    $app = new App($config, $store, new Auth($store, $config));
    $app->loadModules();
    return $app;
}
