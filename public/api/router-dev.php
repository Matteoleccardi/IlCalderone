<?php
// Router for PHP's built-in development server (it ignores .htaccess):
//   php -S localhost:8080 -t public public/api/router-dev.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
if (preg_match('#^/data(/|$)#', $path) || (preg_match('#^/api/#', $path) && $path !== '/api/index.php' && str_ends_with($path, '.php'))) {
    http_response_code(403);
    exit;
}
if (preg_match('#^/api(/|$)#', $path)) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require __DIR__ . '/index.php';
    return true;
}
$file = __DIR__ . '/..' . $path;
if ($path !== '/' && is_file($file)) {
    return false; // let the built-in server send the static file
}
$index = __DIR__ . '/../index.html';
if (is_file($index)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($index);
} else {
    header('Content-Type: text/plain; charset=utf-8');
    echo "Il Calderone API is running. Build the web app with: cd web && npm run build\n";
}
return true;
