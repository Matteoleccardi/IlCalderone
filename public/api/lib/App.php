<?php
declare(strict_types=1);

/**
 * Router + module registry + event hooks.
 *
 * A module is a folder modules/<name>/ whose module.php returns
 *   ['name' => 'x', 'label' => 'X', 'requires' => ['recipes'], 'register' => function (App $app) { ... }]
 * register() adds routes ($app->get/post/put/delete) and event listeners ($app->on('recipe.deleted', fn)).
 */
final class App
{
    public const VERSION = '0.3.0';

    private array $routes = [];
    private array $listeners = [];
    /** @var array<string,array> */
    public array $modules = [];
    /** Shared services that modules expose to each other, e.g. $app->services['recipes']. */
    public array $services = [];

    public function __construct(public readonly array $config, public readonly Store $store, public readonly Auth $auth)
    {
    }

    public function loadModules(): void
    {
        $wanted = array_values(array_unique(array_merge(['core'], $this->config['modules'])));
        $defs = [];
        foreach ($wanted as $name) {
            if (!preg_match('/^[a-z0-9_]+$/', $name)) {
                continue;
            }
            $file = __DIR__ . "/../modules/{$name}/module.php";
            if (!is_file($file)) {
                throw new RuntimeException("modulo sconosciuto: {$name}");
            }
            $defs[$name] = require $file;
        }
        // register in dependency order
        $done = [];
        $visit = function (string $n, array $stack = []) use (&$visit, &$done, $defs) {
            if (isset($done[$n])) {
                return;
            }
            if (!isset($defs[$n])) {
                throw new RuntimeException("modulo richiesto ma non attivo: {$n}");
            }
            if (in_array($n, $stack, true)) {
                throw new RuntimeException("dipendenza circolare tra moduli: {$n}");
            }
            foreach ($defs[$n]['requires'] ?? [] as $dep) {
                $visit($dep, [...$stack, $n]);
            }
            $done[$n] = true;
            ($defs[$n]['register'])($this);
            $this->modules[$n] = ['name' => $n, 'label' => $defs[$n]['label'] ?? $n];
        };
        foreach (array_keys($defs) as $n) {
            $visit($n);
        }
    }

    // ---------- routes ----------

    public function route(string $method, string $pattern, callable $handler): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[A-Za-z0-9_.-]+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler];
    }

    public function get(string $p, callable $h): void { $this->route('GET', $p, $h); }
    public function post(string $p, callable $h): void { $this->route('POST', $p, $h); }
    public function put(string $p, callable $h): void { $this->route('PUT', $p, $h); }
    public function delete(string $p, callable $h): void { $this->route('DELETE', $p, $h); }

    public function dispatch(Request $req): mixed
    {
        $allowed = false;
        foreach ($this->routes as [$method, $regex, $handler]) {
            if (preg_match($regex, $req->path, $m)) {
                if ($method !== $req->method) {
                    $allowed = true;
                    continue;
                }
                $params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
                return $handler($req, $params);
            }
        }
        throw new HttpError($allowed ? 405 : 404, $allowed ? 'method_not_allowed' : 'not_found');
    }

    // ---------- events ----------

    public function on(string $event, callable $fn): void
    {
        $this->listeners[$event][] = $fn;
    }

    public function emit(string $event, mixed ...$args): void
    {
        foreach ($this->listeners[$event] ?? [] as $fn) {
            $fn(...$args);
        }
    }

    // ---------- households (core; used by every permission check) ----------

    public function households(): array
    {
        return $this->store->read('households.json', ['format' => 'calderone-households/1', 'households' => []])['households'];
    }

    /** Ids of the households the user belongs to. */
    public function householdIds(array $user): array
    {
        $ids = [];
        foreach ($this->households() as $h) {
            foreach ($h['members'] as $m) {
                if ($m['user'] === $user['id']) {
                    $ids[] = $h['id'];
                }
            }
        }
        return $ids;
    }

    /** Can $user see an item with owner/visibility/household fields (recipes, collections, …)? */
    public function canView(array $user, array $item): bool
    {
        return ($item['owner'] ?? null) === $user['id']
            || ($item['visibility'] ?? '') === 'shared'
            || (($item['visibility'] ?? '') === 'household' && in_array($item['household'] ?? null, $this->householdIds($user), true));
    }

    /**
     * Can $user change an item? The owner always can; for household items every member of that household can too
     * (recipes keep a history of these edits). Shared and private items: only the owner.
     */
    public function canEdit(array $user, array $item): bool
    {
        return $this->isOwner($user, $item)
            || (($item['visibility'] ?? '') === 'household' && in_array($item['household'] ?? null, $this->householdIds($user), true));
    }

    public function isOwner(array $user, array $item): bool
    {
        return ($item['owner'] ?? null) === $user['id'];
    }

    public function household(string $id): ?array
    {
        foreach ($this->households() as $h) {
            if ($h['id'] === $id) {
                return $h;
            }
        }
        return null;
    }

    /** User ids of the members of a household. */
    public function memberIds(string $householdId): array
    {
        return array_column($this->household($householdId)['members'] ?? [], 'user');
    }

    /** The user plus everyone who shares a household with them (whose diaries they may read). */
    public function peerIds(array $user): array
    {
        $ids = [$user['id']];
        foreach ($this->householdIds($user) as $hid) {
            $ids = array_merge($ids, $this->memberIds($hid));
        }
        return array_values(array_unique($ids));
    }

    /**
     * A "space" owns menus, pantries and shopping lists: either the user's personal space ("me", an implicit
     * household with just them, like a Linux user's own group) or one of their households.
     * Returns ['id' => 'me'|householdId, 'key' => 'u-<userId>'|'h-<householdId>' (file names), 'household', 'name'].
     */
    public function space(array $user, string $id): array
    {
        if ($id === '' || $id === 'me') {
            return ['id' => 'me', 'key' => 'u-' . $user['id'], 'household' => null, 'name' => null];
        }
        $h = $this->household($id);
        if (!$h || !in_array($user['id'], array_column($h['members'], 'user'), true)) {
            throw new HttpError(404, 'household_not_found');
        }
        return ['id' => $h['id'], 'key' => 'h-' . $h['id'], 'household' => $h['id'], 'name' => $h['name']];
    }

    /** The personal space first, then the user's households. */
    public function spaces(array $user): array
    {
        $out = [$this->space($user, 'me')];
        foreach ($this->householdIds($user) as $hid) {
            $out[] = $this->space($user, $hid);
        }
        return $out;
    }

    /**
     * Validate visibility + household chosen by a user. A missing/unknown visibility becomes $fallback (recipes use
     * 'shared'); "household" without a household of the user becomes private.
     */
    public function cleanScope(array $user, mixed $visibility, mixed $household, string $fallback = 'private'): array
    {
        $visibility = in_array($visibility, ['private', 'household', 'shared'], true) ? $visibility : $fallback;
        $mine = $this->householdIds($user);
        if ($visibility === 'household') {
            if (!in_array($household, $mine, true)) {
                $household = $mine[0] ?? null;
            }
            if ($household === null) {
                $visibility = 'private';
            }
        } else {
            $household = null;
        }
        return [$visibility, $household];
    }

    /** id → display name, for showing owners. */
    public function userNames(): array
    {
        $out = [];
        foreach ($this->auth->users() as $u) {
            $out[$u['id']] = $u['display'] ?: $u['username'];
        }
        return $out;
    }
}
