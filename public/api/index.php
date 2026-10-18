<?php
declare(strict_types=1);

// Front controller: every /api/... request ends here (via .htaccess, the dev router, or /api/index.php/...).
require __DIR__ . '/bootstrap.php';

ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

try {
    $app = calderone_app();
    $req = Request::fromGlobals();
    $app->auth->start();
    $app->auth->checkCsrf($req);
    $result = $app->dispatch($req);
    Response::json($result ?? ['ok' => true]);
} catch (HttpError $e) {
    Response::json($e->body(), $e->status);
} catch (Throwable $e) {
    error_log('[calderone] ' . $e);
    Response::json((new HttpError(500, 'internal'))->body(), 500);
}
