<?php
declare(strict_types=1);

// Core: session, first-run setup, login/logout, accounts (admin), households, self-check.
return [
    'name' => 'core',
    'label' => 'Base',
    'register' => function (App $app) {
        $auth = $app->auth;
        $store = $app->store;
        $HH = 'households.json';
        $hhDefault = ['format' => 'calderone-households/1', 'households' => []];

        $session = function () use ($app, $auth) {
            $u = $auth->user();
            return [
                'version' => App::VERSION,
                'needs_setup' => $auth->needsSetup(),
                'user' => $u ? Auth::publicUser($u) : null,
                'modules' => array_values(array_filter(array_keys($app->modules), fn($m) => $m !== 'core')),
            ];
        };

        $app->get('/session', fn() => $session());

        $app->post('/setup', function (Request $r) use ($auth, $store, $session) {
            return $store->locked(function () use ($r, $auth, $session) {
                if (!$auth->needsSetup()) {
                    throw new HttpError(409, 'setup_done');
                }
                $u = $auth->createUser($r->str('username', 32), (string) ($r->json()['password'] ?? ''), $r->str('display', 60), true);
                $auth->signIn($u);
                return $session();
            });
        });

        $app->post('/login', function (Request $r) use ($auth, $session) {
            $auth->login($r->str('username', 64), (string) ($r->json()['password'] ?? ''));
            return $session();
        });

        $app->post('/logout', function () use ($auth, $session) {
            $auth->logout();
            return $session();
        });

        $app->post('/me/password', function (Request $r) use ($auth) {
            $u = $auth->require();
            $old = (string) ($r->json()['old'] ?? '');
            $new = (string) ($r->json()['new'] ?? '');
            if (!password_verify($old, $u['password_hash'])) {
                throw new HttpError(400, 'password_wrong');
            }
            Auth::checkPassword($new);
            $auth->updateUser($u['id'], fn($x) => ['password_hash' => password_hash($new, PASSWORD_DEFAULT)] + $x);
            return ['ok' => true];
        });

        // Display name and interface language (only the fields that are sent change).
        $app->put('/me', function (Request $r) use ($auth) {
            $u = $auth->require();
            $body = $r->json();
            $set = [];
            if (array_key_exists('display', $body)) {
                $set['display'] = $r->str('display', 60);
            }
            if (array_key_exists('lang', $body)) {
                $set['lang'] = in_array($body['lang'], Auth::LANGS, true) ? $body['lang'] : null;
            }
            return Auth::publicUser($auth->updateUser($u['id'], fn($x) => $set + $x));
        });

        // ---------- accounts (admin) ----------

        $app->get('/users', function () use ($auth) {
            $auth->requireAdmin();
            return array_map(fn($u) => Auth::publicUser($u) + ['created' => $u['created'] ?? null], $auth->users());
        });

        $app->post('/users', function (Request $r) use ($auth) {
            $auth->requireAdmin();
            $u = $auth->createUser($r->str('username', 32), (string) ($r->json()['password'] ?? ''), $r->str('display', 60), !empty($r->json()['admin']));
            return Auth::publicUser($u);
        });

        $app->post('/users/{id}/password', function (Request $r, array $p) use ($auth) {
            $auth->requireAdmin();
            $new = (string) ($r->json()['password'] ?? '');
            Auth::checkPassword($new);
            $auth->updateUser($p['id'], fn($x) => ['password_hash' => password_hash($new, PASSWORD_DEFAULT)] + $x);
            return ['ok' => true];
        });

        $app->delete('/users/{id}', function (Request $r, array $p) use ($auth, $app) {
            $me = $auth->requireAdmin();
            if ($p['id'] === $me['id']) {
                throw new HttpError(400, 'cannot_delete_self');
            }
            $auth->deleteUser($p['id']);
            $app->emit('user.deleted', $p['id']);
            return ['ok' => true];
        });

        // ---------- households ----------

        $view = function (array $h) use ($app) {
            $names = $app->userNames();
            $h['members'] = array_map(fn($m) => $m + ['display' => $names[$m['user']] ?? null], $h['members']);
            return $h;
        };

        $findHH = function (string $id) use ($app): array {
            foreach ($app->households() as $h) {
                if ($h['id'] === $id) {
                    return $h;
                }
            }
            throw new HttpError(404, 'household_not_found');
        };

        $saveHH = function (string $id, ?array $new) use ($store, $HH, $hhDefault) {
            $store->update($HH, function ($d) use ($id, $new) {
                $d['households'] = array_values(array_filter(array_map(
                    fn($h) => $h['id'] === $id ? $new : $h, $d['households'])));
                return $d;
            }, $hhDefault);
        };

        $app->get('/households', function () use ($auth, $app, $view) {
            $u = $auth->require();
            $mine = $app->householdIds($u);
            return array_values(array_map($view, array_filter($app->households(), fn($h) => in_array($h['id'], $mine, true))));
        });

        $app->post('/households', function (Request $r) use ($auth, $store, $HH, $hhDefault, $view) {
            $u = $auth->require();
            $name = Util::squash($r->str('name', 80));
            if ($name === '') {
                throw new HttpError(400, 'household_name_required');
            }
            $h = ['id' => Util::id(), 'name' => $name, 'created' => Util::now(), 'members' => [['user' => $u['id'], 'role' => 'owner']]];
            $store->update($HH, function ($d) use ($h) {
                $d['households'][] = $h;
                return $d;
            }, $hhDefault);
            return $view($h);
        });

        $app->post('/households/{id}/members', function (Request $r, array $p) use ($auth, $findHH, $saveHH, $view, $store) {
            $u = $auth->require();
            return $store->locked(function () use ($r, $p, $u, $auth, $findHH, $saveHH, $view) {
                $h = $findHH($p['id']);
                $role = null;
                foreach ($h['members'] as $m) {
                    if ($m['user'] === $u['id']) {
                        $role = $m['role'];
                    }
                }
                if ($role !== 'owner') {
                    throw new HttpError(403, 'household_owner_only');
                }
                $other = $auth->findByUsername($r->str('username', 64));
                if (!$other) {
                    throw new HttpError(404, 'household_no_user');
                }
                if (in_array($other['id'], array_column($h['members'], 'user'), true)) {
                    throw new HttpError(409, 'household_already_member');
                }
                $h['members'][] = ['user' => $other['id'], 'role' => 'member'];
                $saveHH($h['id'], $h);
                return $view($h);
            });
        });

        // Owner removes a member, or a member leaves. If the last member leaves the household is deleted.
        $app->delete('/households/{id}/members/{uid}', function (Request $r, array $p) use ($auth, $findHH, $saveHH, $store, $app) {
            $u = $auth->require();
            return $store->locked(function () use ($p, $u, $findHH, $saveHH, $app) {
                $h = $findHH($p['id']);
                $roles = array_column($h['members'], 'role', 'user');
                if ($p['uid'] !== $u['id'] && ($roles[$u['id']] ?? null) !== 'owner') {
                    throw new HttpError(403, 'household_owner_only');
                }
                $h['members'] = array_values(array_filter($h['members'], fn($m) => $m['user'] !== $p['uid']));
                if (!$h['members']) {
                    $saveHH($h['id'], null);
                    $app->emit('household.deleted', $h['id']);
                    return ['ok' => true, 'deleted' => true];
                }
                if (!in_array('owner', array_column($h['members'], 'role'), true)) {
                    $h['members'][0]['role'] = 'owner'; // ownership passes to the oldest member
                }
                $saveHH($h['id'], $h);
                return ['ok' => true, 'deleted' => false];
            });
        });

        $app->on('user.deleted', function (string $uid) use ($app, $store, $HH, $hhDefault) {
            $store->update($HH, function ($d) use ($uid) {
                foreach ($d['households'] as &$h) {
                    $h['members'] = array_values(array_filter($h['members'], fn($m) => $m['user'] !== $uid));
                    if ($h['members'] && !in_array('owner', array_column($h['members'], 'role'), true)) {
                        $h['members'][0]['role'] = 'owner';
                    }
                }
                $d['households'] = array_values(array_filter($d['households'], fn($h) => $h['members']));
                return $d;
            }, $hhDefault);
        });

        // ---------- self-check (admin): is the data folder private and writable? ----------

        // Each check: {name: code, ok, detail: code, params}. The web app translates "check.<name>" / "check.<detail>".
        $app->get('/selfcheck', function () use ($auth, $app, $store) {
            $auth->requireAdmin();
            $checks = [];
            $add = function (string $name, bool $ok, string $detail, array $params = []) use (&$checks) {
                $checks[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail, 'params' => (object) $params];
            };
            $add('php', PHP_VERSION_ID >= 80100, 'value', ['value' => PHP_VERSION]);
            $probe = $store->path('.write-test');
            $writable = @file_put_contents($probe, 'ok') !== false;
            @unlink($probe);
            $add('writable', $writable, 'value', ['value' => $store->dir]);

            $inWebRoot = realpath($store->dir) === realpath(__DIR__ . '/../../../data');
            if (!$inWebRoot) {
                $add('private', true, 'private_outside');
            } elseif (PHP_SAPI === 'cli-server') {
                $add('private', true, 'private_devserver');
            } else {
                $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
                $script = $_SERVER['SCRIPT_NAME'] ?? '/api/index.php';
                $base = substr($script, 0, (int) strrpos($script, '/api/'));
                $url = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $base . '/data/users.json';
                $status = null;
                if (function_exists('curl_init')) {
                    $c = curl_init($url);
                    curl_setopt_array($c, [CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5]);
                    curl_exec($c);
                    $status = curl_getinfo($c, CURLINFO_HTTP_CODE) ?: null;
                } elseif (ini_get('allow_url_fopen')) {
                    $h = @get_headers($url);
                    $status = $h && preg_match('/\s(\d{3})\s/', $h[0], $m) ? (int) $m[1] : null;
                }
                if ($status === null) {
                    $add('private', false, 'private_unknown', ['url' => $url]);
                } elseif ($status === 200) {
                    $add('private', false, 'private_exposed', ['url' => $url]);
                } else {
                    $add('private', true, 'private_status', ['url' => $url, 'status' => $status]);
                }
            }
            $add('modules', true, 'value', ['value' => implode(', ', array_keys($app->modules))]);
            $add('gd', true, function_exists('imagecreatefromstring') ? 'gd_yes' : 'gd_no');
            return $checks;
        });
    },
];
