<?php
declare(strict_types=1);

/**
 * JSON-file storage. Every entity is a pretty-printed UTF-8 JSON file under the data folder.
 * Writes are atomic (temp file + rename) and serialised by one exclusive lock — plenty for a few dozen users.
 */
final class Store
{
    private $lock = null;
    private int $depth = 0;

    public function __construct(public readonly string $dir)
    {
    }

    public function path(string $rel): string
    {
        if (str_contains($rel, '..') || str_starts_with($rel, '/')) {
            throw new InvalidArgumentException("bad path {$rel}");
        }
        return $this->dir . '/' . $rel;
    }

    public function exists(string $rel): bool
    {
        return is_file($this->path($rel));
    }

    public function read(string $rel, mixed $default = null): mixed
    {
        $p = $this->path($rel);
        if (!is_file($p)) {
            return $default;
        }
        $data = json_decode((string) file_get_contents($p), true);
        if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException("corrupt JSON file {$rel}: " . json_last_error_msg());
        }
        return $data;
    }

    public function write(string $rel, mixed $data): void
    {
        $p = $this->path($rel);
        $dir = dirname($p);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("cannot create {$dir}");
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION);
        $tmp = $p . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($tmp, $json . "\n") === false || !rename($tmp, $p)) {
            @unlink($tmp);
            throw new RuntimeException("cannot write {$rel}");
        }
    }

    public function delete(string $rel): void
    {
        $p = $this->path($rel);
        if (is_file($p)) {
            unlink($p);
        }
    }

    /** Delete a sub-folder with everything in it (e.g. the history of a deleted recipe). */
    public function deleteDir(string $relDir): void
    {
        $root = $this->path($relDir);
        if (!is_dir($root)) {
            return;
        }
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) {
            $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        }
        rmdir($root);
    }

    /** Names (without .json) of the JSON files in a sub-folder. */
    public function list(string $relDir): array
    {
        $files = glob($this->path($relDir) . '/*.json') ?: [];
        return array_map(fn($f) => basename($f, '.json'), $files);
    }

    /** Run $fn while holding the global write lock (re-entrant). */
    public function locked(callable $fn): mixed
    {
        if ($this->depth === 0) {
            if (!is_dir($this->dir)) {
                mkdir($this->dir, 0775, true);
            }
            $this->lock = fopen($this->dir . '/.lock', 'c');
            flock($this->lock, LOCK_EX);
        }
        $this->depth++;
        try {
            return $fn();
        } finally {
            $this->depth--;
            if ($this->depth === 0) {
                flock($this->lock, LOCK_UN);
                fclose($this->lock);
                $this->lock = null;
            }
        }
    }

    /** Read-modify-write a file under the lock. $fn receives the current value and returns the new one. */
    public function update(string $rel, callable $fn, mixed $default = null): mixed
    {
        return $this->locked(function () use ($rel, $fn, $default) {
            $new = $fn($this->read($rel, $default));
            $this->write($rel, $new);
            return $new;
        });
    }
}
