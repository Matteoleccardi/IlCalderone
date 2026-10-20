<?php
declare(strict_types=1);

/**
 * Accounts, sessions and CSRF.
 *  - users.json holds every account; passwords use PHP password_hash (bcrypt/argon, portable across hosts).
 *  - Session files live in data/sessions so they survive host quirks and move with the data folder.
 *  - CSRF: Angular's HttpClient reads the XSRF-TOKEN cookie and echoes it in X-XSRF-TOKEN on every mutating request.
 */
final class Auth
{
    public const USERS = 'users.json';
    /** Interface languages of the web app (user preference stored in users.json). */
    public const LANGS = ['it', 'en', 'de', 'fr'];

    /**
     * A colour theme preference {light, dark, mode} as the web app sends it, or null (reset / invalid).
     * Theme ids are only checked for shape: the web app knows the list and falls back to its defaults.
     */
    public static function cleanTheme(mixed $t): ?array
    {
        if (!is_array($t)) {
            return null;
        }
        $id = fn($v) => is_string($v) && preg_match('/^[a-z0-9-]{1,40}$/', $v) ? $v : null;
        $light = $id($t['light'] ?? null);
        $dark = $id($t['dark'] ?? null);
        if ($light === null || $dark === null) {
            return null;
        }
        $mode = in_array($t['mode'] ?? null, ['auto', 'light', 'dark'], true) ? $t['mode'] : 'auto';
        return ['light' => $light, 'dark' => $dark, 'mode' => $mode];
    }
    private ?array $user = null;
    private bool $loaded = false;

    public function __construct(private Store $store, private array $config)
    {
    }

    public function start(): void
    {
        $dir = $this->store->path('sessions');
        if (!is_dir($dir)) {
            mkdir($dir, 0770, true);
        }
        session_save_path($dir);
        session_name('calderone');
        session_set_cookie_params([
            'lifetime' => 60 * 60 * 24 * 30,
            'path' => $this->cookiePath(),
            'secure' => $this->https(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
        ini_set('session.use_strict_mode', '1');
        session_start();
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        setcookie('XSRF-TOKEN', $_SESSION['csrf'], [
            'path' => $this->cookiePath(), 'secure' => $this->https(), 'httponly' => false, 'samesite' => 'Lax',
        ]);
    }

    /** Cookie path = the folder the app is installed in (parent of /api). */
    private function cookiePath(): string
    {
        $script = $_SERVER['SCRIPT_NAME'] ?? '/api/index.php';
        $pos = strrpos($script, '/api/');
        return $pos === false ? '/' : (substr($script, 0, $pos) ?: '') . '/';
    }

    private function https(): bool
    {
        if (isset($this->config['https_only'])) {
            return (bool) $this->config['https_only'];
        }
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    }

    public function checkCsrf(Request $req): void
    {
        if (in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        $sent = $_SERVER['HTTP_X_XSRF_TOKEN'] ?? '';
        if (!is_string($sent) || !hash_equals($_SESSION['csrf'] ?? '', $sent)) {
            throw new HttpError(403, 'csrf');
        }
    }

    // ---------- users ----------

    public function users(): array
    {
        return $this->store->read(self::USERS, ['format' => 'calderone-users/1', 'users' => []])['users'];
    }

    public function needsSetup(): bool
    {
        return count($this->users()) === 0;
    }

    public function findUser(string $id): ?array
    {
        foreach ($this->users() as $u) {
            if ($u['id'] === $id) {
                return $u;
            }
        }
        return null;
    }

    public function findByUsername(string $username): ?array
    {
        $key = Util::lower(trim($username));
        foreach ($this->users() as $u) {
            if (Util::lower($u['username']) === $key) {
                return $u;
            }
        }
        return null;
    }

    public static function publicUser(array $u): array
    {
        return ['id' => $u['id'], 'username' => $u['username'], 'display' => $u['display'] ?: $u['username'], 'admin' => (bool) $u['admin'],
            'lang' => $u['lang'] ?? null, 'theme' => $u['theme'] ?? null];
    }

    public function createUser(string $username, string $password, string $display = '', bool $admin = false): array
    {
        $username = trim($username);
        if (!preg_match('/^[\p{L}\p{N}._-]{3,32}$/u', $username)) {
            throw new HttpError(400, 'username_invalid');
        }
        self::checkPassword($password);
        return $this->store->locked(function () use ($username, $password, $display, $admin) {
            if ($this->findByUsername($username)) {
                throw new HttpError(409, 'username_taken');
            }
            $u = [
                'id' => Util::id(), 'username' => $username, 'display' => Util::clip(trim($display), 60),
                'password_hash' => password_hash($password, PASSWORD_DEFAULT), 'admin' => $admin, 'created' => Util::now(),
            ];
            $this->store->update(self::USERS, function ($d) use ($u) {
                $d['users'][] = $u;
                return $d;
            }, ['format' => 'calderone-users/1', 'users' => []]);
            return $u;
        });
    }

    public static function checkPassword(string $password): void
    {
        if (strlen($password) < 8) {
            throw new HttpError(400, 'password_short');
        }
    }

    public function updateUser(string $id, callable $fn): array
    {
        $out = null;
        $this->store->update(self::USERS, function ($d) use ($id, $fn, &$out) {
            foreach ($d['users'] as &$u) {
                if ($u['id'] === $id) {
                    $u = $fn($u);
                    $out = $u;
                }
            }
            return $d;
        });
        if ($out === null) {
            throw new HttpError(404, 'user_not_found');
        }
        return $out;
    }

    public function deleteUser(string $id): void
    {
        $this->store->update(self::USERS, function ($d) use ($id) {
            $d['users'] = array_values(array_filter($d['users'], fn($u) => $u['id'] !== $id));
            return $d;
        });
    }

    // ---------- session ----------

    public function user(): ?array
    {
        if (!$this->loaded) {
            $this->loaded = true;
            $id = $_SESSION['uid'] ?? null;
            $this->user = is_string($id) ? $this->findUser($id) : null;
        }
        return $this->user;
    }

    public function require(): array
    {
        $u = $this->user();
        if (!$u) {
            throw new HttpError(401, 'login_required');
        }
        return $u;
    }

    public function requireAdmin(): array
    {
        $u = $this->require();
        if (empty($u['admin'])) {
            throw new HttpError(403, 'admin_only');
        }
        return $u;
    }

    public function login(string $username, string $password): array
    {
        $this->throttle();
        $u = $this->findByUsername($username);
        if (!$u || !password_verify($password, $u['password_hash'])) {
            $this->recordFailure();
            throw new HttpError(401, 'bad_credentials');
        }
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            $this->updateUser($u['id'], fn($x) => ['password_hash' => password_hash($password, PASSWORD_DEFAULT)] + $x);
        }
        $this->signIn($u);
        return $u;
    }

    public function signIn(array $u): void
    {
        session_regenerate_id(true);
        $_SESSION['uid'] = $u['id'];
        $this->user = $u;
        $this->loaded = true;
    }

    public function logout(): void
    {
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        $this->user = null;
    }

    // ---------- login throttling: max 10 failures per IP per 15 minutes ----------

    private function ipKey(): string
    {
        return substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '?') . '|calderone'), 0, 16);
    }

    private function throttle(): void
    {
        $d = $this->store->read('ratelimit.json', []);
        $recent = array_filter($d[$this->ipKey()] ?? [], fn($t) => $t > time() - 900);
        if (count($recent) >= 10) {
            throw new HttpError(429, 'too_many_attempts');
        }
    }

    private function recordFailure(): void
    {
        $key = $this->ipKey();
        $this->store->update('ratelimit.json', function ($d) use ($key) {
            $d = is_array($d) ? $d : [];
            foreach ($d as $k => $times) { // prune
                $d[$k] = array_values(array_filter($times, fn($t) => $t > time() - 900));
                if (!$d[$k]) {
                    unset($d[$k]);
                }
            }
            $d[$key][] = time();
            return $d;
        }, []);
    }
}
