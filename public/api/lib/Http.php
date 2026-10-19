<?php
declare(strict_types=1);

/**
 * An error that becomes the JSON response {"error": English text, "code": code, "params": {...}} with the given status.
 * $code is a key of Messages::EN; the web app shows its own translation of it.
 */
final class HttpError extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode, public readonly array $params = [])
    {
        parent::__construct(Messages::text($errorCode, $params));
    }

    public function body(): array
    {
        return ['error' => $this->getMessage(), 'code' => $this->errorCode, 'params' => (object) $this->params];
    }
}

final class Request
{
    private ?array $json = null;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
    ) {
    }

    public static function fromGlobals(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        return new self($method, self::apiPath(), $_GET);
    }

    /**
     * The route path after ".../api", so the app works at the domain root or in any sub-folder, with or without
     * URL rewriting: "/x/api/recipes", "/x/api/index.php/recipes" and "/x/api/index.php?route=/recipes" all give "/recipes".
     */
    public static function apiPath(): string
    {
        if (isset($_GET['route'])) {
            return '/' . ltrim((string) $_GET['route'], '/');
        }
        $uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
        $pos = strrpos($uri, '/api/index.php');
        if ($pos !== false) {
            $rest = substr($uri, $pos + strlen('/api/index.php'));
        } else {
            $pos = strpos($uri, '/api/');
            $rest = $pos !== false ? substr($uri, $pos + 4) : (str_ends_with($uri, '/api') ? '/' : $uri);
        }
        $rest = '/' . trim($rest, '/');
        return $rest;
    }

    /** The largest request body PHP accepts (post_max_size), in bytes. 0 or unparsable means no limit: 64 MB then. */
    public static function maxBody(): int
    {
        $v = trim((string) ini_get('post_max_size'));
        $n = (int) $v;
        $mult = ['k' => 1024, 'm' => 1048576, 'g' => 1073741824][strtolower(substr($v, -1))] ?? 1;
        return $n > 0 ? $n * $mult : 64 * 1048576;
    }

    /** Decoded JSON body (an object/array); {} when empty. */
    public function json(): array
    {
        if ($this->json === null) {
            $raw = file_get_contents('php://input') ?: '';
            $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
            if ($raw === '' && $length > 0 && $length > self::maxBody()) {
                // PHP drops a body larger than post_max_size: say so instead of acting on an empty request
                throw new HttpError(413, 'request_too_large', ['mb' => round(self::maxBody() / 1048576, 1)]);
            }
            if (trim($raw) === '') {
                $this->json = $_POST;
            } else {
                $data = json_decode($raw, true);
                if (!is_array($data)) {
                    throw new HttpError(400, 'bad_json');
                }
                $this->json = $data;
            }
        }
        return $this->json;
    }

    public function str(string $key, int $max = 200, string $default = ''): string
    {
        $v = $this->json()[$key] ?? $default;
        if (!is_scalar($v)) {
            throw new HttpError(400, 'bad_field', ['field' => $key]);
        }
        return Util::clip(trim((string) $v), $max);
    }

    public function q(string $key, string $default = ''): string
    {
        $v = $this->query[$key] ?? $default;
        return is_string($v) ? trim($v) : $default;
    }
}

final class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        exit;
    }

    /** Stream a file (photos), with private caching. */
    public static function file(string $path, string $mime): never
    {
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: private, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        readfile($path);
        exit;
    }

    public static function download(mixed $data, string $filename): never
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION);
        exit;
    }
}
